// scripts/run-wikipedia.mjs
// ==========================================================================
// Manual Wikipedia catch-up.
//
// PURPOSE:
//   Run the Wikipedia collector across every brand and beverage category in
//   one pass. With the recorded-check change, every term now gets an outcome
//   written: a velocity, presence-only pageviews, or a "no article" stamp.
//   After this run the coverage census is honest, because "no article" and
//   "never checked" are finally distinguishable. Wikimedia has no quota; the
//   pacing is just a polite delay, so expect roughly five to seven minutes.
//
// SAFETY:
//   Non-destructive. Writes only the Wikipedia-owned columns via upsert:false
//   (it updates existing records, never creates or deletes).
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/run-wikipedia.mjs
// ==========================================================================

import mongoose from 'mongoose';
import { updateWikipediaTrends } from '../lib/wikipediaService.js';

async function main() {
  console.log('Starting full Wikipedia catch-up. This can take 5 to 7 minutes.');
  console.log('Progress prints one line per term below.\n');

  const summary = await updateWikipediaTrends();

  console.log('\nWIKIPEDIA CATCH-UP SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error('Wikipedia catch-up failed:', err.message);
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
