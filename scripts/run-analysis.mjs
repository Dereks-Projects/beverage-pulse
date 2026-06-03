// scripts/run-analysis.mjs
// ==========================================================================
// One-off analysis commit, run from the terminal instead of a browser URL.
//
// WHY THIS EXISTS:
//   The analysis job writes the headline and writeup for every ranked
//   brand. Run from a browser it can hang or be cut off the same way the
//   ranking did. A terminal script has no HTTP timeout, prints the result
//   live, and exits on its own when the writes are done.
//
//   Run this AFTER the ranking has been committed, since the analysis
//   only writes for brands that already have a rank.
//
// HOW TO RUN (PowerShell, from the project root
//   C:\Dev\new-beverage-trends-app\beverage-pulse):
//
//   node --env-file=.env.local scripts/run-analysis.mjs
//
//   It prints a starting line, then works quietly for a few minutes as it
//   writes each brand. When it finishes it prints the count and exits.
// ==========================================================================

import { analyzeBrands } from '../lib/aiAnalysis.js';

async function main() {
  console.log('Running analysis commit (dryRun: false)...');

  const result = await analyzeBrands({ dryRun: false });

  console.log('RESULT:');
  console.log(JSON.stringify(result, null, 2));

  if (result.ok && typeof result.written === 'number') {
    console.log(`\nDone. Wrote ${result.written} writeups to the database.`);
    process.exit(0);
  }

  console.log('\nNothing was written. See the result above for why.');
  process.exit(1);
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
