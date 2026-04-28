// lib/redditService.js
// ==========================================================================
// Reddit scraping service for BeveragePulse.
//
// CRITICAL DESIGN PRINCIPLE:
//   Reddit ONLY updates Buzz-related fields (score, mentions,
//   subredditBreakdown, rank, change, previousRank, weekOf).
//   It NEVER touches searchVelocity, socialVelocity, or powerWebScore.
//   It NEVER deletes records. Each signal owns its own columns.
//
//   Uses findOneAndUpdate with upsert: if a record exists, update
//   the Buzz fields and leave everything else intact. If it doesn't
//   exist, create it. Data accumulated by other crons is preserved.
//
// AMBIGUOUS BRAND CONTEXT FILTER (added 2026-04-28):
//   Some brand names are common English words ("Prime", "Truly",
//   "Monster", "Patrón"). These are flagged in taxonomy.js with
//   redditAmbiguous: true. For those brands ONLY, mentions are
//   counted only in subreddits where the brand's category is on
//   topic. See CATEGORY_SAFE_SUBREDDITS below.
//
//   Non-ambiguous brands (Knob Creek, Hennessy, etc.) are matched
//   in every subreddit, exactly as before.
//
// Pipeline position:
//   Reddit is the scout. It identifies which terms are generating
//   real conversation. The top 20 beverages and top 20 brands by
//   Reddit engagement become the active tracking set. Google,
//   YouTube, and PowerWeb crons update those records independently.
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
//
// Returns true for non-ambiguous brands (always count).
// Returns true for ambiguous brands ONLY if the subreddit is in the
// brand's category-safe list.
// Returns false otherwise (skip the mention silently).
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

  const weekOf = new Date();
  weekOf.setHours(0, 0, 0, 0);

  // ------ Read current ranks for comparison ------
  const existingBeverages = await BeverageTrend.find().sort({ rank: 1 });
  const existingBrands = await BrandTrend.find().sort({ rank: 1 });

  const previousBeverageRankMap = {};
  existingBeverages.forEach((trend) => {
    previousBeverageRankMap[trend.name.toLowerCase()] = trend.rank;
  });

  const previousBrandRankMap = {};
  existingBrands.forEach((trend) => {
    previousBrandRankMap[trend.name.toLowerCase()] = trend.rank;
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
        // (No context filter applied here. Beverage terms are
        // category-level by definition. If a beverage term proves
        // ambiguous in the future, the same pattern can be applied.)
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

  // ------ Rank beverages by score ------
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

  // ------ Rank brands by score ------
  const sortedBrands = Object.values(brandData)
    .filter((b) => b.mentions > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
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

  // ------ Save brands: upsert, only update Buzz fields ------
  let brandUpdates = 0;
  for (const brand of sortedBrands) {
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
        },
      },
      { upsert: true }
    );
    brandUpdates++;
  }

  console.log(`  Saved ${beverageUpdates} beverage trends (upsert)`);
  console.log(`  Saved ${brandUpdates} brand trends (upsert)`);

  return { beverages: sortedBeverages, brands: sortedBrands };
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