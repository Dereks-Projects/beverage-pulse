// scripts/run-gate.mjs
// ==========================================================================
// READ-ONLY gate dry run.
//
// PURPOSE:
//   Run the two-stage gate against the current Reddit and Wikipedia data and
//   show the cut, without changing anything. This is the view you use to
//   tune minLiveness in lib/gate.js before any collector or the ranker
//   depends on it.
//
// WHAT IT SHOWS:
//   - the dial: the two eligibility floors, minLiveness, and minPerCategory
//   - how many brands are eligible, how many survive, and how they were
//     admitted: by the global dial or by the category guarantee
//   - the door breakdown: survivors carried by Reddit only, Wikipedia only,
//     or both
//   - survivors by category
//   - the bubble: the weakest dial survivors just above the dial and the
//     strongest near-misses just below it
//   - the bottom of the room: the lowest-liveness survivors, each tagged
//     [dial] or [guarantee], so you can see the guarantee admits sit at the
//     bottom, not the top
//   - the guarantee-only admits, listed in full, the honesty proof that the
//     guarantee only decides who is in the room
//   - a both-doors-open check: the strongest Reddit-only and Wikipedia-only
//     survivors
//
// WHAT THIS LAYER CAN AND CANNOT PROVE:
//   It proves guaranteed brands enter at the bottom on presence (their
//   liveness is below the dial by construction). It does NOT set the final
//   board order. The AI ranker does that later, on momentum across all four
//   signals, so a thin guaranteed brand ranks low there as well.
//
// SAFETY:
//   Strictly read-only. Uses buildGate(), which only reads and writes
//   nothing.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/run-gate.mjs
// ==========================================================================

import mongoose from 'mongoose';
import { buildGate, GATE_CONFIG } from '../lib/gate.js';

function pad(s, n) {
  return String(s).padEnd(n);
}

function padNum(n, width) {
  return String(n).padStart(width);
}

// Format one scored brand as a single readable row. Optionally tag how it
// was admitted.
function row(s, withTag = false) {
  const r = padNum(Math.round(s.redditScore), 4);
  const rp = padNum(Math.round(s.redditStanding * 100), 3);
  const w = padNum(Math.round(s.wikiPageviews), 7);
  const wp = padNum(Math.round(s.wikiStanding * 100), 3);
  const live = padNum(Math.round(s.liveness * 100), 3);
  const tag = withTag ? `  [${s.admittedBy || 'cut'}]` : '';
  return `  ${pad(s.name, 22)} ${pad(s.categoryId, 10)} R ${r} (${rp}%)  W ${w} (${wp}%)  live ${live}%${tag}`;
}

async function main() {
  console.log('READ-ONLY gate dry run. No writes.\n');

  console.log('Gate dial:');
  console.log(`  minRedditScore (floor):        ${GATE_CONFIG.minRedditScore}`);
  console.log(`  minWikipediaPageviews (floor): ${GATE_CONFIG.minWikipediaPageviews}`);
  console.log(`  minLiveness (survival):        ${GATE_CONFIG.minLiveness}  (${Math.round(GATE_CONFIG.minLiveness * 100)} of 100 combined standing)`);
  console.log(`  minPerCategory (guarantee):    ${GATE_CONFIG.minPerCategory}\n`);

  const { summary, scored } = await buildGate();

  console.log(`Universe:    ${summary.universeSize} brands`);
  console.log(`Eligible:    ${summary.eligibleCount}  (cleared an absolute floor)`);
  console.log(`Survivors:   ${summary.survivorCount}`);
  console.log(`  admitted by dial:      ${summary.admittedByDial}`);
  console.log(`  admitted by guarantee: ${summary.admittedByGuarantee}  (below the dial, kept for category coverage)`);
  console.log(`  via Reddit only:    ${summary.passedRedditOnly}`);
  console.log(`  via Wikipedia only: ${summary.passedWikiOnly}`);
  console.log(`  via both:           ${summary.passedBoth}\n`);

  console.log('Survivors by category:');
  const cats = Object.entries(summary.categoryCounts).sort((a, b) => b[1] - a[1]);
  for (const [cat, n] of cats) {
    console.log(`  ${pad(cat, 16)} ${n}`);
  }

  // The bubble around the dial, dial admits only, so we judge minLiveness.
  const byLiveness = [...scored].sort((a, b) => b.liveness - a.liveness);
  const dialSurvivors = byLiveness.filter((s) => s.survivesDial);
  const cut = byLiveness.filter((s) => !s.survives);

  console.log('\nWeakest dial survivors, just above the dial:');
  for (const s of dialSurvivors.slice(-8)) console.log(row(s));

  console.log('\nStrongest near-misses, just below the dial (and not guaranteed):');
  for (const s of cut.slice(0, 8)) console.log(row(s));

  // Bottom of the room: the lowest-liveness SURVIVORS, tagged by admit path.
  // The guarantee admits should cluster here, proving they enter low.
  const survivorsByLiveness = byLiveness.filter((s) => s.survives);
  console.log('\nBottom of the room, lowest-liveness survivors:');
  for (const s of survivorsByLiveness.slice(-12)) console.log(row(s, true));

  // The honesty proof: every brand admitted ONLY by the guarantee, in full.
  // By construction each is below the dial, so each is among the weakest in
  // the room. The ranker orders them on momentum, so thin ones rank low.
  const guaranteeOnly = survivorsByLiveness
    .filter((s) => s.admittedBy === 'guarantee')
    .sort((a, b) => a.liveness - b.liveness);
  console.log(`\nAdmitted ONLY by the category guarantee (${guaranteeOnly.length}), all below the dial:`);
  if (guaranteeOnly.length === 0) console.log('  none (every category filled itself on the dial)');
  else for (const s of guaranteeOnly) console.log(row(s));

  // Both-doors-open check.
  const redditOnly = survivorsByLiveness
    .filter((s) => s.redditScore > 0 && !(s.wikiPageviews > 0))
    .sort((a, b) => b.liveness - a.liveness);
  const wikiOnly = survivorsByLiveness
    .filter((s) => s.wikiPageviews > 0 && !(s.redditScore > 0))
    .sort((a, b) => b.liveness - a.liveness);

  console.log('\nDoor check, Reddit-only survivors (no Wikipedia page):');
  if (redditOnly.length === 0) console.log('  NONE -- the Reddit door is shut.');
  else for (const s of redditOnly.slice(0, 5)) console.log(row(s));

  console.log('\nDoor check, Wikipedia-only survivors (no Reddit conversation):');
  if (wikiOnly.length === 0) console.log('  NONE -- the Wikipedia door is shut.');
  else for (const s of wikiOnly.slice(0, 5)) console.log(row(s));

  const bothOpen = redditOnly.length > 0 && wikiOnly.length > 0;
  console.log(
    `\nBoth single-signal doors open: ${bothOpen ? 'YES' : 'NO'}  ` +
    `(Reddit-only ${redditOnly.length}, Wikipedia-only ${wikiOnly.length})`
  );

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
