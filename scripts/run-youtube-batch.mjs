// scripts/run-youtube-batch.mjs
// ==========================================================================
// Single-batch YouTube run, for VERIFYING the gate wiring.
//
// PURPOSE:
//   Run exactly ONE daily-sized YouTube batch (BATCH_SIZE terms), about
//   2,000 quota units, well within the 10,000-per-day free quota. This is to
//   confirm that the batch now rotates over the gate survivors (the log line
//   reads "... over N terms (S gate survivors + B beverages) ..."). It is
//   NOT a catch-up. YouTube cannot be fully caught up in one run at the
//   current quota; the daily cron over several weeks is the supported path.
//
// SAFETY:
//   Non-destructive. Writes only YouTube fields (youtubeScore,
//   socialVelocity, lastYoutubeUpdate, youtubeHistory). Errors such as quota
//   are recorded as errors, never as false "checked, empty." It writes to
//   whatever database .env.local points at, so confirm that is Atlas first.
//   Note: if today's scheduled cron already ran, this spends quota on top of
//   it. Two runs in a day is still well within the daily free quota.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/run-youtube-batch.mjs
// ==========================================================================

import mongoose from 'mongoose';
import { updateYoutubeTrendsBatch } from '../lib/youtubeService.js';

async function main() {
  console.log('Running ONE YouTube batch (about 2,000 quota units). Verification only.\n');

  const summary = await updateYoutubeTrendsBatch();

  console.log('\nYOUTUBE BATCH SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error('YouTube batch failed:', err.message);
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
