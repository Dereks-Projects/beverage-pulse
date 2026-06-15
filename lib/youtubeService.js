// lib/youtubeService.js
// ==========================================================================
// YouTube Social Velocity service for BeveragePulse.
//
// Two modes of operation:
//   1. updateYoutubeTrends() - all terms at once (manual refresh).
//   2. updateYoutubeTrendsBatch() - one batch per call (daily cron),
//      rotating through the work list by day of year.
//
// METHODOLOGY (2026-05-04 rebuild):
//   For each term we run two YouTube searches:
//     - Recent:   videos published in the last 30 days
//     - Baseline: videos published 31-90 days ago
//   For each video we compute views per day (viewCount / age in days), which
//   measures attention INTENSITY rather than total, so older videos are not
//   structurally favored. The final velocity blends two factors:
//     - Attention velocity (70%): median views-per-day, recent vs baseline
//     - Publication velocity (30%): video count, recent vs baseline
//       (baseline normalized to a 30-day rate)
//   Final velocity = 0.7 * attentionVelocity + 0.3 * publicationVelocity.
//
// FLOORS (insufficient data = null, not a number):
//   - Each window must contain at least MIN_VIDEO_COUNT videos
//   - Baseline median views-per-day must be at least MIN_BASELINE_VPD
//   Below either floor, fetchVelocityForTerm returns null.
//
// AUDIT NOTE (2026-06-04):
//   A term yields no value for two different reasons that must not be
//   confused: a clean below-floor result (checked, too thin) versus an API
//   error such as quota exhaustion (could not check at all). On a clean
//   below-floor result we stamp lastYoutubeUpdate so coverage is auditable.
//   On an error we stamp NOTHING, so a brand we could not check never reads
//   as falsely checked. fetchVelocityForTerm THROWS on an API error and
//   returns null ONLY for a clean below-floor result.
//
// ROSTER WIRING (2026-06-11):
//   The brand work list is now the anchor roster (every brand with an
//   aiRank), not the whole universe. YouTube is the most quota-constrained
//   signal, so scoping it tightly matters most here. The daily batch rotates
//   over (top-20 beverages + roster) instead of (top-20 beverages + every
//   brand), so a full lap is days, and no quota is spent on brands that are
//   not on the board. This replaces the retired gate-survivor wiring.
//
//   Beverages remain a small dormant track for the future categories list.
//   They cost roughly ten percent of the daily batch budget; left in place
//   on purpose, flagged as the first thing to cut if quota tightens.
//
//   A full manual run still exceeds the daily free quota even over the
//   roster, so the daily batch remains the supported path. Brands hit
//   after the quota wall are recorded as errors, not as checked, by design.
//
// BASELINE STARVATION (does NOT apply here):
//   The News service can misread a busy brand as thin because its feed
//   returns only the ~100 most recent items, starving the older baseline
//   window. YouTube does not share that failure. Each window is fetched with
//   its own date-bounded search (recent: published after thirtyDaysAgo;
//   baseline: published between ninetyDaysAgo and thirtyDaysAgo), so a recent
//   surge cannot crowd out the baseline. The windows are independent queries,
//   so the starvation pattern cannot occur.
//
// HISTORY:
//   Each successful run appends { value: velocity, weekOf } to the record's
//   youtubeHistory array, trimmed to the most recent 8 entries. Same-week
//   duplicates are overwritten.
//
// SCOPE:
//   Updates both BeverageTrend and BrandTrend records.
//
// QUOTA BUDGET (YouTube Data API v3 free tier: 10,000 units/day):
//   - Roughly 202 units per term (2 searches at 100 + 2 video lookups at 1).
//   - A 10-term daily batch is about 2,020 units, comfortably within budget.
//   - A full run of the roster is FAR beyond the daily free quota, so
//     it is not safe to run all at once. Use the daily batch.
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

// Baseline median views-per-day required for velocity to be meaningful.
// Below this floor, percentage swings are dominated by tiny absolute
// numbers and the resulting velocity is statistical noise.
const MIN_BASELINE_VPD = 50;

// Blend weights for the two velocity factors. Must sum to 1.0.
const ATTENTION_WEIGHT = 0.70;
const PUBLICATION_WEIGHT = 0.30;

// Delay helper
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
// Uses max(days, 1) to avoid divide-by-zero when a video was published
// earlier today. A same-day video reports its raw view count as views/day.
// --------------------------------------------------------------------------
function viewsPerDay(viewCount, publishedAt, asOf = new Date()) {
  const publishedDate = new Date(publishedAt);
  const ageMs = asOf.getTime() - publishedDate.getTime();
  const ageDays = Math.max(ageMs / (1000 * 60 * 60 * 24), 1);
  return viewCount / ageDays;
}

// --------------------------------------------------------------------------
// Helper: percentage change from baseline to recent
// --------------------------------------------------------------------------
function pctChange(recent, baseline) {
  if (baseline <= 0) return 0;
  return ((recent - baseline) / baseline) * 100;
}

// --------------------------------------------------------------------------
// Search YouTube for videos matching a term within a date range.
// Returns an array of { id, publishedAt }. THROWS on a non-ok response.
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
// Fetch view counts for a list of video IDs. Returns a Map of id -> views.
// THROWS on a non-ok response.
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
// Returns null ONLY for a clean below-floor result (too few videos, or
// baseline median views-per-day below the floor). THROWS on any API error
// (network, quota exhaustion, bad response). The caller relies on this
// split: null means "checked, too thin," a thrown error means "could not
// check." See AUDIT NOTE.
// --------------------------------------------------------------------------
async function fetchVelocityForTerm(term) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Recent period: last 30 days
  const recentVideos = await searchVideos(term, thirtyDaysAgo, null);
  await delay(500);
  const recentViewMap = await getViewCountsById(recentVideos.map((v) => v.id));
  await delay(500);

  // Baseline period: 31-90 days ago (its own date-bounded search, so a recent
  // surge cannot starve it)
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

  // Factor 2: publication velocity (video count, normalized for window length)
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
// Load the work list: the dormant top-20 beverages plus the anchor roster
// (every brand with an aiRank), as savable documents, sorted by aiRank for a
// stable, even rotation. Replaces the retired gate-survivor loader.
//
// Returns { records, brandCount, beverageCount }.
// --------------------------------------------------------------------------
async function loadWorkList() {
  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  const brands = await BrandTrend.find({ aiRank: { $ne: null } }).sort({
    aiRank: 1,
  });

  return {
    records: [...beverages, ...brands],
    brandCount: brands.length,
    beverageCount: beverages.length,
  };
}

// --------------------------------------------------------------------------
// Process a list of database records, fetching Social Velocity for each.
//
// Three outcomes per record:
//   success      - write velocity, stamp lastYoutubeUpdate, append history
//   clean empty  - below floor: stamp lastYoutubeUpdate only (checked,
//                  recorded), no value, no history
//   error        - could not check (network or quota): stamp NOTHING, leave
//                  the record untouched, count it separately
// --------------------------------------------------------------------------
async function processRecords(records) {
  let successes = 0;
  let failures = 0;
  let errors = 0;
  const failedTerms = [];
  const erroredTerms = [];

  for (const record of records) {
    console.log(`  YouTube: fetching velocity for "${record.name}"...`);

    let result;
    try {
      result = await fetchVelocityForTerm(getSearchTerm(record.name));
    } catch (error) {
      // We did not get a clean check. Most often this is quota exhaustion.
      // Do NOT stamp anything: the brand must still read as "not yet
      // checked," never as a false "checked, empty."
      console.error(`  YouTube ERROR (not checked): ${record.name} - ${error.message}`);
      erroredTerms.push(record.name);
      errors++;
      await delay(1000);
      continue;
    }

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
      // Clean below-floor result: searched successfully, data too thin to
      // measure. Record that we checked, without writing a value or history.
      record.lastYoutubeUpdate = new Date();
      await record.save();

      console.log(`  YouTube: ${record.name} - insufficient data (checked, recorded)`);
      failedTerms.push(record.name);
      failures++;
    }

    await delay(1000);
  }

  return { successes, failures, errors, failedTerms, erroredTerms };
}

// --------------------------------------------------------------------------
// DAILY CRON: Update YouTube Social Velocity for one batch of the work list.
//
// The work list is (top-20 beverages + the anchor roster). We do one batch of
// BATCH_SIZE per run, rotated by day of year, so the cron stays within both
// its time budget and the daily quota; the rotation cycles through the
// roster-scoped list, far smaller than the full universe.
//
// An optional explicit batchIndex overrides the day-of-year choice. The cron
// calls this with no argument and is unchanged; the catch-up runner passes an
// index so it can step through several batches in one sitting.
// --------------------------------------------------------------------------
export async function updateYoutubeTrendsBatch({ batchIndex: explicitIndex = null } = {}) {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  await connectToDatabase();

  const startTime = Date.now();

  const { records: allRecords, brandCount, beverageCount } =
    await loadWorkList();

  if (allRecords.length === 0) {
    console.warn('YouTube: no records to process (no beverages, no roster brands).');
    return {
      batch: 0,
      totalBatches: 0,
      termsInBatch: 0,
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
      brandCount: 0,
      totalTime: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const totalBatches = Math.ceil(allRecords.length / BATCH_SIZE);
  const startOfYear = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  );
  const batchIndex =
    totalBatches === 0
      ? 0
      : explicitIndex === null
        ? dayOfYear % totalBatches
        : (((explicitIndex % totalBatches) + totalBatches) % totalBatches);

  const start = batchIndex * BATCH_SIZE;
  const batch = allRecords.slice(start, start + BATCH_SIZE);

  const batchNames = batch.map((r) => r.name).join(', ');
  console.log(
    `YouTube Social Velocity: batch ${batchIndex + 1} of ${totalBatches} ` +
    `over ${allRecords.length} terms (${brandCount} roster brands + ` +
    `${beverageCount} beverages) (${batch.length} terms: ${batchNames})`
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
    brandCount,
    beverageCount,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.errors > 0) {
    console.warn(
      `YouTube batch ${batchIndex + 1}: ${result.errors} term(s) could not be checked ` +
      `(likely quota): ${result.erroredTerms.join(', ')}`
    );
  }
  if (result.failures > 0) {
    console.warn(
      `YouTube batch ${batchIndex + 1} completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else if (result.errors === 0) {
    console.log(
      `YouTube batch ${batchIndex + 1} completed successfully in ${totalTime}s`
    );
  }

  return summary;
}

// --------------------------------------------------------------------------
// MANUAL REFRESH: Update YouTube Social Velocity for the whole work list.
//
// WARNING: a full run far exceeds the daily free quota even over the
// roster-scoped list. Use the daily batch path instead unless you have a
// raised quota. Brands hit after the quota wall are recorded as errors, not
// as checked, by design.
// --------------------------------------------------------------------------
export async function updateYoutubeTrends() {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  await connectToDatabase();

  const startTime = Date.now();

  console.log('Starting YouTube Social Velocity collection over the roster...');
  console.log(
    `  Methodology: views-per-day (${ATTENTION_WEIGHT * 100}%) + ` +
    `publication count (${PUBLICATION_WEIGHT * 100}%), ` +
    `floor: ${MIN_BASELINE_VPD} baseline vpd, min ${MIN_VIDEO_COUNT} videos per window`
  );

  const { records: allRecords, brandCount, beverageCount } =
    await loadWorkList();

  if (allRecords.length === 0) {
    console.warn('No records to process (no beverages, no roster brands).');
    return {
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
      brandCount: 0,
      totalTime: 0,
      timestamp: new Date().toISOString(),
    };
  }

  console.log(
    `  Work list: ${brandCount} roster brands + ${beverageCount} beverages ` +
    `= ${allRecords.length} terms. WARNING: this exceeds the daily free quota; ` +
    `terms past the quota wall will be recorded as errors, not as checked.`
  );

  const result = await processRecords(allRecords);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    ...result,
    brandCount,
    beverageCount,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.errors > 0) {
    console.warn(
      `YouTube Social Velocity: ${result.errors} term(s) could not be checked ` +
      `(likely quota): ${result.erroredTerms.join(', ')}`
    );
  }
  if (result.failures > 0) {
    console.warn(
      `YouTube Social Velocity completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else if (result.errors === 0) {
    console.log(`YouTube Social Velocity completed successfully in ${totalTime}s`);
  }

  return summary;
}