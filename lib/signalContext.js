// lib/signalContext.js
// ==========================================================================
// Signal context (the comparison layer).
//
// PURE module. No database, no AI, no network. It takes the set of ranked
// brands the analysis run is about to write, and for each brand computes
// where it stands against (a) its own category and (b) the whole ranked
// field, on each of the four signals. It also reads the recent history of
// each signal into a plain trajectory word, derives a short "what is this"
// descriptor from the search term the brand already carries, attaches the
// category backdrop (the brand's category direction and shape, pulled from
// the report), and flags the genuine standouts.
//
// WHY THIS EXISTS:
//   The writer was analyzing each brand alone, with nothing to compare it
//   to, so it could only say "rising" or "cooling." Handed the position of
//   a brand inside its category and the field, the same writer can say
//   "the steepest press climb in non-alc," a claim only the data can make.
//   The category backdrop adds the second reference the four signals lack:
//   whether the brand is moving with its category or against it. This module
//   is that fuel. It does the math once per run; the analysis service
//   attaches each brand its block and feeds it to the model.
//
// IT DECIDES NOTHING ABOUT RANK OR PROSE:
//   Position is not ranking. A brand can lead its category on one signal
//   and still rank low overall. This module only reports where things
//   stand. The ranking rule already set the order; the writer picks words.
//
// TUNING:
//   The thresholds that decide what counts as a standout are named
//   constants below. They are a conservative starting point; the right
//   values reveal themselves after a week of real scores. Changing them
//   changes only which facts are flagged for the writer, never the rank.
// ==========================================================================

import { getBrandCategory, getDisplayName, getSearchTerm } from './taxonomy.js';
import { getSubCategory } from './subCategory.js';
import categoryBackdrop from './categoryBackdrop.json' with { type: 'json' };

// --------------------------------------------------------------------------
// Tunable configuration
// --------------------------------------------------------------------------

// Most recent history points to read per signal (match the ranker/writer).
const MAX_HISTORY_POINTS = 6;

// Fewer than this many history points is too little to call a trajectory.
const MIN_POINTS_FOR_TRAJECTORY = 3;

// A signal is a category standout only when the brand sits first in a
// category large enough for "first" to actually mean something.
const MIN_GROUP_FOR_STANDOUT = 4;

// A signal is a field standout only when the brand sits in the top slice
// of a field large enough for that slice to mean something.
const MIN_FIELD_FOR_STANDOUT = 8;
const TOP_PERCENTILE = 90;

// The four signals, with the record field that holds the current value,
// the record field that holds its history, the plain unit, and the side
// of the push/pull lens it belongs to. Higher is always "more" on every
// axis, so a single descending sort is correct for all four.
const SIGNAL_DEFS = [
  { key: 'buzz',      valueField: 'score',             historyField: 'scoreHistory',     unit: 'level',   group: 'push' },
  { key: 'news',      valueField: 'newsVelocity',      historyField: 'newsHistory',      unit: 'percent', group: 'push' },
  { key: 'social',    valueField: 'socialVelocity',    historyField: 'youtubeHistory',   unit: 'percent', group: 'pull' },
  { key: 'wikitrend', valueField: 'wikipediaVelocity', historyField: 'wikipediaHistory', unit: 'percent', group: 'pull' },
];

// Closed vocabulary of beverage "type" words, used to pull a short
// "what is this" descriptor out of the search term a brand already carries
// (for example "Poppi prebiotic soda" yields "prebiotic soda"). Multi-word
// phrases are listed first so the longest match wins. This is a small,
// generic list that covers every category. It is not a per-brand table.
const TYPE_PHRASES = [
  'non-alcoholic beer', 'non-alcoholic wine', 'non-alcoholic spirits', 'non-alcoholic spirit',
  'prebiotic soda', 'sparkling water', 'ranch water', 'hard seltzer', 'canned cocktail',
  'energy drink', 'coffee liqueur', 'iced tea vodka', 'hard kombucha', 'hard lemonade',
  'hard cider', 'hard tea', 'cannabis soda', 'botanic spirits', 'sparkling wine',
  'thc beverage', 'thc seltzer', 'thc drink', 'cbd',
  'vodka', 'gin', 'rum', 'tequila', 'mezcal', 'bourbon', 'whiskey', 'whisky', 'scotch', 'rye',
  'cognac', 'brandy', 'liqueur', 'amaro', 'aperitif', 'vermouth', 'sake', 'soju', 'absinthe',
  'beer', 'ale', 'ipa', 'lager', 'stout', 'porter', 'pilsner', 'cider',
  'wine', 'champagne', 'prosecco', 'cava', 'rosé', 'rose', 'riesling',
  'seltzer', 'cocktail', 'cocktails', 'tea', 'lemonade', 'soda', 'water',
  'kombucha', 'cannabis', 'refresher', 'refreshers',
];

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

// Pull a clean array of the most recent numeric history values.
function recentValues(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history
    .slice(-MAX_HISTORY_POINTS)
    .map((h) => h.value)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
}

// Reduce a signal's recent history to one plain word describing its shape.
// Conservative on purpose: too little history reads as "insufficient", and
// we never invent a trend the points do not show.
function trajectoryOf(history) {
  const vals = recentValues(history);
  const n = vals.length;
  if (n < MIN_POINTS_FOR_TRAJECTORY) return 'insufficient';

  const range = Math.max(...vals) - Math.min(...vals);
  if (range === 0) return 'flat';

  const deltas = [];
  for (let i = 1; i < n; i += 1) deltas.push(vals[i] - vals[i - 1]);

  let signChanges = 0;
  for (let i = 1; i < deltas.length; i += 1) {
    const a = deltas[i - 1];
    const b = deltas[i];
    if ((a > 0 && b < 0) || (a < 0 && b > 0)) signChanges += 1;
  }
  if (n >= 4 && signChanges >= Math.ceil((deltas.length - 1) / 2)) return 'choppy';

  const net = vals[n - 1] - vals[0];
  if (net > 0) return 'rising';
  if (net < 0) return 'falling';
  return 'steady';
}

// Find the best "what is this" descriptor inside a search term. Padding
// with spaces gives word-boundary behavior without regular expressions, so
// "rye" inside another word cannot match. Returns null when nothing fits,
// which is the safe failure: no identity beats a wrong identity.
function findType(term) {
  if (!term || typeof term !== 'string') return null;
  const hay = ` ${term.toLowerCase()} `;
  for (const phrase of TYPE_PHRASES) {
    if (hay.includes(` ${phrase} `)) return phrase;
  }
  return null;
}

function extractIdentity(name) {
  return findType(getSearchTerm(name));
}

// Look up the category backdrop for a brand: the brand-neutral read on its
// category's direction and shape. Returns { subCategory, direction, posture }
// or null when the brand has no backdrop key or that key is not in the
// report. Direction and shape only; it never carries figures or brand names.
function backdropFor(name) {
  const subCategory = getSubCategory(name);
  if (!subCategory) return null;
  const entry = categoryBackdrop.categories ? categoryBackdrop.categories[subCategory] : null;
  if (!entry) return null;
  return { subCategory, direction: entry.direction, posture: entry.posture };
}

// Rank a list of working rows on one signal, descending, counting only the
// rows that actually have a value for it. Returns a Map of name to position.
function rankList(rows, key) {
  const present = rows.filter((r) => r.values[key] !== null);
  present.sort((a, b) => b.values[key] - a.values[key]);

  const of = present.length;
  const map = new Map();
  present.forEach((r, i) => {
    const rank = i + 1;
    const percentile = of > 1 ? Math.round(((of - rank) / (of - 1)) * 100) : 100;
    map.set(r.name, { rank, of, percentile });
  });
  return map;
}

// --------------------------------------------------------------------------
// Main entry point.
//
// buildSignalContext(records)
//   records: array of brand records (the ranked set about to be written).
//   returns: Map of brand name to its context block.
//
// Each context block is data only, shaped for the writer:
//   { name, displayName, identity, category, backdrop, signals, concordance }
// where signals[key] carries the brand's category and field position on
// that signal, its current direction, its trajectory, and two standout
// flags. A missing signal is reported as { present: false }, never zero.
// --------------------------------------------------------------------------
export function buildSignalContext(records) {
  const list = Array.isArray(records) ? records : [];

  // Build one working row per brand: identity, category, and the current
  // value of each signal (null when missing, never coerced to zero).
  const rows = list.map((rec) => {
    const cat = getBrandCategory(rec.name);
    const values = {};
    for (const def of SIGNAL_DEFS) {
      const v = rec[def.valueField];
      values[def.key] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    return {
      name: rec.name,
      displayName: getDisplayName(rec.name, 'brand'),
      identity: extractIdentity(rec.name),
      categoryId: cat ? cat.id : null,
      categoryLabel: cat ? cat.label : null,
      record: rec,
      values,
    };
  });

  // Group rows by category once, so category ranking does not re-scan.
  const byCategory = new Map();
  for (const r of rows) {
    const key = r.categoryId || '__uncategorized__';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(r);
  }

  // Precompute field and category positions per signal.
  const fieldPos = {};
  const categoryPos = {};
  for (const def of SIGNAL_DEFS) {
    fieldPos[def.key] = rankList(rows, def.key);

    const catMap = new Map();
    for (const group of byCategory.values()) {
      const groupMap = rankList(group, def.key);
      for (const [name, pos] of groupMap) catMap.set(name, pos);
    }
    categoryPos[def.key] = catMap;
  }

  // Assemble each brand's context block.
  const context = new Map();
  for (const r of rows) {
    const signals = {};

    for (const def of SIGNAL_DEFS) {
      const value = r.values[def.key];
      if (value === null) {
        signals[def.key] = { present: false, unit: def.unit, group: def.group };
        continue;
      }

      const field = fieldPos[def.key].get(r.name) || null;
      const category = categoryPos[def.key].get(r.name) || null;
      const trajectory = trajectoryOf(r.record[def.historyField]);

      // Direction is meaningful only for the velocity signals (percent
      // change versus baseline). Buzz is a level, so it has no direction;
      // its movement reads from trajectory instead.
      const direction =
        def.unit === 'percent'
          ? value > 0
            ? 'rising'
            : value < 0
              ? 'falling'
              : 'flat'
          : null;

      const leadsCategory = !!(category && category.rank === 1 && category.of >= MIN_GROUP_FOR_STANDOUT);
      const topOfField = !!(field && field.of >= MIN_FIELD_FOR_STANDOUT && field.percentile >= TOP_PERCENTILE);

      signals[def.key] = {
        present: true,
        unit: def.unit,
        group: def.group,
        direction,
        trajectory,
        category, // { rank, of, percentile } within its own category
        field, // { rank, of, percentile } within the whole ranked field
        leadsCategory,
        topOfField,
      };
    }

    // Concordance across the three momentum signals (news, social,
    // wikitrend). Buzz is the activity floor, not a momentum signal, so it
    // is excluded here. This mirrors the lens the ranking rule uses.
    const momentum = ['news', 'social', 'wikitrend']
      .map((k) => signals[k])
      .filter((s) => s && s.present);

    const concordance = {
      momentumPresent: momentum.length,
      momentumRising: momentum.filter((s) => s.direction === 'rising').length,
      momentumFalling: momentum.filter((s) => s.direction === 'falling').length,
    };

    context.set(r.name, {
      name: r.name,
      displayName: r.displayName,
      identity: r.identity,
      category: { id: r.categoryId, label: r.categoryLabel },
      backdrop: backdropFor(r.name),
      signals,
      concordance,
    });
  }

  return context;
}