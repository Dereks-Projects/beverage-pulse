// scripts/run-reddit.mjs
// ==========================================================================
// Manual Reddit crawl.
//
// PURPOSE:
//   Run the Reddit collector across every brand in one pass. With the
//   full-crawl change, this scores and saves all brands, stamping the
//   silent ones, not just the top 20. It crawls about 50 subreddits, so
//   expect a few minutes. Reddit has no per-brand quota; the pacing is
//   just a polite request delay.
//
// SAFETY:
//   Non-destructive. Reddit writes only its own Buzz columns (score,
//   mentions, subredditBreakdown, rank, change, previousRank, weekOf,
//   lastUpdated, scoreHistory) via upsert. It never deletes.
//
// PREREQUISITE:
//   .env.local must hold the Reddit credentials (REDDIT_CLIENT_ID,
//   REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD) and the
//   Atlas MONGODB_URI. Without the Reddit credentials the run cannot
//   authenticate and will fail at the first subreddit.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/run-reddit.mjs
// ==========================================================================

import mongoose from 'mongoose';
import { updateAllTrends } from '../lib/redditService.js';

async function main() {
  console.log('Starting Reddit crawl. This can take several minutes.');
  console.log('Progress prints one line per subreddit below.\n');

  const result = await updateAllTrends();

  const brands = result?.brands || [];
  const active = brands.filter((b) => b.mentions > 0);
  const silent = brands.filter((b) => b.mentions === 0);

  console.log('\nREDDIT CRAWL SUMMARY:');
  console.log(`  Beverages saved: ${result?.beverages?.length || 0}`);
  console.log(
    `  Brands saved:    ${brands.length} ` +
    `(${active.length} active, ${silent.length} crawled-silent)`
  );

  console.log('\n  Top 10 brands by Reddit score:');
  for (const b of brands.slice(0, 10)) {
    console.log(
      `    #${b.rank}  ${b.name}  score ${Math.round(b.score)} (${b.mentions} mentions)`
    );
  }
}

main()
  .catch((err) => {
    console.error('Reddit crawl failed:', err.message);
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
