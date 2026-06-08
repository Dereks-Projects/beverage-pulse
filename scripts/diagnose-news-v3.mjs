// scripts/diagnose-news-v3.mjs
// ==========================================================================
// READ-ONLY News diagnostic, round 3. No database, no writes.
//
// PURPOSE:
//   Confirm the proposed production query form before we commit it. Rounds 1
//   and 2 proved the current term is too narrow and that the fix is a quoted
//   name plus the specific qualifier. This round builds that EXACT query for
//   each brand and runs it, so what you see here is what the service will do.
//
// THE PROPOSED QUERY (buildNewsQuery below, also going into the real fix):
//   Quote the display name, then append the specific qualifier already in the
//   brand's searchTerm (the words that are not part of the name). Examples:
//     campari        -> "Campari" liqueur
//     prime          -> "Prime" energy drink
//     white claw     -> "White Claw" seltzer
//     patron         -> "Patrón" tequila      (accent preserved in the phrase)
//     1800           -> "1800" tequila
//   Accent and case differences between the name and the searchTerm are
//   normalized only for deciding which words are the qualifier; the original
//   display name is what gets quoted.
//
// HOW TO READ IT:
//   We want the distinctive names (Campari, Jim Beam, Hennessy, Grand Marnier,
//   White Claw, Crown Royal, Topo Chico) to PASS with a baseline of 3 or more,
//   and the collision names (Prime, Corona, Modelo, Patrón, 1800) to PASS
//   WITHOUT the noise signature. NOISE/STARVED is flagged when nearly all
//   articles are crammed into the recent window with an empty baseline, which
//   is what a polluted common-word query looks like.
//
// SAFETY:
//   Read-only. Fetches public RSS feeds and prints. No database access.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/diagnose-news-v3.mjs
// ==========================================================================

import { XMLParser } from 'fast-xml-parser';
import { getSearchTerm, getDisplayName } from '../lib/taxonomy.js';

const TEST_BRANDS = [
  // Distinctive names that should pass on the quoted phrase
  'campari',
  'jim beam',
  'hennessy',
  'grand marnier',
  'white claw',
  'crown royal',
  'topo chico',
  // Collision names that must pass WITHOUT the noise signature
  'prime',
  'corona',
  'modelo',
  'patron',
  '1800',
];

const MIN_BASELINE_ARTICLES = 3;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

const DAY = 24 * 60 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Strip accents and lowercase, for word comparison only.
function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Build the proposed News query: quoted display name + specific qualifier.
// This is the exact logic that will go into lib/googleTrends.js.
function buildNewsQuery(name) {
  const display = getDisplayName(name, 'brand');
  const searchTerm = getSearchTerm(name);

  const displayWords = new Set(
    normalize(display).split(/\s+/).filter(Boolean)
  );

  const qualifier = searchTerm
    .split(/\s+/)
    .filter((w) => w && !displayWords.has(normalize(w)))
    .join(' ');

  return qualifier ? `"${display}" ${qualifier}` : `"${display}"`;
}

async function fetchArticleDates(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = await response.text();
  const parsed = xmlParser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];

  const itemArray = Array.isArray(items) ? items : [items];
  return itemArray
    .map((item) => new Date(item.pubDate))
    .filter((d) => !isNaN(d.getTime()));
}

function bucket(dates) {
  const now = Date.now();
  const thirty = now - 30 * DAY;
  const ninety = now - 90 * DAY;

  const recent = dates.filter((d) => d.getTime() >= thirty).length;
  const baseline = dates.filter(
    (d) => d.getTime() >= ninety && d.getTime() < thirty
  ).length;
  const older = dates.filter((d) => d.getTime() < ninety).length;

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const oldest = sorted.length ? sorted[0].toISOString().slice(0, 10) : 'none';
  const newest = sorted.length
    ? sorted[sorted.length - 1].toISOString().slice(0, 10)
    : 'none';

  return { total: dates.length, recent, baseline, older, oldest, newest };
}

async function main() {
  console.log('READ-ONLY News diagnostic v3. No database, no writes.\n');
  console.log(`Baseline floor for a value: ${MIN_BASELINE_ARTICLES} articles in the 31-90 day window.`);
  console.log('Query form: quoted display name + specific qualifier (the production form).\n');

  for (const brand of TEST_BRANDS) {
    const query = buildNewsQuery(brand);

    let tag = '';
    try {
      const b = bucket(await fetchArticleDates(query));
      const pass = b.baseline >= MIN_BASELINE_ARTICLES ? 'PASS' : 'BELOW FLOOR';
      const noise =
        b.total > 0 && b.baseline < MIN_BASELINE_ARTICLES && b.recent / b.total >= 0.8
          ? '  <-- NOISE/STARVED'
          : '';
      tag =
        `total ${String(b.total).padStart(3)}  ` +
        `recent ${String(b.recent).padStart(3)}  ` +
        `baseline ${String(b.baseline).padStart(3)}  ` +
        `older ${String(b.older).padStart(3)}  ` +
        `[${b.oldest} .. ${b.newest}]  ${pass}${noise}`;
    } catch (err) {
      tag = `FETCH FAILED: ${err.message}`;
    }

    console.log(`${brand.padEnd(15)} ${query.padEnd(30)} ${tag}`);
    await delay(1500);
  }

  console.log('\nDone. No writes performed.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err.message);
  process.exit(1);
});
