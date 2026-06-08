// scripts/diagnose-news-v4.mjs
// ==========================================================================
// READ-ONLY News diagnostic, round 4. No database, no writes.
//
// PURPOSE:
//   The live quoted-name run was a wash: it fixed the multi-word majors but
//   left Campari, Hennessy, Tanqueray, and Grand Marnier failing, and broke a
//   few single-word names. Two causes are possible and this separates them:
//
//   CAUSE A (query form): quoting a single word behaves worse in Google News
//     than the bare word. Test: bare PASSES, quoted FAILS, in isolation.
//   CAUSE B (throttle): the 172-request sequential full pass gets soft-
//     throttled and returns thinned feeds. Test: the EXACT quoted form the
//     service uses PASSES here in isolation, even though it failed in the run.
//     That means the query is fine and the long run is the problem (the cron,
//     which makes only ten requests, would not hit this).
//
// WHAT IT DOES:
//   For each brand it fetches two forms and buckets articles into the
//   service's windows (recent 30 days, baseline 31-90 days):
//     BARE   - getDisplayName with no quotes (the round-2 form Campari passed)
//     QUOTED - the exact `"DisplayName"` the service now sends
//   Reading both, in isolation, against the live result tells us which cause.
//
// SAFETY:
//   Read-only. Fetches public RSS feeds and prints. No database access.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/diagnose-news-v4.mjs
// ==========================================================================

import { XMLParser } from 'fast-xml-parser';
import { getDisplayName } from '../lib/taxonomy.js';

// Still-failing distinctive majors, two newly-broken single words, and a
// control (jim beam) that now passes in the live run.
const TEST_BRANDS = [
  'campari',
  'hennessy',
  'tanqueray',
  'grand marnier',
  'smirnoff',
  'old forester',
  '1800',
  'shiner',
  'jim beam',
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

  return { total: dates.length, recent, baseline, older };
}

function fmt(tag, query, b) {
  const pass = b.baseline >= MIN_BASELINE_ARTICLES ? 'PASS' : 'BELOW FLOOR';
  return (
    `    ${tag.padEnd(8)} ${query.padEnd(20)} ` +
    `total ${String(b.total).padStart(3)}  ` +
    `recent ${String(b.recent).padStart(3)}  ` +
    `baseline ${String(b.baseline).padStart(3)}  ` +
    `older ${String(b.older).padStart(3)}  ${pass}`
  );
}

async function tryForm(tag, query) {
  try {
    const b = bucket(await fetchArticleDates(query));
    console.log(fmt(tag, query, b));
  } catch (err) {
    console.log(`    ${tag.padEnd(8)} ${query.padEnd(20)} FETCH FAILED: ${err.message}`);
  }
  await delay(1500);
}

async function main() {
  console.log('READ-ONLY News diagnostic v4. No database, no writes.\n');
  console.log(`Baseline floor: ${MIN_BASELINE_ARTICLES} articles in the 31-90 day window.`);
  console.log('BARE vs QUOTED, in isolation. Compare QUOTED here to the live run result.\n');

  for (const brand of TEST_BRANDS) {
    const display = getDisplayName(brand, 'brand');
    console.log('='.repeat(74));
    console.log(`${brand}  (display: ${display})`);
    await tryForm('BARE', display);
    await tryForm('QUOTED', `"${display}"`);
  }

  console.log('='.repeat(74));
  console.log('\nDone. No writes performed.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err.message);
  process.exit(1);
});
