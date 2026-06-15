// scripts/preview-analysis.mjs
// ==========================================================================
// Cheap analysis preview. Analyzes only the top few ranked brands and prints
// their cards. Writes NOTHING to the database.
//
// WHY THIS EXISTS:
//   A full dry run still calls the model for all 225 brands, so it costs the
//   same as committing. This previews just the top N (default 5) for a few
//   cents, so you can read the writing before paying for the whole board.
//   The standings inside each card are computed against the full field, so a
//   previewed card reads exactly as the real run would write it.
//
// HOW TO RUN (PowerShell, from the project root
//   C:\Dev\new-beverage-trends-app\beverage-pulse):
//
//   node --env-file=.env.local scripts/preview-analysis.mjs
//   node --env-file=.env.local scripts/preview-analysis.mjs 8   (preview top 8)
//
// SAFETY:
//   dryRun is true, so nothing is written. Run the real commit
//   (run-analysis.mjs) only after these cards read well.
// ==========================================================================

import mongoose from 'mongoose';
import { analyzeBrands } from '../lib/aiAnalysis.js';
import { getDisplayName } from '../lib/taxonomy.js';

async function main() {
  const n = Math.max(1, parseInt(process.argv[2], 10) || 5);

  console.log(`Previewing the top ${n} brands. Nothing will be written.\n`);

  const result = await analyzeBrands({ dryRun: true, limit: n });

  if (!result.ok) {
    console.log('Preview did not run:');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const previews = result.previews || [];
  previews.forEach((p, i) => {
    const title = getDisplayName(p.name, 'brand');
    console.log(`#${i + 1}  ${title}`);
    console.log(`  HEADLINE: ${p.headline}`);
    console.log(`  BODY:     ${p.analysis}`);
    console.log(`  CLOSING:  ${p.closing}`);
    console.log('');
  });

  console.log(
    `Previewed ${previews.length} of ${result.total}. ` +
    `Failures: ${result.failedCount}.`
  );
  if (result.failedCount > 0) {
    console.log(JSON.stringify(result.failed, null, 2));
  }
  console.log('\nNothing was written. This was a preview only.');
}

main()
  .catch((err) => {
    console.error('Preview failed:', err.message);
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
