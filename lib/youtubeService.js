// lib/youtubeService.js
// YouTube Social Velocity service for BeveragePulse.
//
// Two modes of operation:
//   1. updateYoutubeTrends() - all terms at once (manual refresh).
//   2. updateYoutubeTrendsBatch() - 10 terms per call (daily cron).
//      Rotates through batches based on day of year.
//
// Measures cultural traction by comparing YouTube attention for each
// term across two time periods:
//   - Recent: videos published in the last 30 days
//   - Baseline: videos published 31-90 days ago (normalized to 30-day rate)
//
// Social Velocity = percentage change between recent and baseline.
//   +37% means creator output and audience attention are accelerating.
//   -12% means cultural interest is cooling off.
//
// Every term is measured against its own history. "Coffee" competes
// with coffee from 2 months ago, not with "lagavulin."
//
// Quota budget (YouTube Data API v3 free tier: 10,000 units/day):
//   - search.list = 100 units per call (2 per term: recent + baseline)
//   - videos.list = 1 unit per call (2 per term)
//   - 10-term batch = ~2,020 units
//   - Full 40-term run = ~8,080 units

import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Delay helper (1 second between requests)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Number of terms per daily batch
const BATCH_SIZE = 10;

// Number of videos to fetch per search
const MAX_RESULTS_PER_SEARCH = 10;

// Maximum history entries to keep
const MAX_HISTORY_LENGTH = 8;

/**
 * Search YouTube for videos matching a term within a date range.
 * Returns an array of video IDs, or an empty array on failure.
 */
async function searchVideos(term, publishedAfter, publishedBefore) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: term,
    type: 'video',
    publishedAfter: publishedAfter.toISOString(),
    maxResults: String(MAX_RESULTS_PER_SEARCH),
    order: 'viewCount',
    relevanceLanguage: 'en',
    key: YOUTUBE_API_KEY,
  });

  // Only add publishedBefore if specified (not needed for "recent" period)
  if (publishedBefore) {
    params.set('publishedBefore', publishedBefore.toISOString());
  }

  const url = `${YOUTUBE_API_BASE}/search?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube search failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const items = data.items || [];

  return items
    .filter((item) => item.id?.videoId)
    .map((item) => item.id.videoId);
}

/**
 * Fetch view counts for a list of video IDs.
 * Returns total views across all videos.
 */
async function getTotalViews(videoIds) {
  if (videoIds.length === 0) return 0;

  const params = new URLSearchParams({
    part: 'statistics',
    id: videoIds.join(','),
    key: YOUTUBE_API_KEY,
  });

  const url = `${YOUTUBE_API_BASE}/videos?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube stats failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const items = data.items || [];

  return items.reduce(
    (sum, item) => sum + parseInt(item.statistics?.viewCount || '0', 10),
    0
  );
}

/**
 * Fetch Social Velocity for a single term.
 * Compares YouTube attention in the last 30 days vs. the prior 60 days.
 *
 * Returns { recentViews, baselineViews, velocity } or null on failure.
 */
async function fetchVelocityForTerm(term) {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Recent period: last 30 days
    const recentVideoIds = await searchVideos(term, thirtyDaysAgo, null);
    await delay(500);
    const recentViews = await getTotalViews(recentVideoIds);
    await delay(500);

    // Baseline period: 31-90 days ago
    const baselineVideoIds = await searchVideos(term, ninetyDaysAgo, thirtyDaysAgo);
    await delay(500);
    const baselineViews = await getTotalViews(baselineVideoIds);

    // Normalize baseline to 30-day rate (it covers 60 days)
    const baselineNormalized = baselineViews / 2;

    // Calculate velocity
    let velocity;
    if (baselineNormalized === 0 && recentViews === 0) {
      velocity = 0;
    } else if (baselineNormalized === 0 && recentViews > 0) {
      velocity = 100;
    } else {
      velocity = Math.round(
        ((recentViews - baselineNormalized) / baselineNormalized) * 100
      );
    }

    return {
      recentViews,
      baselineViews,
      baselineNormalized: Math.round(baselineNormalized),
      velocity,
      recentVideoCount: recentVideoIds.length,
      baselineVideoCount: baselineVideoIds.length,
    };
  } catch (error) {
    console.error(`  YouTube fetch error for "${term}": ${error.message}`);
    return null;
  }
}

/**
 * Append a velocity value to the youtubeHistory array.
 * Trims to MAX_HISTORY_LENGTH entries.
 */
function appendToHistory(record, value) {
  const history = record.youtubeHistory || [];
  const now = new Date();

  // Avoid duplicate entries for the same week
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  if (lastEntry && new Date(lastEntry.weekOf) > twoDaysAgo) {
    history[history.length - 1] = { value, weekOf: now };
  } else {
    history.push({ value, weekOf: now });
  }

  while (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  return history;
}

/**
 * Process a list of database records, fetching Social Velocity for each.
 * Shared logic used by both full update and batch update.
 */
async function processRecords(records) {
  let successes = 0;
  let failures = 0;
  const failedTerms = [];

  for (const record of records) {
    console.log(`  YouTube: fetching velocity for "${record.name}"...`);
    const result = await fetchVelocityForTerm(record.name);

    if (result !== null) {
      record.youtubeScore = result.recentViews;
      record.socialVelocity = result.velocity;
      record.lastYoutubeUpdate = new Date();
      record.youtubeHistory = appendToHistory(record, result.velocity);

      await record.save();

      const direction = result.velocity > 0 ? '+' : '';
      const recentFormatted = result.recentViews.toLocaleString();
      const baselineFormatted = result.baselineNormalized.toLocaleString();
      console.log(
        `  YouTube: ${record.name} = ${direction}${result.velocity}% velocity ` +
        `(recent 30d: ${recentFormatted} views, baseline 30d rate: ${baselineFormatted} views, ` +
        `${result.recentVideoCount}/${result.baselineVideoCount} videos)`
      );
      successes++;
    } else {
      console.error(`  YouTube FAILED: ${record.name}`);
      failedTerms.push(record.name);
      failures++;
    }

    await delay(1000);
  }

  return { successes, failures, failedTerms };
}

/**
 * DAILY CRON: Update YouTube Social Velocity for one batch of terms.
 * Automatically selects which batch to run based on the current
 * day of the year. Cycles through all terms over multiple days.
 */
export async function updateYoutubeTrendsBatch() {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  await connectToDatabase();

  const startTime = Date.now();

  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  const brands = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  const allRecords = [...beverages, ...brands];

  // Calculate which batch to run today
  const totalBatches = Math.ceil(allRecords.length / BATCH_SIZE);
  const startOfYear = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  );
  const batchIndex = dayOfYear % totalBatches;

  const start = batchIndex * BATCH_SIZE;
  const batch = allRecords.slice(start, start + BATCH_SIZE);

  const batchNames = batch.map((r) => r.name).join(', ');
  console.log(
    `YouTube Social Velocity: batch ${batchIndex + 1} of ${totalBatches} ` +
    `(${batch.length} terms: ${batchNames})`
  );

  const result = await processRecords(batch);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    batch: batchIndex + 1,
    totalBatches,
    termsInBatch: batch.length,
    ...result,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.failures > 0) {
    console.warn(
      `YouTube batch ${batchIndex + 1} completed with ${result.failures} failures: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(
      `YouTube batch ${batchIndex + 1} completed successfully in ${totalTime}s`
    );
  }

  return summary;
}

/**
 * MANUAL REFRESH: Update YouTube Social Velocity for all terms.
 * Uses ~8,080 API quota units. Stay aware of the 10,000 daily limit.
 */
export async function updateYoutubeTrends() {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  await connectToDatabase();

  const startTime = Date.now();

  console.log('Starting YouTube Social Velocity collection...');

  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  const brands = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  const allRecords = [...beverages, ...brands];
  const result = await processRecords(allRecords);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    ...result,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.failures > 0) {
    console.warn(
      `YouTube Social Velocity completed with ${result.failures} failures: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(`YouTube Social Velocity completed successfully in ${totalTime}s`);
  }

  return summary;
}