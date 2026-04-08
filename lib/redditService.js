// lib/redditService.js
// Reddit scraping service for BeveragePulse
// Migrated from the original Express backend.
// Uses snoowrap to connect to the Reddit API, crawls beverage-related
// subreddits, counts mentions of tracked terms, and scores them
// by mention count weighted by post upvotes.

import snoowrap from 'snoowrap';
import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';

// Initialize Reddit client
function createRedditClient() {
  return new snoowrap({
    userAgent: 'beverage-trend-analyzer/1.0',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
  });
}

// --------------------------------------------------------------------------
// Tracked beverage terms
// --------------------------------------------------------------------------
const DEFAULT_BEVERAGES = [
  'wine', 'beer', 'tea', 'coffee', 'non-alcoholic', 'vodka', 'gin', 'rum',
  'tequila', 'cognac', 'rye', 'lager', 'ale', 'cola', 'red wine', 'white wine',
  'rosé', 'sparkling wine', 'champagne', 'merlot', 'cabernet sauvignon',
  'pinot noir', 'chardonnay', 'sauvignon blanc', 'brandy', 'scotch', 'whiskey',
  'whisky', 'sake', 'cider', 'brown spirits', 'cocktail', 'mocktail',
  'hard cider', 'hard tea', 'rtd', 'kombucha', 'mezcal', 'wine cooler',
  'canned cocktail', 'canned alcohol', 'seltzer', 'hard seltzer', 'energy drink',
];

// --------------------------------------------------------------------------
// Tracked brand terms (duplicates from the original list have been removed)
// --------------------------------------------------------------------------
const DEFAULT_BRANDS = [
  'budweiser', 'bud light', 'coors light', 'miller lite', 'heineken', 'corona',
  'modelo', 'guinness', 'stella artois', 'blue moon', 'sam adams', 'white claw',
  'truly', 'angry orchard', 'gallo', 'barefoot', 'yellow tail', 'kendall-jackson',
  'caymus', 'robert mondavi', 'opus one', 'apothic', 'meiomi', 'bacardi',
  'captain morgan', 'malibu', 'grey goose', 'absolut', 'smirnoff', 'titos',
  'johnnie walker', 'jack daniels', 'woodford reserve', 'makers mark', 'jameson',
  'bushmills', 'glenfiddich', 'macallan', 'hennessy', 'courvoisier', 'patron',
  'don julio', 'jose cuervo', 'casamigos', 'cupcake vineyards', 'josh cellars',
  'beringer', 'woodbridge', 'sutter home', 'chateau ste michelle',
  'santa margherita', 'duckhorn', 'la crema', 'j lohr', 'decoy',
  'coppola', 'screaming eagle', 'boillot', 'domaine chandon',
  'veuve clicquot', 'moet & chandon', 'dom perignon', 'krug', 'roederer',
  'louis roederer', 'bulleit', 'wild turkey',
  'redbreast', 'glendronach', 'balvenie', 'lagavulin', 'talisker', 'laphroaig',
  'rodney strong', 'franzia', 'yellowtail', 'canyon road', 'frontera', 'cavit',
  'ecco domani', 'mirassou', 'riunite', 'menage a trois', '14 hands',
  'chateau ste. michelle', 'bogle', 'liberty creek', 'dark horse',
  'black box', 'woodbridge by robert mondavi', 'inglenook', 'gallo family vineyards',
];

// --------------------------------------------------------------------------
// Subreddits to crawl
// --------------------------------------------------------------------------
const BEVERAGE_SUBREDDITS = [
  'beverages', 'coffee', 'tea', 'soda', 'energydrinks', 'kombucha', 'alcohol',
  'cocktails', 'mixology', 'beer', 'wine', 'liquor', 'distilling', 'mezcal',
  'cider', 'whiskey', 'bourbon', 'scotch', 'gin', 'rum', 'tequila', 'vodka',
  'brandy', 'craftbeer', 'lager', 'ale', 'winemaking', 'sommelier',
  'cooking', 'nutrition', 'vegan', 'vegetarian', 'bartenders', 'nightlife',
  'hotels', 'restaurants', 'resorts', 'drinks', 'bartender', 'costco', 'walmart',
  'wholefoods', 'traderjoes', 'beverageindustry', 'restaurantowners',
];

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

  console.log('Starting Reddit data collection for beverages and brands...');

  const weekOf = new Date();
  weekOf.setHours(0, 0, 0, 0);

  // ------ Fetch previous week's data for rank comparison ------
  const lastWeekDate = new Date(weekOf);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);

  const previousBeverageTrends = await BeverageTrend.find({
    weekOf: { $gte: lastWeekDate, $lt: weekOf },
  });

  const previousBrandTrends = await BrandTrend.find({
    weekOf: { $gte: lastWeekDate, $lt: weekOf },
  });

  const previousBeverageRankMap = {};
  previousBeverageTrends.forEach((trend) => {
    previousBeverageRankMap[trend.name.toLowerCase()] = trend.rank;
  });

  const previousBrandRankMap = {};
  previousBrandTrends.forEach((trend) => {
    previousBrandRankMap[trend.name.toLowerCase()] = trend.rank;
  });

  // ------ Initialize counters ------
  const beverageData = {};
  const brandData = {};

  DEFAULT_BEVERAGES.forEach((beverage) => {
    beverageData[beverage.toLowerCase()] = {
      name: beverage,
      mentions: 0,
      score: 0,
      subredditBreakdown: {},
    };
  });

  DEFAULT_BRANDS.forEach((brand) => {
    brandData[brand.toLowerCase()] = {
      name: brand,
      mentions: 0,
      score: 0,
      subredditBreakdown: {},
    };
  });

  // ------ Crawl each subreddit ------
  for (const subreddit of BEVERAGE_SUBREDDITS) {
    console.log(`Searching r/${subreddit}...`);

    try {
      const hotPosts = await reddit.getSubreddit(subreddit).getHot({ limit: 100 });
      const topPosts = await reddit.getSubreddit(subreddit).getTop({
        time: 'week',
        limit: 100,
      });

      // Deduplicate posts by ID
      const allPosts = [...hotPosts, ...topPosts];
      const uniquePosts = Array.from(new Map(allPosts.map((p) => [p.id, p])).values());

      for (const post of uniquePosts) {
        const textToAnalyze = `${post.title} ${post.selftext}`.toLowerCase();

        // Count beverage mentions
        for (const beverage of DEFAULT_BEVERAGES) {
          const key = beverage.toLowerCase();
          const mentionCount = countMentions(textToAnalyze, key);

          if (mentionCount > 0) {
            beverageData[key].mentions += mentionCount;
            beverageData[key].score += mentionCount * (1 + post.score / 100);

            if (!beverageData[key].subredditBreakdown[subreddit]) {
              beverageData[key].subredditBreakdown[subreddit] = 0;
            }
            beverageData[key].subredditBreakdown[subreddit] += mentionCount;
          }
        }

        // Count brand mentions
        for (const brand of DEFAULT_BRANDS) {
          const key = brand.toLowerCase();
          const mentionCount = countMentions(textToAnalyze, key);

          if (mentionCount > 0) {
            brandData[key].mentions += mentionCount;
            brandData[key].score += mentionCount * (1 + post.score / 100);

            if (!brandData[key].subredditBreakdown[subreddit]) {
              brandData[key].subredditBreakdown[subreddit] = 0;
            }
            brandData[key].subredditBreakdown[subreddit] += mentionCount;
          }
        }
      }

      // Respectful delay between subreddit requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (subError) {
      console.error(`Error searching r/${subreddit}: ${subError.message}`);
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

      return {
        ...beverage,
        rank,
        change,
        previousRank: previousRank || null,
        weekOf,
        lastUpdated: new Date(),
      };
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

      return {
        ...brand,
        rank,
        change,
        previousRank: previousRank || null,
        weekOf,
        lastUpdated: new Date(),
      };
    });

  // ------ Save to database ------
  await BeverageTrend.deleteMany({ weekOf });
  await BrandTrend.deleteMany({ weekOf });

  if (sortedBeverages.length > 0) {
    await BeverageTrend.insertMany(sortedBeverages);
  }
  if (sortedBrands.length > 0) {
    await BrandTrend.insertMany(sortedBrands);
  }

  console.log(`Updated ${sortedBeverages.length} beverage trends`);
  console.log(`Updated ${sortedBrands.length} brand trends`);

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