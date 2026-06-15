// scripts/recheck-news.mjs
// ==========================================================================
// Targeted News re-check for a few brands. No chunk pause. Under a minute.
//
// PURPOSE:
//   The full catch-up (run-news.mjs) fills all 225 and takes about an hour.
//   When you only want to re-test a handful of brands that came back below
//   floor, this checks just those, with no pause between requests, so it
//   finishes fast. It calls the same News service code as every other path,
//   so the result is apples to apples with the full run.
//
// HOW TO USE:
//   Pass the brand keys as arguments, exactly as the summaries print them
//   (the lowercase keys, not the display names). Wrap any key that has a
//   space in quotes.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/recheck-news.mjs "red bull" monster prime ciroc
//
// HOW TO READ THE RESULT:
//   successes got a fresh velocity value. failures are still below floor.
//   errors should be 0. If a major like Red Bull clears on this clean pass
//   when it failed in the long run, the long run hit Google's soft throttle.
//   If an accented name (ciroc, kahlua, d-usse) stays below floor here, the
//   quoted-name query is the suspect, not throttle.
//
// SAFETY:
//   Non-destructive. Writes only the news fields for the brands you name, and
//   overwrites the same-week history entry rather than appending. Errored
//   brands are left untouched. Names not in the database are reported and
//   skipped, never created.
// ==========================================================================

import mongoose from 'mongoose';
import { recheckNewsByNames } from '../lib/googleTrends.js';

async function main() {
  const names = process.argv.slice(2);

  if (names.length === 0) {
    console.log('No brands given.');
    console.log(
      'Usage: node --env-file=.env.local scripts/recheck-news.mjs ' +
      '"red bull" monster prime ciroc'
    );
    return;
  }

  console.log(`Re-checking News for ${names.length} brand(s): ${names.join(', ')}\n`);

  const summary = await recheckNewsByNames(names);

  console.log('\nNEWS RE-CHECK SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error('News re-check failed:', err.message);
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
