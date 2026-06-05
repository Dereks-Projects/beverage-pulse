// scripts/run-news.mjs
// ==========================================================================
// Manual full News catch-up.
//
// PURPOSE:
//   Run the Google News collector across every brand in one pass, so the
//   tail brands the daily rotation has not reached yet get filled now.
//   News uses free public feeds with no API quota, so a full run is safe.
//   It is slow: roughly 5 seconds per brand, so expect around 40 minutes
//   for the current brand set. Leave the window open until it prints the
//   final summary.
//
// SAFETY:
//   Non-destructive. The collector updates only the news fields
//   (newsVelocity, lastNewsUpdate, newsHistory) per brand, and overwrites
//   the same-week history entry rather than appending, so re-running does
//   not pollute the timeline.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/run-news.mjs
// ==========================================================================

import mongoose from 'mongoose';
import { updateGoogleTrends } from '../lib/googleTrends.js';

async function main() {
  console.log('Starting full News catch-up. This can take around 40 minutes.');
  console.log('Progress prints one line per brand below.\n');

  const summary = await updateGoogleTrends();

  console.log('\nNEWS CATCH-UP SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error('News catch-up failed:', err.message);
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
