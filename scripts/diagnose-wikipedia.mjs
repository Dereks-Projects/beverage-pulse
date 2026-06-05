// scripts/diagnose-wikipedia.mjs
// ==========================================================================
// READ-ONLY Wikipedia coverage census across the full brand universe.
//
// PURPOSE:
//   Quantify how trustworthy Wikipedia is as a gate signal. For every brand
//   it classifies the Wikipedia state, tallies overall and per category, and
//   surfaces the dangerous population: brands alive on Reddit but blind on
//   Wikipedia, which a Wikipedia-heavy gate would wrongly drop.
//
// STATES (per brand):
//   HAS DATA      - wikipediaPageviews is a real number > 0
//   EMPTY         - pageviews null or 0 but the brand was checked: no usable
//                   number (no article, a 404, or genuinely near-zero views)
//   NEVER CHECKED - no pageviews, no history, no timestamp
//
// CAVEAT:
//   EMPTY vs NEVER CHECKED depends on whether the Wikipedia cron stamps its
//   timestamp on a 404 or empty result, which we have not verified. The raw
//   evidence is printed, so the split is a read, not an assertion.
//
// SAFETY:
//   Strictly read-only. find().lean(), no writes.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/diagnose-wikipedia.mjs
// ==========================================================================

import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getBrandCategory, getWikipediaTitle, BRAND_TAXONOMY } from '../lib/taxonomy.js';

function pad(s, n) {
  return String(s).padEnd(n);
}

function wikiState(r) {
  const pv = r.wikipediaPageviews;
  if (typeof pv === 'number' && pv > 0) return 'HAS DATA';
  const checked =
    !!r.lastWikipediaUpdate ||
    (Array.isArray(r.wikipediaHistory) && r.wikipediaHistory.length > 0);
  return checked ? 'EMPTY' : 'NEVER CHECKED';
}

function hasExplicitTitle(name) {
  const entry = BRAND_TAXONOMY[name.toLowerCase()];
  return !!(entry && entry.wikipediaTitle);
}

async function main() {
  await connectToDatabase();
  console.log('READ-ONLY Wikipedia coverage census. No writes.\n');

  const all = await BrandTrend.find().lean();

  const stateCount = { 'HAS DATA': 0, EMPTY: 0, 'NEVER CHECKED': 0 };
  const byCategory = {}; // cat -> { total, hasData }
  const redditAliveWikiBlind = [];

  for (const r of all) {
    const state = wikiState(r);
    stateCount[state]++;

    const cat = getBrandCategory(r.name);
    const key = cat ? cat.id : 'uncategorized';
    if (!byCategory[key]) byCategory[key] = { total: 0, hasData: 0 };
    byCategory[key].total++;
    if (state === 'HAS DATA') byCategory[key].hasData++;

    const reddit = typeof r.score === 'number' ? r.score : 0;
    if (reddit > 0 && state !== 'HAS DATA') {
      redditAliveWikiBlind.push({ name: r.name, reddit, state });
    }
  }

  const total = all.length;
  const hasData = stateCount['HAS DATA'];
  const pct = total ? Math.round((hasData / total) * 100) : 0;

  console.log(`Universe: ${total} brands`);
  console.log(`  HAS DATA (usable pageviews): ${hasData} (${pct}%)`);
  console.log(`  EMPTY (checked, no number):  ${stateCount.EMPTY}`);
  console.log(`  NEVER CHECKED:               ${stateCount['NEVER CHECKED']}\n`);

  console.log('Usable Wikipedia coverage by category:');
  const catRows = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);
  for (const [cat, c] of catRows) {
    const cpct = c.total ? Math.round((c.hasData / c.total) * 100) : 0;
    console.log(`  ${pad(cat, 16)} ${c.hasData}/${c.total} (${cpct}%)`);
  }

  redditAliveWikiBlind.sort((a, b) => b.reddit - a.reddit);
  console.log(
    `\nAlive on Reddit but blind on Wikipedia: ${redditAliveWikiBlind.length} brands`
  );
  console.log('(the early movers a Wikipedia-heavy gate would wrongly drop)');
  console.log('Top 20 by Reddit score:');
  for (const b of redditAliveWikiBlind.slice(0, 20)) {
    const title = getWikipediaTitle(b.name, 'brand');
    const titleKind = hasExplicitTitle(b.name) ? 'explicit' : 'fallback';
    console.log(
      `  ${pad(b.name, 20)} reddit ${Math.round(b.reddit)}  [${b.state}]  ` +
      `title: "${title}" (${titleKind})`
    );
  }

  console.log('\nDone. No writes performed.');
}

main()
  .catch((err) => {
    console.error('Wikipedia census failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore close errors
    }
    process.exit(process.exitCode || 0);
  });
