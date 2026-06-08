// lib/gate.js
// ==========================================================================
// The Gate: which brands are worth spending the rate-limited signals on.
//
// THE CORRECTED PIPELINE:
//   1. Reddit and Wikipedia sweep every brand cheaply (their crons do this).
//   2. THE GATE (this file): from those two full-coverage signals, decide
//      which brands survive.
//   3. News and YouTube collect ONLY the survivors (wired in later steps).
//   4. The AI ranks the survivors on all four signals.
//
// WHY ONLY REDDIT AND WIKIPEDIA:
//   The gate runs BEFORE News and YouTube collect, so those two signals do
//   not exist yet for most brands at gate time. The gate uses the two
//   signals that already cover every brand: Reddit conversation and
//   Wikipedia lookups. Both are presence measures (raw attention), not
//   momentum. Whether a brand is rising or falling is the ranker's job.
//
// TWO STAGES, PLUS A CATEGORY GUARANTEE:
//   Stage one, eligibility. A brand must clear a small ABSOLUTE floor on at
//   least one signal to enter the gate. Standing (stage two) is relative, so
//   without an absolute floor a dead-quiet week would let thin brands rank
//   high and pass anyway. The floor closes that hole. It mirrors the old
//   buzz floor: a few real mentions or a few hundred lookups, nothing more.
//
//   Stage two, standing. Among the eligible only, each signal becomes a
//   0-to-1 standing in the field (top of Reddit is 1, top of Wikipedia is
//   1). The two standings combine with the noisy-OR:
//
//       liveness = 1 - (1 - redditStanding) * (1 - wikiStanding)
//
//   Either signal alone can nearly max the score, both together push it
//   higher, and a missing signal contributes nothing and never drags a
//   brand down. That is what protects single-signal risers like Bardstown
//   (strong on Reddit, no Wikipedia page) and equally a Wikipedia-only
//   brand. A brand survives the dial if its liveness clears minLiveness.
//
//   Category guarantee. A pure global dial structurally suppresses the
//   newest categories, because emerging categories are thin by definition,
//   and those are exactly the categories the product exists to surface. So
//   each category is also guaranteed its top few eligible brands by
//   liveness, even when they fall below the dial.
//
//   The guarantee stays honest because it only decides who is in the room.
//   It changes no brand's liveness or standing. A guaranteed brand admitted
//   below the dial is, by construction, among the weakest in the room, and
//   the ranker still orders everyone on momentum across all four signals, so
//   a thin guaranteed brand ranks low. The gate never fakes the board.
//
// WHY STANDING, NOT RAW NUMBERS:
//   Raw pageviews run from zero to roughly 176,000 while Reddit tops out
//   near 60. Combining raw numbers lets pageviews swallow Reddit entirely,
//   and even simple min-max scaling breaks because a few giants crush
//   everyone toward zero. Standing in the field is robust to those outliers
//   and is what "alive relative to peers" should actually mean. Standing is
//   measured among the ELIGIBLE set, so dead brands do not inflate it.
//
// THE DIAL:
//   minLiveness is the single survival lever and lives in GATE_CONFIG below.
//   The two absolute floors are deliberately low; they only remove noise.
//   minPerCategory is the guarantee size. Raise minLiveness to keep fewer,
//   sharper brands; lower it to widen the net. Tune on the read-only dry run
//   before anything depends on it.
//
// PURE AND READ-ONLY:
//   buildGate() reads the stored signals and returns the survivor set. It
//   writes nothing. Collectors and the ranker call it to get their work
//   list, so there is one definition of "who is in," recomputed cheaply
//   rather than stored and risking staleness.
// ==========================================================================

import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getBrandCategory } from './taxonomy.js';

// --------------------------------------------------------------------------
// GATE_CONFIG -- the dial.
//
// minLiveness is the real lever. The two floors are eligibility only: small,
// absolute, just enough to keep a quiet week from passing noise.
// minPerCategory guarantees small categories representation. Starting
// values, meant to be tuned on the dry run.
// --------------------------------------------------------------------------
export const GATE_CONFIG = {
  // Stage one, eligibility floors. A brand must clear EITHER to enter.
  minRedditScore: 3, // a few real mentions, not a single stray hit
  minWikipediaPageviews: 100, // a few real lookups, not measurement dust

  // Stage two, the survival dial. Combined standing (0 to 1) a brand must
  // reach. Tune this number to set the survivor count.
  minLiveness: 0.55,

  // Category guarantee. Each category keeps at least this many of its own
  // liveliest eligible brands, even below the dial, so no category is
  // squeezed out. Inclusion only; it does not change any brand's standing.
  minPerCategory: 5,
};

// --------------------------------------------------------------------------
// Read a numeric field safely. Missing or non-numeric reads as 0, which the
// gate treats as "no presence on this signal."
// --------------------------------------------------------------------------
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// --------------------------------------------------------------------------
// Stage one: is one brand eligible? Clears the absolute floor on either
// signal. Per-record and field-independent, so collectors can reuse it.
// --------------------------------------------------------------------------
export function isEligible(record, config = GATE_CONFIG) {
  const redditScore = num(record.score);
  const wikiPageviews = num(record.wikipediaPageviews);
  return (
    redditScore >= config.minRedditScore ||
    wikiPageviews >= config.minWikipediaPageviews
  );
}

// --------------------------------------------------------------------------
// Standing of one value within a sorted-ascending field of values, 0 to 1.
// It is the fraction of the field at or below this value, so the top value
// scores 1. A value of 0 (the signal is absent) contributes nothing.
//
// SCALE NOTE: this is a linear scan, called once per eligible brand per
// signal. At a few hundred brands that is trivial. If the eligible set ever
// reaches the thousands, replace the scan with a binary search.
// --------------------------------------------------------------------------
function standing(value, sortedAscending) {
  if (!(value > 0) || sortedAscending.length === 0) return 0;
  let atOrBelow = 0;
  for (const v of sortedAscending) {
    if (v <= value) atOrBelow += 1;
    else break; // ascending order, nothing further can qualify
  }
  return atOrBelow / sortedAscending.length;
}

// --------------------------------------------------------------------------
// Build the survivor set.
//
// Returns { survivors, survivorNames, summary, scored }:
//   survivors     - brand records that cleared the gate (lean objects)
//   survivorNames - just the names, the work list collectors will query by
//   summary       - counts, admit and door breakdowns, per-category counts
//   scored        - every ELIGIBLE brand with its standings, liveness, and
//                   how it was admitted (dial, guarantee, or not at all),
//                   for the dry run to inspect the cut and tune the dial
//
// Reads the database. Writes nothing.
// --------------------------------------------------------------------------
export async function buildGate(config = GATE_CONFIG) {
  await connectToDatabase();

  const allBrands = await BrandTrend.find().lean();

  // Stage one: keep only the eligible, carrying the values we will need.
  const eligible = [];
  for (const record of allBrands) {
    if (!isEligible(record, config)) continue;
    const category = getBrandCategory(record.name);
    eligible.push({
      record,
      name: record.name,
      categoryId: category ? category.id : 'uncategorized',
      redditScore: num(record.score),
      wikiPageviews: num(record.wikipediaPageviews),
    });
  }

  // The field for standing: present values only, among the eligible.
  const redditField = eligible
    .map((e) => e.redditScore)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const wikiField = eligible
    .map((e) => e.wikiPageviews)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  // Stage two: standing -> noisy-OR -> liveness.
  const scored = eligible.map((e) => {
    const redditStanding = standing(e.redditScore, redditField);
    const wikiStanding = standing(e.wikiPageviews, wikiField);
    const liveness = 1 - (1 - redditStanding) * (1 - wikiStanding);
    return {
      name: e.name,
      categoryId: e.categoryId,
      redditScore: e.redditScore,
      wikiPageviews: e.wikiPageviews,
      redditStanding,
      wikiStanding,
      liveness,
      survivesDial: liveness >= config.minLiveness,
      guaranteed: false, // set below
      record: e.record,
    };
  });

  // Category guarantee: each known category keeps its top minPerCategory
  // eligible brands by liveness, even below the dial. Uncategorized brands
  // get in on the dial only. This flips an inclusion flag and nothing else.
  const byCategory = {};
  for (const s of scored) {
    if (s.categoryId === 'uncategorized') continue;
    if (!byCategory[s.categoryId]) byCategory[s.categoryId] = [];
    byCategory[s.categoryId].push(s);
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key]
      .sort((a, b) => b.liveness - a.liveness)
      .slice(0, config.minPerCategory)
      .forEach((s) => {
        s.guaranteed = true;
      });
  }

  // Final admission. A brand survives on the dial, or on the guarantee.
  // admittedBy records which, so the dry run can prove the guarantee admits
  // sit below the dial (the weakest in the room).
  for (const s of scored) {
    s.survives = s.survivesDial || s.guaranteed;
    s.admittedBy = s.survivesDial ? 'dial' : s.guaranteed ? 'guarantee' : null;
  }

  const survivorScored = scored.filter((s) => s.survives);

  // Door breakdown among survivors: which single-signal paths are open.
  let passedRedditOnly = 0;
  let passedWikiOnly = 0;
  let passedBoth = 0;
  let admittedByDial = 0;
  let admittedByGuarantee = 0;
  const categoryCounts = {};
  for (const s of survivorScored) {
    const hasReddit = s.redditScore > 0;
    const hasWiki = s.wikiPageviews > 0;
    if (hasReddit && hasWiki) passedBoth += 1;
    else if (hasReddit) passedRedditOnly += 1;
    else passedWikiOnly += 1;

    if (s.admittedBy === 'dial') admittedByDial += 1;
    else admittedByGuarantee += 1;

    categoryCounts[s.categoryId] = (categoryCounts[s.categoryId] || 0) + 1;
  }

  const survivors = survivorScored.map((s) => s.record);
  const survivorNames = survivorScored.map((s) => s.name);

  const summary = {
    universeSize: allBrands.length,
    eligibleCount: eligible.length,
    survivorCount: survivors.length,
    admittedByDial,
    admittedByGuarantee,
    passedRedditOnly,
    passedWikiOnly,
    passedBoth,
    categoryCounts,
    config: { ...config },
    timestamp: new Date().toISOString(),
  };

  return { survivors, survivorNames, summary, scored };
}