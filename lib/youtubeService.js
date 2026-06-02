// lib/youtubeService.js
// ==========================================================================
// YouTube Social Velocity service for BeveragePulse.
//
// Two modes of operation:
//   1. updateYoutubeTrends() - all terms at once (manual refresh).
//   2. updateYoutubeTrendsBatch() - 10 terms per call (daily cron).
//      Rotates through batches based on day of year.
//
// METHODOLOGY (2026-05-04 rebuild):
//
//   For each term we run two YouTube searches:
//     - Recent:   videos published in the last 30 days
//     - Baseline: videos published 31-90 days ago
//
//   For each video returned, we compute VIEWS PER DAY:
//     viewsPerDay = viewCount / max(daysSincePublished, 1)
//
//   Why views-per-day, not raw views?
//     Older videos accumulate more views simply because they have
//     had more time. Comparing raw view counts across windows of
//     different ages is structurally biased toward older videos.
//     Views-per-day normalizes for time and measures attention
//     INTENSITY rather than attention TOTAL. A 5-day-old video
//     with 50,000 views (10,000/day) is a stronger present-tense
//     signal than a 5-month-old video with 200,000 views (1,333/day).
//
//   Two velocity factors are blended into the final score:
//
//     1. Attention velocity (70% weight):
//        Median views-per-day of the top 10 videos in each window.
//        Recent median vs baseline median, expressed as percentage
//        change.
//
//     2. Publication velocity (30% weight):
//        Number of videos published in each window. Recent count
//        vs baseline count (normalized to a 30-day rate since the
//        baseline window is 60 days long), expressed as percentage
//        change.
//
//     Final velocity = 0.7 * attentionVelocity + 0.3 * publicationVelocity
//
//   This dual-factor design captures both halves of "is this brand
//   gaining cultural traction":
//     - Are creators making more videos about it? (publication)
//     - Are those videos earning more attention? (views-per-day)
//
// FLOORS (insufficient data = null, not a number):
//   - Each window must contain at least MIN_VIDEO_COUNT videos
//   - Baseline median views-per-day must be at least MIN_BASELINE_VPD
//   Below either floor, the function returns null and the dashboard
//   displays "Insufficient data" rather than a meaningless percentage.
//
// HISTORY:
//   Each successful run appends { value: velocity, weekOf } to the
//   record's youtubeHistory array, trimmed to the most recent 8
//   entries. Same-week duplicates are overwritten.
//
// SCOPE:
//   Updates both BeverageTrend and BrandTrend records. Beverage
//   coverage is preserved here for forward-compatibility with the
//   eventual Trending Categories list.
//
// QUOTA BUDGET (YouTube Data API v3 free tier: 10,000 units/day):
//   - search.list = 100 units per call (2 per term: recent + baseline)
//   - videos.list = 1 unit per call (2 per term)
//   - 10-term batch = ~2,020 units
//   - Full 40-term run = ~8,080 units
//   Identical to the previous implementation.
// ==========================================================================

import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';
import { getSearchTerm } from './taxonomy.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Number of terms per daily batch
const BATCH_SIZE = 10;

// Number of videos to fetch per search
const MAX_RESULTS_PER_SEARCH = 10;

// Maximum history entries to keep
const MAX_HISTORY_LENGTH = 8;

// Minimum videos required in each window for median to be meaningful
const MIN_VIDEO_COUNT = 3;

// Baseline median views-per-day required for velocity to be
// meaningful. Below this floor, percentage swings are dominated
// by tiny absolute numbers and the resulting velocity is statistical
// noise. (Roughly: a brand needs at least one video earning 50
// views per day in the baseline window to qualify for analysis.)
const MIN_BASELINE_VPD = 50;

// Blend weights for the two velocity factors. Must sum to 1.0.
// Attention is weighted higher because the per-video intensity is
// a leading indicator; publication volume is the slower, broader
// confirmation signal.
const ATTENTION_WEIGHT = 0.70;
const PUBLICATION_WEIGHT = 0.30;

// Delay helper (1 second between requests)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// Helper: median of a numeric array
// --------------------------------------------------------------------------
function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// --------------------------------------------------------------------------
// Helper: views per day for a single video
//
// Uses max(days, 1) to avoid divide-by-zero when a video was
// published earlier today. A same-day video reports its raw view
// count as views/day, which is the intuitively correct treatment.
// --------------------------------------------------------------------------
function viewsPerDay(viewCount, publishedAt, asOf = new Date()) {
  const publishedDate = new Date(publishedAt);
  const ageMs = asOf.getTime() - publishedDate.getTime();
  const ageDays = Math.max(ageMs / (1000 * 60 * 60 * 24), 1);
  return viewCount / ageDays;
}

// --------------------------------------------------------------------------
// Helper: percentage change from baseline to recent
//
// Baseline is required to be a positive number. Caller guarantees
// this by enforcing the floor before calling.
// --------------------------------------------------------------------------
function pctChange(recent, baseline) {
  if (baseline <= 0) return 0;
  return ((recent - baseline) / baseline) * 100;
}

// --------------------------------------------------------------------------
// Search YouTube for videos matching a term within a date range.
// Returns an array of { id, publishedAt } objects (publishedAt comes
// from the search snippet).
// --------------------------------------------------------------------------
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
    .filter((item) => item.id?.videoId && item.snippet?.publishedAt)
    .map((item) => ({
      id: item.id.videoId,
      publishedAt: item.snippet.publishedAt,
    }));
}

// --------------------------------------------------------------------------
// Fetch view counts for a list of video IDs.
// Returns a Map of videoId -> viewCount.
//
// Returning a map rather than an array preserves alignment with
// the search-side publishedAt values, since the videos endpoint
// can return items in a different order than requested.
// --------------------------------------------------------------------------
async function getViewCountsById(videoIds) {
  if (videoIds.length === 0) return new Map();

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

  const map = new Map();
  for (const item of items) {
    const views = parseInt(item.statistics?.viewCount || '0', 10);
    map.set(item.id, views);
  }
  return map;
}

// --------------------------------------------------------------------------
// Combine search results with view counts into views-per-day values.
// --------------------------------------------------------------------------
function computeViewsPerDay(videos, viewMap, asOf) {
  const vpdValues = [];
  for (const video of videos) {
    const views = viewMap.get(video.id);
    if (views === undefined) continue;
    vpdValues.push(viewsPerDay(views, video.publishedAt, asOf));
  }
  return vpdValues;
}

// --------------------------------------------------------------------------
// Fetch Social Velocity for a single term.
//
// Returns null when:
//   - Either window contains fewer than MIN_VIDEO_COUNT videos
//   - Baseline median views-per-day is below MIN_BASELINE_VPD
//   - Any API call throws
//
// Returns { velocity, ... details } otherwise.
// --------------------------------------------------------------------------
async function fetchVelocityForTerm(term) {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Recent period: last 30 days
    const recentVideos = await searchVideos(term, thirtyDaysAgo, null);
    await delay(500);
    const recentViewMap = await getViewCountsById(recentVideos.map((v) => v.id));
    await delay(500);

    // Baseline period: 31-90 days ago
    const baselineVideos = await searchVideos(term, ninetyDaysAgo, thirtyDaysAgo);
    await delay(500);
    const baselineViewMap = await getViewCountsById(baselineVideos.map((v) => v.id));

    // Volume floor: each window needs enough videos for median to be meaningful
    if (
      recentVideos.length < MIN_VIDEO_COUNT ||
      baselineVideos.length < MIN_VIDEO_COUNT
    ) {
      console.log(
        `  YouTube: "${term}" insufficient video volume ` +
        `(recent: ${recentVideos.length}, baseline: ${baselineVideos.length}, ` +
        `min: ${MIN_VIDEO_COUNT})`
      );
      return null;
    }

    // Compute views-per-day arrays
    const recentVpd = computeViewsPerDay(recentVideos, recentViewMap, now);
    const baselineVpd = computeViewsPerDay(baselineVideos, baselineViewMap, now);

    const recentMedianVpd = median(recentVpd);
    const baselineMedianVpd = median(baselineVpd);

    // Baseline floor: small numbers produce noisy percentages
    if (baselineMedianVpd < MIN_BASELINE_VPD) {
      console.log(
        `  YouTube: "${term}" baseline too low ` +
        `(${Math.round(baselineMedianVpd)} vpd < ${MIN_BASELINE_VPD} vpd)`
      );
      return null;
    }

    // Factor 1: attention velocity (median views-per-day, recent vs baseline)
    const attentionVelocity = pctChange(recentMedianVpd, baselineMedianVpd);

    // Factor 2: publication velocity (count of videos, normalized for window length)
    // Baseline window is 60 days; recent window is 30 days. Normalize
    // the baseline count to a 30-day rate before comparing.
    const baselineCountNormalized = baselineVideos.length / 2;
    const publicationVelocity = pctChange(
      recentVideos.length,
      baselineCountNormalized
    );

    // Blend the two factors
    const velocity = Math.round(
      ATTENTION_WEIGHT * attentionVelocity +
      PUBLICATION_WEIGHT * publicationVelocity
    );

    return {
      velocity,
      attentionVelocity: Math.round(attentionVelocity),
      publicationVelocity: Math.round(publicationVelocity),
      recentMedianVpd: Math.round(recentMedianVpd),
      baselineMedianVpd: Math.round(baselineMedianVpd),
      recentVideoCount: recentVideos.length,
      baselineVideoCount: baselineVideos.length,
    };
  } catch (error) {
    console.error(`  YouTube fetch error for "${term}": ${error.message}`);
    return null;
  }
}

// --------------------------------------------------------------------------
// Append a velocity value to the youtubeHistory array.
// Trims to MAX_HISTORY_LENGTH entries.
// --------------------------------------------------------------------------
function appendToHistory(record, value) {
  const history = record.youtubeHistory || [];
  const now = new Date();

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

// --------------------------------------------------------------------------
// Process a list of database records, fetching Social Velocity for each.
// Shared logic used by both full update and batch update.
// --------------------------------------------------------------------------
async function processRecords(records) {
  let successes = 0;
  let failures = 0;
  const failedTerms = [];

  for (const record of records) {
    console.log(`  YouTube: fetching velocity for "${record.name}"...`);
    const result = await fetchVelocityForTerm(getSearchTerm(record.name));

    if (result !== null) {
      record.youtubeScore = result.recentMedianVpd;
      record.socialVelocity = result.velocity;
      record.lastYoutubeUpdate = new Date();
      record.youtubeHistory = appendToHistory(record, result.velocity);

      await record.save();

      const direction = result.velocity > 0 ? '+' : '';
      const attentionDir = result.attentionVelocity > 0 ? '+' : '';
      const pubDir = result.publicationVelocity > 0 ? '+' : '';
      console.log(
        `  YouTube: ${record.name} = ${direction}${result.velocity}% ` +
        `(attention ${attentionDir}${result.attentionVelocity}%, ` +
        `publication ${pubDir}${result.publicationVelocity}%) ` +
        `[recent vpd: ${result.recentMedianVpd.toLocaleString()}, ` +
        `baseline vpd: ${result.baselineMedianVpd.toLocaleString()}, ` +
        `${result.recentVideoCount}/${result.baselineVideoCount} videos]`
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

// --------------------------------------------------------------------------
// DAILY CRON: Update YouTube Social Velocity for one batch of terms.
// --------------------------------------------------------------------------
export async function updateYoutubeTrendsBatch() {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  await connectToDatabase();

  const startTime = Date.now();

  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  // Full active set (cap lifted with the brand seed). Sorted by rank
  // so established brands refresh first; the daily batch rotation
  // cycles through the long tail over the following cycles.
  const brands = await BrandTrend.find()
    .sort({ rank: 1, weekOf: -1 });

  const allRecords = [...beverages, ...brands];

  // Calculate which batch to run today
  const totalBatches = Math.ceil(allRecords.length / BATCH_SIZE);
  const startOfYear = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  );
  const batchIndex = totalBatches > 0 ? dayOfYear % totalBatches : 0;

  const start = batchIndex * BATCH_SIZE;
  const batch = allRecords.slice(start, start + BATCH_SIZE);

  const batchNames = batch.map((r) => r.name).join(', ');
  console.log(
    `YouTube Social Velocity: batch ${batchIndex + 1} of ${totalBatches} ` +
    `(${batch.length} terms: ${batchNames})`
  );
  console.log(
    `  Methodology: views-per-day (${ATTENTION_WEIGHT * 100}%) + ` +
    `publication count (${PUBLICATION_WEIGHT * 100}%), ` +
    `floor: ${MIN_BASELINE_VPD} baseline vpd, min ${MIN_VIDEO_COUNT} videos per window`
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
      `YouTube batch ${batchIndex + 1} completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(
      `YouTube batch ${batchIndex + 1} completed successfully in ${totalTime}s`
    );
  }

  return summary;
}

// --------------------------------------------------------------------------
// MANUAL REFRESH: Update YouTube Social Velocity for all terms.
// --------------------------------------------------------------------------
export async function updateYoutubeTrends() {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  await connectToDatabase();

  const startTime = Date.now();

  console.log('Starting YouTube Social Velocity collection...');
  console.log(
    `  Methodology: views-per-day (${ATTENTION_WEIGHT * 100}%) + ` +
    `publication count (${PUBLICATION_WEIGHT * 100}%), ` +
    `floor: ${MIN_BASELINE_VPD} baseline vpd, min ${MIN_VIDEO_COUNT} videos per window`
  );

  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  // Full active set (cap lifted with the brand seed). Sorted by rank
  // so established brands refresh first; the daily batch rotation
  // cycles through the long tail over the following cycles.
  const brands = await BrandTrend.find()
    .sort({ rank: 1, weekOf: -1 });

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
      `YouTube Social Velocity completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(`YouTube Social Velocity completed successfully in ${totalTime}s`);
  }

  return summary;
}