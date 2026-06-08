// scripts/diagnose-news.mjs
// ==========================================================================
// READ-ONLY News diagnostic. No database, no writes.
//
// PURPOSE:
//   Several major brands (Campari, Jim Beam, Hennessy, White Claw, Prime)
//   came back below the News floor, which is not believable. This script
//   confirms WHY before we change the method, so we fix the real cause.
//
// WHAT IT DOES:
//   For each suspect brand it fetches the Google News RSS feed twice:
//     - DISAMBIGUATED: the exact search term the service uses
//       (for example "Campari liqueur"), via getSearchTerm
//     - BARE: just the brand name (for example "Campari")
//   For each, it buckets the returned articles into the same windows the
//   service uses (recent: last 30 days; baseline: 31-90 days ago; older:
//   90+ days) and prints the counts, plus the oldest and newest article
//   dates and the total returned.
//
// HOW TO READ IT (the three hypotheses this separates):
//   1. FEED CAP STARVES BASELINE: total is near 100 and almost all of it is
//      in the recent window, baseline near 0. The feed returns only the most
//      recent ~100 items, so a busy brand's recent flood crowds the baseline
//      out. The floor then fails a brand that is actually loud.
//   2. SEARCH TERM TOO NARROW: the disambiguated term returns few articles
//      but the bare name returns many with a healthy baseline. The category
//      word is suppressing real coverage.
//   3. GENUINELY THIN: both queries return few articles. The null was honest.
//   The service needs a baseline of at least 3 articles to produce a value.
//
// SAFETY:
//   Read-only. It only fetches public RSS feeds and prints. It does not touch
//   the database. Network access is required (it runs on your machine).
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/diagnose-news.mjs
//   (the --env-file is harmless here; this script reads no secrets)
// ==========================================================================

import { XMLParser } from 'fast-xml-parser';
import { getSearchTerm } from '../lib/taxonomy.js';

// Brands News wrongly called thin, worth confirming.
const SUSPECTS = ['campari', 'jim beam', 'hennessy', 'white claw', 'prime'];

// Matches the service's floor, for reference in the output.
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

// Fetch the feed for a query and return an array of article Date objects.
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

// Bucket dates into the service's windows.
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

function line(label, b) {
  const pass = b.baseline >= MIN_BASELINE_ARTICLES ? 'PASS' : 'BELOW FLOOR';
  return (
    `    ${label.padEnd(15)} total ${String(b.total).padStart(3)}  ` +
    `recent ${String(b.recent).padStart(3)}  ` +
    `baseline ${String(b.baseline).padStart(3)}  ` +
    `older ${String(b.older).padStart(3)}  ` +
    `[${b.oldest} .. ${b.newest}]  ${pass}`
  );
}

async function main() {
  console.log('READ-ONLY News diagnostic. No database, no writes.\n');
  console.log(`Baseline floor for a value: ${MIN_BASELINE_ARTICLES} articles in the 31-90 day window.\n`);

  for (const brand of SUSPECTS) {
    const disambiguated = getSearchTerm(brand);
    console.log('='.repeat(78));
    console.log(`${brand}`);

    try {
      const disDates = await fetchArticleDates(disambiguated);
      console.log(line(`"${disambiguated}"`, bucket(disDates)));
    } catch (err) {
      console.log(`    disambiguated query FAILED: ${err.message}`);
    }

    await delay(2000);

    try {
      const bareDates = await fetchArticleDates(brand);
      console.log(line(`"${brand}" (bare)`, bucket(bareDates)));
    } catch (err) {
      console.log(`    bare query FAILED: ${err.message}`);
    }

    await delay(2000);
  }

  console.log('='.repeat(78));
  console.log('\nDone. No writes performed.');
}

main().catch((err) => {
  console.error('Diagnostic failed:', err.message);
  process.exit(1);
});
