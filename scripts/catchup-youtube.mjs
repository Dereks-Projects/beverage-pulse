// scripts/catchup-youtube.mjs
// ==========================================================================
// Lap the YouTube roster faster, within the daily quota.
//
// PURPOSE:
//   The daily batch checks one slice of the work list per day, so a full lap
//   of all batches takes weeks. This runner steps through several explicit
//   batches in one sitting, up to a daily budget, so the whole roster laps in
//   about five daily runs instead of twenty-five.
//
// QUOTA:
//   Each batch costs roughly 2,000 units. The daily free quota is 10,000, so
//   about five batches per day. When the quota runs out, a batch comes back
//   with errors (could not check, nothing written). This runner sees that and
//   stops, so it never hammers a spent quota. Run it again the next day.
//
// HOW TO USE (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   Day 1: node --env-file=.env.local scripts/catchup-youtube.mjs 5 0
//   Day 2: node --env-file=.env.local scripts/catchup-youtube.mjs 5 5
//   Day 3: node --env-file=.env.local scripts/catchup-youtube.mjs 5 10
//   Day 4: node --env-file=.env.local scripts/catchup-youtube.mjs 5 15
//   Day 5: node --env-file=.env.local scripts/catchup-youtube.mjs 5 20
//   After five days every batch has run once and the roster is covered.
//
// ARGS (optional, positional):
//   1: how many batches to attempt this sitting (default 5)
//   2: which batch index to start at, zero-based (default 0)
//
// SAFETY:
//   Non-destructive. Each batch writes exactly what the daily batch writes.
//   Stops early on the first batch that reports errors (quota spent).
// ==========================================================================

import mongoose from 'mongoose';
import { updateYoutubeTrendsBatch } from '../lib/youtubeService.js';

const PAUSE_MS = 3000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const count = Math.max(1, parseInt(process.argv[2], 10) || 5);
  const start = Math.max(0, parseInt(process.argv[3], 10) || 0);

  console.log(
    `YouTube catch-up: up to ${count} batch(es) starting at index ${start}. ` +
    `Stops if the quota runs out.\n`
  );

  let attempted = 0;
  let totalSuccesses = 0;
  let totalFailures = 0;
  let totalBatches = null;
  const ran = [];

  for (let i = 0; i < count; i++) {
    // Once we know how many batches exist, never run more than that in one
    // lap, or we would wrap around and re-check brands already done this lap.
    if (totalBatches !== null && i >= totalBatches) {
      console.log(`\nReached the total batch count (${totalBatches}); stopping.`);
      break;
    }

    const idx = start + i;
    const summary = await updateYoutubeTrendsBatch({ batchIndex: idx });

    attempted += 1;
    totalBatches = summary.totalBatches;
    totalSuccesses += summary.successes || 0;
    totalFailures += summary.failures || 0;
    ran.push(summary.batch);

    if ((summary.errors || 0) > 0) {
      console.warn(
        `\nBatch ${summary.batch} returned ${summary.errors} error(s), which ` +
        `usually means the daily quota is spent. Stopping here. Run again tomorrow.`
      );
      break;
    }

    if (i < count - 1) await delay(PAUSE_MS);
  }

  console.log('\nYOUTUBE CATCH-UP SUMMARY:');
  console.log(
    JSON.stringify(
      {
        batchesAttempted: attempted,
        batchesRun: ran,
        totalBatches,
        successes: totalSuccesses,
        failures: totalFailures,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error('YouTube catch-up failed:', err.message);
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
