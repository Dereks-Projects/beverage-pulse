// scripts/run-gate.mjs
// ==========================================================================
// READ-ONLY gate dry run.
//
// PURPOSE:
//   Run the gate against the current Reddit and Wikipedia data and show the
//   cut, without changing anything. This is the view you use to tune the
//   floor in lib/gate.js before any collector or the ranker depends on it.
//
// WHAT IT SHOWS:
//   - the current floor values (the dial)
//   - how many brands survive, and whether they survived on Reddit, on
//     Wikipedia, or on both
//   - survivors broken down by category (watch for any category dropping
//     to zero, which would tell us the gate needs per-category protection)
//   - the bubble: the strongest brands that just missed the cut, on each
//     signal, so you can judge whether the floor is in the right place
//
// SAFETY:
//   Strictly read-only. Uses find().lean() and buildGate(), which writes
//   nothing.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/run-gate.mjs
// ==========================================================================

import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.js';
import BrandTrend from '../models/BrandTrend.js';
import { buildGate, passesGate, GATE_CONFIG } from '../lib/gate.js';

function pad(s, n) {
  return String(s).padEnd(n);
}

async function main() {
  console.log('READ-ONLY gate dry run. No writes.\n');

  console.log('Gate floor (the dial):');
  console.log(`  minRedditScore:        ${GATE_CONFIG.minRedditScore}`);
  console.log(`  minWikipediaPageviews: ${GATE_CONFIG.minWikipediaPageviews}\n`);

  const { summary } = await buildGate();

  console.log(`Universe:   ${summary.universeSize} brands`);
  console.log(`Survivors:  ${summary.survivorCount}`);
  console.log(`  via Reddit only:    ${summary.passedRedditOnly}`);
  console.log(`  via Wikipedia only: ${summary.passedWikiOnly}`);
  console.log(`  via both:           ${summary.passedBoth}\n`);

  console.log('Survivors by category:');
  const cats = Object.entries(summary.categoryCounts).sort((a, b) => b[1] - a[1]);
  for (const [cat, n] of cats) {
    console.log(`  ${pad(cat, 16)} ${n}`);
  }

  // The bubble: who just missed. One more read (read-only) to surface the
  // strongest cut brands on each signal, so the floor can be judged.
  await connectToDatabase();
  const all = await BrandTrend.find().lean();
  const cut = all.filter((r) => !passesGate(r).survives);

  const byReddit = cut
    .filter((r) => typeof r.score === 'number' && r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const byWiki = cut
    .filter((r) => typeof r.wikipediaPageviews === 'number' && r.wikipediaPageviews > 0)
    .sort((a, b) => b.wikipediaPageviews - a.wikipediaPageviews)
    .slice(0, 10);

  console.log('\nJust below the floor, highest Reddit score among the cut:');
  for (const r of byReddit) {
    console.log(
      `  ${pad(r.name, 22)} reddit ${Math.round(r.score)}  wiki pv ${r.wikipediaPageviews ?? 0}`
    );
  }

  console.log('\nJust below the floor, highest Wikipedia pageviews among the cut:');
  for (const r of byWiki) {
    console.log(
      `  ${pad(r.name, 22)} wiki pv ${r.wikipediaPageviews ?? 0}  reddit ${Math.round(r.score || 0)}`
    );
  }

  console.log('\nDone. No writes performed.');
}

main()
  .catch((err) => {
    console.error('Gate dry run failed:', err.message);
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
