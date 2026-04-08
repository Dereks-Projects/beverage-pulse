// lib/googleTrends.js
// Google Trends data service for BeveragePulse.
// Fetches search interest data (0-100 scale) for tracked beverage
// and brand terms. Stores current value and appends to a rolling
// history array (capped at 8 weeks) for trend direction analysis.
//
// Defensive design:
//   - Each term is fetched individually with error handling.
//   - Results are written as updates to existing records, never replacements.
//   - If the entire fetch fails, old data stays untouched.
//   - All failures are logged with term name and error message.

import googleTrends from 'google-trends-api';
import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';

// Delay helper for rate limiting (3 seconds between requests)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Maximum number of weekly snapshots to keep per term
const MAX_HISTORY_LENGTH = 8;

/**
 * Fetch Google Trends interest for a single search term.
 * Returns the average interest value (0-100) over the past 7 days,
 * or null if the request fails.
 */
async function fetchInterestForTerm(term) {
  try {
    const result = await googleTrends.interestOverTime({
      keyword: term,
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(),
      geo: 'US',
    });

    const parsed = JSON.parse(result);
    const timelineData = parsed?.default?.timelineData;

    if (!timelineData || timelineData.length === 0) {
      return null;
    }

    // Calculate average interest across the time period
    const total = timelineData.reduce(
      (sum, point) => sum + (point.value?.[0] || 0),
      0
    );

    return Math.round(total / timelineData.length);
  } catch (error) {
    return null;
  }
}

/**
 * Append a value to the googleHistory array on a document.
 * Trims to MAX_HISTORY_LENGTH entries, keeping the most recent.
 */
function appendToHistory(document, value) {
  const history = document.googleHistory || [];
  const now = new Date();

  // Avoid duplicate entries for the same week
  const oneWeekAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  if (lastEntry && new Date(lastEntry.weekOf) > oneWeekAgo) {
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
 * Update Google Trends data for all beverages and brands currently
 * in the database. Only updates records that already exist.
 * Appends to googleHistory for trend direction tracking.
 *
 * Returns a summary object:
 *   { successes, failures, failedTerms, totalTime }
 */
export async function updateGoogleTrends() {
  await connectToDatabase();

  const startTime = Date.now();
  let successes = 0;
  let failures = 0;
  const failedTerms = [];

  console.log('Starting Google Trends data collection...');

  // --- Update beverage records ---
  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  for (const beverage of beverages) {
    const interest = await fetchInterestForTerm(beverage.name);

    if (interest !== null) {
      beverage.googleInterest = interest;
      beverage.lastGoogleUpdate = new Date();
      beverage.googleHistory = appendToHistory(beverage, interest);
      await beverage.save();
      console.log(`  Google Trends: ${beverage.name} = ${interest}`);
      successes++;
    } else {
      console.error(`  Google Trends FAILED: ${beverage.name}`);
      failedTerms.push(beverage.name);
      failures++;
    }

    await delay(3000);
  }

  // --- Update brand records ---
  const brands = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  for (const brand of brands) {
    const interest = await fetchInterestForTerm(brand.name);

    if (interest !== null) {
      brand.googleInterest = interest;
      brand.lastGoogleUpdate = new Date();
      brand.googleHistory = appendToHistory(brand, interest);
      await brand.save();
      console.log(`  Google Trends: ${brand.name} = ${interest}`);
      successes++;
    } else {
      console.error(`  Google Trends FAILED: ${brand.name}`);
      failedTerms.push(brand.name);
      failures++;
    }

    await delay(3000);
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
      `Google Trends completed with ${failures} failures: ${failedTerms.join(', ')}`
    );
  } else {
    console.log(`Google Trends completed successfully in ${totalTime}s`);
  }

  return summary;
}