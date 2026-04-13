// lib/youtubeService.js
// YouTube data service for BeveragePulse.
// Fetches video data from the YouTube Data API v3 for tracked
// beverage and brand terms. Measures cultural traction by counting
// how many videos were published in the past 7 days and how much
// attention they received (views).
//
// Scoring approach:
//   1. Search YouTube for each term, filtered to last 7 days.
//   2. Fetch view counts for the returned videos.
//   3. Calculate a raw score per term (total views across matches).
//   4. Normalize all scores to 0-100 (highest raw score = 100).
//   5. Update existing database records with the normalized score.
//
// Defensive design (mirrors googleTrends.js):
//   - Each term is fetched individually with error handling.
//   - If a single term fails, others continue.
//   - Old data stays untouched on failure.
//   - All failures are logged with term name and error message.
//
// Quota usage (YouTube Data API v3 free tier: 10,000 units/day):
//   - search.list = 100 units per call
//   - videos.list = 1 unit per call
//   - 40 terms = ~4,040 units per full scrape (well within limit)

import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Delay helper for rate limiting (1 second between requests)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Maximum number of weekly snapshots to keep per term
const MAX_HISTORY_LENGTH = 8;

// Number of videos to fetch per search term
const MAX_RESULTS_PER_TERM = 10;

/**
 * Search YouTube for videos matching a term, published in the last 7 days.
 * Returns an array of video IDs, or an empty array on failure.
 */
async function searchVideos(term) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const publishedAfter = sevenDaysAgo.toISOString();

  const params = new URLSearchParams({
    part: 'snippet',
    q: term,
    type: 'video',
    publishedAfter: publishedAfter,
    maxResults: String(MAX_RESULTS_PER_TERM),
    order: 'viewCount',
    relevanceLanguage: 'en',
    key: YOUTUBE_API_KEY,
  });

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
 * Fetch statistics (views, likes, comments) for a list of video IDs.
 * Returns an array of stat objects.
 */
async function getVideoStats(videoIds) {
  if (videoIds.length === 0) return [];

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

  return items.map((item) => ({
    viewCount: parseInt(item.statistics?.viewCount || '0', 10),
    likeCount: parseInt(item.statistics?.likeCount || '0', 10),
    commentCount: parseInt(item.statistics?.commentCount || '0', 10),
  }));
}

/**
 * Fetch the YouTube culture score for a single term.
 * Returns the raw score (total views across matching videos),
 * the video count, and the total views, or null on failure.
 */
async function fetchYoutubeForTerm(term) {
  try {
    // Step 1: Search for videos matching this term from the past 7 days
    const videoIds = await searchVideos(term);

    if (videoIds.length === 0) {
      return { rawScore: 0, videoCount: 0, totalViews: 0 };
    }

    // Step 2: Get view counts for those videos
    const stats = await getVideoStats(videoIds);

    // Step 3: Calculate raw score
    // Total views serves as the raw culture signal.
    // A term with 10 videos totaling 2 million views has more
    // cultural traction than one with 10 videos totaling 500 views.
    const totalViews = stats.reduce((sum, s) => sum + s.viewCount, 0);
    const videoCount = stats.length;

    return { rawScore: totalViews, videoCount, totalViews };
  } catch (error) {
    console.error(`  YouTube fetch error for "${term}": ${error.message}`);
    return null;
  }
}

/**
 * Append a value to the youtubeHistory array on a document.
 * Trims to MAX_HISTORY_LENGTH entries, keeping the most recent.
 */
function appendToHistory(document, value) {
  const history = document.youtubeHistory || [];
  const now = new Date();

  // Avoid duplicate entries for the same week
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  if (lastEntry && new Date(lastEntry.weekOf) > twoDaysAgo) {
    // Update the most recent entry instead of adding a duplicate
    history[history.length - 1] = { value, weekOf: now };
  } else {
    // Append new entry
    history.push({ value, weekOf: now });
  }

  // Trim to max length, keeping most recent
  while (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  return history;
}

/**
 * Normalize an array of raw scores to 0-100.
 * The highest raw score becomes 100. Everything else is proportional.
 * Returns a Map of term name -> normalized score.
 */
function normalizeScores(rawScoresMap) {
  const maxScore = Math.max(...rawScoresMap.values(), 1);
  const normalized = new Map();

  for (const [term, raw] of rawScoresMap) {
    normalized.set(term, Math.round((raw / maxScore) * 100));
  }

  return normalized;
}

/**
 * Update YouTube data for all beverages and brands currently
 * in the database. Fetches raw scores for all terms first, then
 * normalizes to 0-100 and saves. This ensures the normalization
 * is relative across all terms in the same batch.
 *
 * Returns a summary object:
 *   { successes, failures, failedTerms, totalTime }
 */
export async function updateYoutubeTrends() {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  await connectToDatabase();

  const startTime = Date.now();
  let successes = 0;
  let failures = 0;
  const failedTerms = [];

  console.log('Starting YouTube data collection...');

  // --- Fetch all records ---
  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  const brands = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  // --- Phase 1: Collect raw scores for all terms ---
  // We need all raw scores before normalizing so the scale is consistent.
  const rawScores = new Map();
  const recordMap = new Map();

  // Beverages
  for (const beverage of beverages) {
    console.log(`  YouTube: searching "${beverage.name}"...`);
    const result = await fetchYoutubeForTerm(beverage.name);

    if (result !== null) {
      rawScores.set(beverage.name, result.rawScore);
      recordMap.set(beverage.name, { record: beverage, type: 'beverage', result });
      console.log(`  YouTube: ${beverage.name} = ${result.videoCount} videos, ${result.totalViews.toLocaleString()} views`);
      successes++;
    } else {
      failedTerms.push(beverage.name);
      failures++;
    }

    await delay(1000);
  }

  // Brands
  for (const brand of brands) {
    console.log(`  YouTube: searching "${brand.name}"...`);
    const result = await fetchYoutubeForTerm(brand.name);

    if (result !== null) {
      rawScores.set(brand.name, result.rawScore);
      recordMap.set(brand.name, { record: brand, type: 'brand', result });
      console.log(`  YouTube: ${brand.name} = ${result.videoCount} videos, ${result.totalViews.toLocaleString()} views`);
      successes++;
    } else {
      failedTerms.push(brand.name);
      failures++;
    }

    await delay(1000);
  }

  // --- Phase 2: Normalize and save ---
  if (rawScores.size > 0) {
    const normalized = normalizeScores(rawScores);

    for (const [termName, data] of recordMap) {
      const normalizedScore = normalized.get(termName);
      const record = data.record;

      record.youtubeScore = normalizedScore;
      record.lastYoutubeUpdate = new Date();
      record.youtubeHistory = appendToHistory(record, normalizedScore);

      await record.save();
      console.log(`  YouTube saved: ${termName} = ${normalizedScore}/100`);
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    successes,
    failures,
    failedTerms,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (failures > 0) {
    console.warn(
      `YouTube completed with ${failures} failures: ${failedTerms.join(', ')}`
    );
  } else {
    console.log(`YouTube completed successfully in ${totalTime}s`);
  }

  return summary;
}