// scripts/run-news.mjs
// ==========================================================================
// Throttle-safe News catch-up over the gate survivors.
//
// PURPOSE:
//   Fill News for the gate survivors in one session. A straight sequential
//   pass of all survivors gets soft-throttled by Google News (it returns
//   thinned feeds that trip the baseline floor), so this runs in small chunks
//   with a pause between them, matching the low-volume cadence the daily cron
//   uses. The cron itself never hits the throttle; only the long manual pass
//   did.
//
//   This is slower on purpose. Expect roughly an hour. Leave the window open
//   until it prints the final summary.
//
// HOW TO READ THE RESULT:
//   errors should be 0 or near 0. failures should collapse to genuinely niche
//   brands (the small, real long tail), and the majors (Campari, Hennessy,
//   Tanqueray, Grand Marnier, Smirnoff, and the rest) should NOT be in the
//   failed list. If the back half of the run still thins out, Google's
//   throttle has a longer window than the pause covers; raise CHUNK_PAUSE_MS
//   or lower CHUNK_SIZE, or let the daily cron fill News over its cycle.
//
// SAFETY:
//   Non-destructive. Writes only the news fields per brand and overwrites the
//   same-week history entry rather than appending, so re-running does not
//   pollute the timeline. Errored brands are left untouched.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/run-news.mjs
// ==========================================================================

import mongoose from 'mongoose';
import { updateGoogleTrends } from '../lib/googleTrends.js';

// Tuning. CHUNK_SIZE matches the cron's proven-clean batch size; the pause
// keeps the average request rate low enough to stay under the soft throttle.
const CHUNK_SIZE = 10;
const CHUNK_PAUSE_MS = 180000; // 3 minutes between chunks

async function main() {
  console.log('Throttle-safe News catch-up over the gate survivors.');
  console.log(
    `Chunks of ${CHUNK_SIZE}, pausing ${CHUNK_PAUSE_MS / 1000}s between chunks. ` +
    'Expect roughly an hour.'
  );
  console.log('Progress prints one line per brand below.\n');

  const summary = await updateGoogleTrends({
    chunkSize: CHUNK_SIZE,
    chunkPauseMs: CHUNK_PAUSE_MS,
  });

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
