// scripts/diagnose-news-v2.mjs
// ==========================================================================
// READ-ONLY News diagnostic, round 2. No database, no writes.
//
// PURPOSE:
//   Round 1 proved the current search term is too narrow: the category word
//   suppresses real coverage, so the feed backfills with ancient articles and
//   the baseline window empties out. This round picks the replacement query
//   form before we commit 172 brands to it.
//
// WHAT IT DOES:
//   For each test brand it fetches the Google News RSS feed in three forms and
//   buckets the articles into the service's windows (recent: last 30 days;
//   baseline: 31-90 days; older: 90+ days):
//     A. current      - the term the service uses today (getSearchTerm)
//     B. quoted        - an exact-phrase query of the display name, "Brand"
//     C. quoted + cat  - the quoted phrase plus the category label, "Brand" beer
//
// HOW TO READ IT:
//   We want a form that gives the distinctive names (Campari, Jim Beam,
//   Hennessy, White Claw, Grand Marnier) a healthy baseline of at least 3,
//   while keeping the collision names (Prime, Corona, Modelo) from filling up
//   with noise (a baseline of zero with everything jammed into a few recent
//   days is the noise signature). The right form is the one that passes the
//   distinctive names and does NOT light up the collision names with junk.
//
// SAFETY:
//   Read-only. Fetches public RSS feeds and prints. No database access.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/diagnose-news-v2.mjs
// ==========================================================================

import { XMLParser } from 'fast-xml-parser';
import { getSearchTerm, getDisplayName, getBrandCategory } from '../lib/taxonomy.js';

// A mix on purpose: distinctive names that should pass, and collision names
// that must not fill with noise.
const TEST_BRANDS = [
  'campari',      // distinctive single word
  'jim beam',     // distinctive multi word
  'hennessy',     // distinctive single word
  'white claw',   // distinctive multi word
  'grand marnier',// distinctive multi word
  'prime',        // collision single word (Amazon Prime, etc.)
  'corona',       // collision single word (the virus, the place)
  'modelo',       // collision single word ("model" in Spanish)
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

function line(tag, query, b) {
  const pass = b.baseline >= MIN_BASELINE_ARTICLES ? 'PASS' : 'BELOW FLOOR';
  const q = `${query}`.padEnd(26);
  return (
    `    ${tag.padEnd(13)} ${q} ` +
    `total ${String(b.total).padStart(3)}  ` +
    `recent ${String(b.recent).padStart(3)}  ` +
    `baseline ${String(b.baseline).padStart(3)}  ` +
    `older ${String(b.older).padStart(3)}  ` +
    `[${b.oldest} .. ${b.newest}]  ${pass}`
  );
}

async function tryForm(tag, query) {
  try {
    const dates = await fetchArticleDates(query);
    console.log(line(tag, query, bucket(dates)));
  } catch (err) {
    console.log(`    ${tag.padEnd(13)} ${query} FAILED: ${err.message}`);
  }
  await delay(1500);
}

async function main() {
  console.log('READ-ONLY News diagnostic v2. No database, no writes.\n');
  console.log(`Baseline floor for a value: ${MIN_BASELINE_ARTICLES} articles in the 31-90 day window.\n`);

  for (const brand of TEST_BRANDS) {
    const display = getDisplayName(brand, 'brand');
    const category = getBrandCategory(brand);
    const label = category ? category.label.toLowerCase() : '';

    const formA = getSearchTerm(brand);
    const formB = `"${display}"`;
    const formC = label ? `"${display}" ${label}` : `"${display}"`;

    console.log('='.repeat(78));
    console.log(`${brand}  [${label || 'no category'}]`);

    await tryForm('A current', formA);
    await tryForm('B quoted', formB);
    await tryForm('C quoted+cat', formC);
  }

  console.log('='.repeat(78));
  console.log('\nDone. No writes performed.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err.message);
  process.exit(1);
});
