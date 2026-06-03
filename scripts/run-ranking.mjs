// scripts/run-ranking.mjs
// ==========================================================================
// One-off ranking commit, run from the terminal instead of a browser URL.
//
// WHY THIS EXISTS:
//   The ranking makes one long reasoning call over the whole pool, which
//   can run several minutes. Running that inside a browser request is
//   fragile: the request can hang or be cut off, and you cannot tell
//   whether the database write finished. A terminal script has no HTTP
//   timeout and prints the result live, so you see exactly what happened.
//
// HOW TO RUN (PowerShell, from the project root
//   C:\Dev\new-beverage-trends-app\beverage-pulse):
//
//   node --env-file=.env.local scripts/run-ranking.mjs
//
//   The --env-file flag loads your .env.local so the script reaches the
//   same Atlas database the app uses. Watch the terminal: when it finishes
//   it prints the written count, then exits on its own.
// ==========================================================================

import { rankBrands } from '../lib/aiRanking.js';

async function main() {
  console.log('Running ranking commit (dryRun: false)...');

  const result = await rankBrands({ dryRun: false });

  console.log('RESULT:');
  console.log(JSON.stringify(result, null, 2));

  if (result.ok && typeof result.written === 'number') {
    console.log(`\nDone. Wrote ${result.written} ranks to the database.`);
    process.exit(0);
  }

  console.log('\nNothing was written. See the result above for why.');
  process.exit(1);
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
