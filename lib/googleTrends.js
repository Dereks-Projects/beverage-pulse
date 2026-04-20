// lib/googleTrends.js
// Google Trends Search Velocity service for BeveragePulse.
//
// Two modes of operation:
//   1. updateGoogleTrends() - attempts all terms at once (manual refresh).
//      Some will fail due to rate limiting. That's expected.
//   2. updateGoogleTrendsBatch() - processes 5 terms per call (daily cron).
//      Automatically rotates through batches based on day of year.
//      Over 8 days, all 40 terms get fresh velocity data.
//
// Fetches 90 days of weekly search interest data for each term.
// Calculates Search Velocity: percentage change between the
// recent period (last ~30 days) and the baseline (prior ~60 days).
//
// What this tells a beverage director:
//   Not "how big is this term" but "is consumer search interest
//   accelerating or decelerating, measured against itself?"
//
// Rate limiting strategy:
//   Google Trends (unofficial API) aggressively rate-limits automated
//   requests. 10-second delay between terms and small batch sizes (5)
//   maximize success rate from Vercel's serverless infrastructure.
//
// Defensive design:
//   - Each term is fetched individually with error handling.
//   - If a single term fails, others continue.
//   - Old data stays untouched on failure.
//   - All failures are logged with term name and error message.

import googleTrends from 'google-trends-api';
import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';
import { getSearchTerm } from './taxonomy.js';

// Delay helper for rate limiting (10 seconds between requests)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Number of terms per daily batch (small to avoid rate limiting)
const BATCH_SIZE = 5;

// Delay between requests (milliseconds)
const REQUEST_DELAY = 10000;

/**
 * Fetch 90 days of Google Trends data for a single term.
 * Returns the full timeline, current value, and calculated
 * Search Velocity, or null on failure.
 *
 * Velocity calculation:
 *   - Split timeline into baseline (~first 2/3) and recent (~last 1/3)
 *   - velocity = ((recentAvg - baselineAvg) / baselineAvg) * 100
 *   - Positive = accelerating, negative = decelerating
 */
async function fetchVelocityForTerm(term) {
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const result = await googleTrends.interestOverTime({
      keyword: term,
      startTime: ninetyDaysAgo,
      endTime: now,
      geo: 'US',
    });

    const parsed = JSON.parse(result);
    const timelineData = parsed?.default?.timelineData;

    if (!timelineData || timelineData.length < 4) {
      return null;
    }

    // Convert to our format: [{value, weekOf}]
    const weeklyData = timelineData.map((point) => ({
      value: point.value?.[0] || 0,
      weekOf: new Date(parseInt(point.time, 10) * 1000),
    }));

    // Most recent data point value
    const currentValue = weeklyData[weeklyData.length - 1].value;

    // Split into baseline and recent periods
    // 2/3 baseline, 1/3 recent (roughly 60 days vs 30 days)
    const splitIndex = Math.max(
      Math.floor(weeklyData.length * 0.67),
      2
    );

    const baselinePoints = weeklyData.slice(0, splitIndex);
    const recentPoints = weeklyData.slice(splitIndex);

    // Calculate averages
    const baselineAvg =
      baselinePoints.reduce((sum, p) => sum + p.value, 0) / baselinePoints.length;
    const recentAvg =
      recentPoints.reduce((sum, p) => sum + p.value, 0) / recentPoints.length;

    // Calculate velocity (percentage change)
    let velocity;
    if (baselineAvg === 0 && recentAvg === 0) {
      velocity = 0;
    } else if (baselineAvg === 0 && recentAvg > 0) {
      velocity = 100;
    } else {
      velocity = Math.round(((recentAvg - baselineAvg) / baselineAvg) * 100);
    }

    return {
      currentValue,
      velocity,
      weeklyData,
      baselineAvg: Math.round(baselineAvg),
      recentAvg: Math.round(recentAvg),
      dataPoints: weeklyData.length,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Process a list of database records, fetching velocity for each.
 * Shared logic used by both full update and batch update.
 * Returns { successes, failures, failedTerms }.
 */
async function processRecords(records) {
  let successes = 0;
  let failures = 0;
  const failedTerms = [];

  for (const record of records) {
    console.log(`  Google: fetching 90-day data for "${record.name}"...`);
    const result = await fetchVelocityForTerm(getSearchTerm(record.name));

    if (result !== null) {
      record.googleInterest = result.currentValue;
      record.searchVelocity = result.velocity;
      record.lastGoogleUpdate = new Date();
      record.googleHistory = result.weeklyData;

      await record.save();

      const direction = result.velocity > 0 ? '+' : '';
      console.log(
        `  Google: ${record.name} = ${result.currentValue}/100 current, ` +
        `${direction}${result.velocity}% velocity ` +
        `(baseline: ${result.baselineAvg}, recent: ${result.recentAvg}, ` +
        `${result.dataPoints} data points)`
      );
      successes++;
    } else {
      console.error(`  Google FAILED: ${record.name}`);
      failedTerms.push(record.name);
      failures++;
    }

    await delay(REQUEST_DELAY);
  }

  return { successes, failures, failedTerms };
}

/**
 * DAILY CRON: Update Google Trends for one batch of terms.
 * Automatically selects which batch to run based on the current
 * day of the year. Cycles through all terms over multiple days.
 *
 * With 40 terms and BATCH_SIZE of 5, the full cycle takes 8 days.
 * The system scales automatically as terms grow.
 *
 * Returns a summary object with batch info.
 */
export async function updateGoogleTrendsBatch() {
  await connectToDatabase();

  const startTime = Date.now();

  // Get all current records
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

  // Slice out today's batch
  const start = batchIndex * BATCH_SIZE;
  const batch = allRecords.slice(start, start + BATCH_SIZE);

  const batchNames = batch.map((r) => r.name).join(', ');
  console.log(
    `Google Search Velocity: batch ${batchIndex + 1} of ${totalBatches} ` +
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
      `Google batch ${batchIndex + 1} completed with ${result.failures} failures: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(
      `Google batch ${batchIndex + 1} completed successfully in ${totalTime}s`
    );
  }

  return summary;
}

/**
 * MANUAL REFRESH: Attempt to update all terms at once.
 * Many will fail due to rate limiting. That's expected.
 * The daily cron fills in the gaps.
 */
export async function updateGoogleTrends() {
  await connectToDatabase();

  const startTime = Date.now();

  console.log('Starting Google Trends Search Velocity collection (90-day window)...');

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
      `Google Search Velocity completed with ${result.failures} failures: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(`Google Search Velocity completed successfully in ${totalTime}s`);
  }

  return summary;
}