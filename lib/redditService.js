// lib/redditService.js
// ==========================================================================
// Reddit scraping service for BeveragePulse.
//
// CRITICAL DESIGN PRINCIPLE:
//   Reddit ONLY updates Buzz-related fields (score, mentions,
//   subredditBreakdown, scoreHistory, rank, change, previousRank,
//   weekOf, lastUpdated). It NEVER touches newsVelocity,
//   socialVelocity, wikipediaVelocity, or PowerWeb fields. It NEVER
//   deletes records. Each signal owns its own columns.
//
//   Uses findOneAndUpdate with upsert: if a record exists, update
//   the Buzz fields and leave everything else intact. If it doesn't
//   exist, create it. Data accumulated by other crons is preserved.
//
// AMBIGUOUS BRAND CONTEXT FILTER:
//   Some brand names are common English words ("Prime", "Truly",
//   "Monster", "Patrón"). These are flagged in taxonomy.js with
//   redditAmbiguous: true. For those brands ONLY, mentions are
//   counted only in subreddits where the brand's category is on
//   topic. See CATEGORY_SAFE_SUBREDDITS below.
//
//   Non-ambiguous brands (Knob Creek, Hennessy, etc.) are matched
//   in every subreddit, exactly as before.
//
// FULL-CRAWL PERSISTENCE (2026-06-04):
//   The crawl already scores EVERY brand in the taxonomy each run.
//   Previously only the top 20 brands by score were saved and the
//   rest of that work was discarded. That cap was a leftover from
//   the old design, where Reddit's top 20 was the entire tracked
//   set. The current architecture ranks an AI candidate pool, so the
//   cap is gone: every brand the crawl scored is now ranked and
//   saved. This makes Reddit a full-coverage signal the gate can
//   trust, and it costs no extra API calls because the scores are
//   already computed during the crawl.
//
//   Brands with zero mentions are stamped as "crawled, silent":
//   score 0, a fresh timestamp, and a 0 appended to scoreHistory.
//   A saved 0 means "we listened and heard nothing," which is
//   distinguishable from "never checked," and the run of zeros is
//   honest history for the forecasting layer.
//
// SCORE HISTORY:
//   Each weekly run appends { value, weekOf } to scoreHistory on
//   every brand record, trimmed to the most recent 8 entries. The
//   AI analysis layer reads this array to detect acceleration,
//   deceleration, and breakout patterns over time.
//
//   Beverage records (BeverageTrend) do NOT yet receive history
//   writes, and the beverage save is still capped at the top 20.
//   The categories list is on the roadmap but not built; symmetry
//   will be added when that work begins.
//
// Pipeline position:
//   Reddit is the scout. It scores every brand by how much real
//   conversation it is generating, and now persists all of those
//   scores. Together with Wikipedia (the other full-coverage
//   signal), it is the cheap gate that decides which brands are
//   worth spending the rate-limited News and YouTube signals on.
// ==========================================================================

import snoowrap from 'snoowrap';
import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';
import {
  BEVERAGE_TERMS,
  BRAND_TERMS,
  isRedditAmbiguous,
  getBrandCategory,
} from './taxonomy.js';

// --------------------------------------------------------------------------
// History configuration
// --------------------------------------------------------------------------
const MAX_HISTORY_LENGTH = 8;

// --------------------------------------------------------------------------
// Reddit client
// --------------------------------------------------------------------------
function createRedditClient() {
  return new snoowrap({
    userAgent: 'beverage-trend-analyzer/2.0',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
  });
}

// --------------------------------------------------------------------------
// Subreddits to crawl (organized by relevance tier)
// --------------------------------------------------------------------------
const SUBREDDITS = [
  // Tier 1: Beverage-specific
  'cocktails', 'mixology', 'beer', 'wine', 'liquor', 'whiskey', 'bourbon',
  'scotch', 'gin', 'rum', 'tequila', 'vodka', 'brandy', 'mezcal', 'cider',
  'craftbeer', 'lager', 'ale', 'stout', 'coffee', 'espresso', 'tea',
  'kombucha', 'soda', 'energydrinks', 'sake',

  // Tier 2: Industry and professional
  'bartenders', 'bartender', 'sommelier', 'winemaking', 'homebrew',
  'distilling', 'beverageindustry', 'restaurantowners',

  // Tier 3: Retail and consumer
  'costco', 'walmart', 'wholefoods', 'traderjoes',
  'alcohol', 'drinks', 'beverages',

  // Tier 4: Lifestyle (mainstream crossover detection)
  'cooking', 'nutrition', 'vegan', 'vegetarian',
  'nightlife', 'hotels', 'restaurants', 'resorts',
];

// --------------------------------------------------------------------------
// Category-safe subreddits for ambiguous brands.
//
// When a brand is flagged redditAmbiguous in taxonomy.js, mentions
// are counted ONLY in subreddits listed under that brand's category.
// Subreddits outside this list are treated as out-of-context noise
// (for example, "prime" in r/wine is almost always "prime cuts" or
// "prime time", not the energy drink).
//
// Sets are used for O(1) lookup inside the per-post matching loop.
// --------------------------------------------------------------------------
const CATEGORY_SAFE_SUBREDDITS = {
  spirits: new Set([
    'cocktails', 'mixology', 'liquor', 'whiskey', 'bourbon', 'scotch',
    'gin', 'rum', 'tequila', 'vodka', 'brandy', 'mezcal',
    'bartenders', 'bartender', 'sommelier', 'distilling',
    'beverageindustry', 'alcohol', 'drinks', 'beverages',
    'restaurantowners',
  ]),
  wine: new Set([
    'wine', 'sommelier', 'cocktails', 'mixology', 'winemaking',
    'bartenders', 'bartender', 'beverageindustry',
    'alcohol', 'drinks', 'beverages', 'restaurantowners',
  ]),
  beer: new Set([
    'beer', 'craftbeer', 'lager', 'ale', 'stout', 'cider', 'homebrew',
    'bartenders', 'bartender', 'beverageindustry',
    'alcohol', 'drinks', 'beverages', 'restaurantowners',
  ]),
  rtd: new Set([
    'cocktails', 'mixology', 'liquor', 'tequila', 'vodka',
    'bartenders', 'bartender', 'beverageindustry',
    'alcohol', 'drinks', 'beverages', 'restaurantowners',
  ]),
  energy: new Set([
    'energydrinks', 'drinks', 'beverages',
  ]),
  'coffee-tea': new Set([
    'coffee', 'espresso', 'tea', 'drinks', 'beverages',
  ]),
  'non-alc': new Set([
    'kombucha', 'soda', 'drinks', 'beverages', 'nutrition',
  ]),
  thc: new Set([
    'drinks', 'beverages',
  ]),
};

// --------------------------------------------------------------------------
// Helper: should a brand mention in this subreddit count?
// --------------------------------------------------------------------------
function isBrandMentionInContext(brandTerm, subreddit) {
  if (!isRedditAmbiguous(brandTerm)) return true;

  const category = getBrandCategory(brandTerm);
  if (!category) return false;

  const safeSet = CATEGORY_SAFE_SUBREDDITS[category.id];
  if (!safeSet) return false;

  return safeSet.has(subreddit);
}

// --------------------------------------------------------------------------
// Helper: count term mentions in a block of text
// --------------------------------------------------------------------------
function countMentions(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

// --------------------------------------------------------------------------
// Helper: append a new score value to a brand's scoreHistory.
//
// If the most recent entry is within 2 days of the new entry, it
// is overwritten rather than appended. This prevents duplicate
// entries when a manual /api/refresh runs in the same week as the
// scheduled Monday cron.
//
// Returns a new array trimmed to MAX_HISTORY_LENGTH.
// --------------------------------------------------------------------------
function appendToScoreHistory(existingHistory, value, weekOf) {
  const history = existingHistory ? [...existingHistory] : [];

  const twoDaysAgo = new Date(weekOf.getTime() - 2 * 24 * 60 * 60 * 1000);
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  if (lastEntry && new Date(lastEntry.weekOf) > twoDaysAgo) {
    history[history.length - 1] = { value, weekOf };
  } else {
    history.push({ value, weekOf });
  }

  while (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  return history;
}

// --------------------------------------------------------------------------
// Main scraping function
// --------------------------------------------------------------------------
export async function updateAllTrends() {
  await connectToDatabase();

  const reddit = createRedditClient();
  reddit.config({ requestDelay: 1100 });

  console.log('Starting Reddit data collection...');
  console.log(`  Tracking ${BEVERAGE_TERMS.length} beverage terms`);
  console.log(`  Tracking ${BRAND_TERMS.length} brand terms`);
  console.log(`  Crawling ${SUBREDDITS.length} subreddits`);
  console.log('  Ambiguous brand context filter: ENABLED');
  console.log('  Full-crawl persistence (all brands, silence stamped): ENABLED');

  const weekOf = new Date();
  weekOf.setHours(0, 0, 0, 0);

  // ------ Read current ranks for comparison ------
  const existingBeverages = await BeverageTrend.find().sort({ rank: 1 });
  const existingBrands = await BrandTrend.find().sort({ rank: 1 });

  const previousBeverageRankMap = {};
  existingBeverages.forEach((trend) => {
    previousBeverageRankMap[trend.name.toLowerCase()] = trend.rank;
  });

  // Map brands by name for both rank lookup and history access.
  // Reuses the existing fetch above; no extra database queries.
  const previousBrandRankMap = {};
  const existingBrandMap = {};
  existingBrands.forEach((trend) => {
    const key = trend.name.toLowerCase();
    previousBrandRankMap[key] = trend.rank;
    existingBrandMap[key] = trend;
  });

  // ------ Initialize counters from taxonomy ------
  const beverageData = {};
  const brandData = {};

  BEVERAGE_TERMS.forEach((term) => {
    beverageData[term] = {
      name: term,
      mentions: 0,
      score: 0,
      subredditBreakdown: {},
    };
  });

  BRAND_TERMS.forEach((term) => {
    brandData[term] = {
      name: term,
      mentions: 0,
      score: 0,
      subredditBreakdown: {},
    };
  });

  // ------ Crawl each subreddit ------
  for (const subreddit of SUBREDDITS) {
    console.log(`  Searching r/${subreddit}...`);

    try {
      const hotPosts = await reddit.getSubreddit(subreddit).getHot({ limit: 100 });
      const topPosts = await reddit.getSubreddit(subreddit).getTop({
        time: 'week',
        limit: 100,
      });

      // Deduplicate posts by ID
      const allPosts = [...hotPosts, ...topPosts];
      const uniquePosts = Array.from(
        new Map(allPosts.map((p) => [p.id, p])).values()
      );

      for (const post of uniquePosts) {
        const textToAnalyze = `${post.title} ${post.selftext}`.toLowerCase();

        // Count beverage mentions
        for (const term of BEVERAGE_TERMS) {
          const mentionCount = countMentions(textToAnalyze, term);

          if (mentionCount > 0) {
            beverageData[term].mentions += mentionCount;
            beverageData[term].score += mentionCount * (1 + post.score / 100);

            if (!beverageData[term].subredditBreakdown[subreddit]) {
              beverageData[term].subredditBreakdown[subreddit] = 0;
            }
            beverageData[term].subredditBreakdown[subreddit] += mentionCount;
          }
        }

        // Count brand mentions (with context filter for ambiguous brands)
        for (const term of BRAND_TERMS) {
          if (!isBrandMentionInContext(term, subreddit)) {
            continue;
          }

          const mentionCount = countMentions(textToAnalyze, term);

          if (mentionCount > 0) {
            brandData[term].mentions += mentionCount;
            brandData[term].score += mentionCount * (1 + post.score / 100);

            if (!brandData[term].subredditBreakdown[subreddit]) {
              brandData[term].subredditBreakdown[subreddit] = 0;
            }
            brandData[term].subredditBreakdown[subreddit] += mentionCount;
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (subError) {
      console.error(`  Error searching r/${subreddit}: ${subError.message}`);
      continue;
    }
  }

  // ------ Rank beverages by score (still top 20, dormant track) ------
  const sortedBeverages = Object.values(beverageData)
    .filter((b) => b.mentions > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((beverage, index) => {
      const rank = index + 1;
      const previousRank = previousBeverageRankMap[beverage.name.toLowerCase()];

      let change = 'new';
      if (previousRank) {
        if (previousRank < rank) change = 'down';
        else if (previousRank > rank) change = 'up';
        else change = 'same';
      }

      return { ...beverage, rank, change, previousRank: previousRank || null };
    });

  // ------ Rank ALL brands by score (no cap) ------
  // Every brand the crawl scored is ranked and saved, not just the top 20.
  // Brands with no mentions tie at score 0 and sort to the bottom; a name
  // tiebreaker keeps their order stable across runs, so silent brands do
  // not generate spurious rank movement week to week.
  const rankedBrands = Object.values(brandData)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    })
    .map((brand, index) => {
      const rank = index + 1;
      const previousRank = previousBrandRankMap[brand.name.toLowerCase()];

      let change = 'new';
      if (previousRank) {
        if (previousRank < rank) change = 'down';
        else if (previousRank > rank) change = 'up';
        else change = 'same';
      }

      return { ...brand, rank, change, previousRank: previousRank || null };
    });

  // ------ Save beverages: upsert, only update Buzz fields ------
  // Beverage history is intentionally NOT written here. It will be
  // added when the categories list is built.
  let beverageUpdates = 0;
  for (const beverage of sortedBeverages) {
    await BeverageTrend.findOneAndUpdate(
      { name: beverage.name },
      {
        $set: {
          score: beverage.score,
          mentions: beverage.mentions,
          subredditBreakdown: beverage.subredditBreakdown,
          rank: beverage.rank,
          change: beverage.change,
          previousRank: beverage.previousRank,
          weekOf: weekOf,
          lastUpdated: new Date(),
        },
      },
      { upsert: true }
    );
    beverageUpdates++;
  }

  // ------ Save brands: every brand, upsert, append history ------
  // Active brands (mentions > 0) carry a real score. Silent brands
  // (mentions === 0) are stamped as crawled: score 0, fresh timestamp,
  // and a 0 appended to history. Both write only Buzz-owned columns.
  //
  // SCALE NOTE: this is a per-brand loop, which is fine at the current
  // brand count and still works at a few thousand, only slower. When the
  // universe approaches thousands, replace this loop with a single
  // bulkWrite to collapse the round-trips. Not needed yet.
  let brandUpdates = 0;
  let activeCount = 0;
  let silentCount = 0;
  for (const brand of rankedBrands) {
    const existing = existingBrandMap[brand.name.toLowerCase()];
    const newHistory = appendToScoreHistory(
      existing?.scoreHistory,
      brand.score,
      weekOf
    );

    await BrandTrend.findOneAndUpdate(
      { name: brand.name },
      {
        $set: {
          score: brand.score,
          mentions: brand.mentions,
          subredditBreakdown: brand.subredditBreakdown,
          rank: brand.rank,
          change: brand.change,
          previousRank: brand.previousRank,
          weekOf: weekOf,
          lastUpdated: new Date(),
          scoreHistory: newHistory,
        },
      },
      { upsert: true }
    );

    brandUpdates++;
    if (brand.mentions > 0) activeCount++;
    else silentCount++;
  }

  console.log(`  Saved ${beverageUpdates} beverage trends (upsert)`);
  console.log(
    `  Saved ${brandUpdates} brand trends (upsert, with history): ` +
    `${activeCount} active, ${silentCount} crawled-silent`
  );

  return { beverages: sortedBeverages, brands: rankedBrands };
}

// --------------------------------------------------------------------------
// Query functions
// --------------------------------------------------------------------------
export async function getBeverageTrends() {
  await connectToDatabase();

  const trends = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  return trends;
}

export async function getBrandTrends() {
  await connectToDatabase();

  const trends = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  return trends;
}