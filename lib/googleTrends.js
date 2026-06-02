// lib/googleTrends.js
// ==========================================================================
// Google News Velocity service for BeveragePulse.
//
// FILENAME NOTE:
//   This file is named googleTrends.js for path stability — the cron
//   route at /api/cron/google-trends/route.js imports from this path.
//   The contents have been rewritten to fetch Google News data
//   instead. The semantic content is news-based; only the path is
//   trends-named. Future cleanup can rename if desired.
//
// SIGNAL CHANGE (2026-04-28):
//   The previous implementation used the unofficial Google Trends
//   API to measure consumer search interest. That API fails
//   approximately 80% of the time from Vercel's datacenter IP
//   ranges, leaving most brands with no Google data on the
//   dashboard. Diagnostic timing showed pre-flight rejections
//   (sub-300ms failures), not rate limiting, indicating the issue
//   is structural rather than tunable.
//
//   This rewrite uses Google News RSS, which is:
//     - Free and public (no API key required)
//     - Designed for syndication (datacenter IPs are not blocked)
//     - Returns article timestamps suitable for velocity math
//     - Stable in format and URL pattern
//
// METHODOLOGY:
//   For each brand we fetch the Google News RSS feed for the
//   disambiguated search term (e.g. "Patron tequila" not "Patron").
//   The feed returns up to ~100 of the most recent matching
//   articles, each with a publication date and source.
//
//   We split articles into two windows:
//     - Recent:   published in the last 30 days
//     - Baseline: published 31-90 days ago
//
//   Velocity is the percentage change between the recent count
//   and the baseline count, with the baseline normalized to a
//   30-day rate (since it covers a 60-day window):
//     velocity = ((recentCount - baselineCount/2) / (baselineCount/2)) * 100
//
//   A positive velocity means press coverage is accelerating.
//   A negative velocity means coverage is cooling off.
//
// FLOOR (insufficient data = null, not a number):
//   If the baseline window contains fewer than MIN_BASELINE_ARTICLES
//   articles, the term returns null. The dashboard will display
//   "Insufficient data" rather than a noisy percentage derived
//   from one or two articles. This matches the floor pattern used
//   in YouTube velocity.
//
// HISTORY:
//   Each successful run appends { value: velocity, weekOf } to
//   the brand's newsHistory array, trimmed to the most recent 8
//   entries. Same-week duplicates are overwritten.
//
// SCOPE:
//   Brand records only. Beverage records will receive news data
//   when the categories list is built. This matches the brand-only
//   pattern used in Reddit context filtering, YouTube history, and
//   PowerWeb editorial/retail.
//
// EXPORTS:
//   updateGoogleTrendsBatch() — daily cron, processes one batch
//   updateGoogleTrends()       — manual full refresh
//
//   Function names retained for backward compatibility with the
//   cron route. The internals are news-based.
// ==========================================================================

import { XMLParser } from 'fast-xml-parser';
import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getSearchTerm } from './taxonomy.js';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

// Number of brands per daily batch
const BATCH_SIZE = 10;

// Delay between requests (milliseconds). Google News RSS does not
// document a rate limit but politeness suggests pacing.
const REQUEST_DELAY = 5000;

// Minimum articles in the baseline window for a meaningful velocity.
// Below this threshold, percentage swings are dominated by noise.
const MIN_BASELINE_ARTICLES = 3;

// Maximum history entries retained per brand
const MAX_HISTORY_LENGTH = 8;

// Request timeout for the RSS fetch
const FETCH_TIMEOUT_MS = 15000;

// User agent string. RSS endpoints generally do not check this
// strictly, but presenting a real browser identity is polite.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// XML parser configured for RSS. Attributes are ignored because we
// only need the text content of title, pubDate, and source elements.
const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the source name from an RSS <source> element.
 * The element may parse as a plain string or as an object depending
 * on whether attributes were present in the XML.
 */
function getSourceName(sourceField) {
  if (!sourceField) return 'unknown';
  if (typeof sourceField === 'string') return sourceField;
  if (typeof sourceField === 'object') {
    return sourceField['#text'] || String(sourceField) || 'unknown';
  }
  return String(sourceField);
}

/**
 * Append a velocity value to a brand's newsHistory array.
 * Same-week entries (within 2 days) are overwritten rather than
 * appended, so manual refreshes do not pollute the timeline.
 * Returns a new array trimmed to MAX_HISTORY_LENGTH.
 */
function appendToHistory(existingHistory, value) {
  const history = existingHistory ? [...existingHistory] : [];
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
// Fetch and parse the Google News RSS feed for a search term.
//
// Returns an array of { title, pubDate, source } objects.
// Throws on network errors, timeouts, or parse failures.
// --------------------------------------------------------------------------
async function fetchNewsArticles(searchTerm) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(searchTerm)}&hl=en-US&gl=US&ceid=US:en`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Google News returned HTTP ${response.status}`);
    }

    const xml = await response.text();
    const parsed = xmlParser.parse(xml);

    const items = parsed?.rss?.channel?.item;
    if (!items) return [];

    // The XML parser returns a single object when there is one item,
    // and an array when there are multiple. Normalize to array.
    const itemArray = Array.isArray(items) ? items : [items];

    const articles = itemArray
      .map((item) => {
        const pubDate = new Date(item.pubDate);
        return {
          title: typeof item.title === 'string' ? item.title : String(item.title || ''),
          pubDate,
          source: getSourceName(item.source),
        };
      })
      .filter((article) => !isNaN(article.pubDate.getTime()));

    return articles;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// --------------------------------------------------------------------------
// Compute News Velocity for a single search term.
//
// Returns null if the baseline window has fewer than
// MIN_BASELINE_ARTICLES articles, or if any error occurs.
// Returns { velocity, recentCount, baselineCount, ... } otherwise.
// --------------------------------------------------------------------------
async function fetchVelocityForTerm(searchTerm) {
  try {
    const articles = await fetchNewsArticles(searchTerm);

    if (articles.length === 0) {
      return null;
    }

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

    const recent = articles.filter(
      (a) => a.pubDate.getTime() >= thirtyDaysAgo
    );
    const baseline = articles.filter(
      (a) =>
        a.pubDate.getTime() >= ninetyDaysAgo &&
        a.pubDate.getTime() < thirtyDaysAgo
    );

    if (baseline.length < MIN_BASELINE_ARTICLES) {
      return null;
    }

    // Normalize baseline to a 30-day rate so the comparison is
    // apples-to-apples (recent window is 30 days, baseline is 60).
    const baselineNormalized = baseline.length / 2;

    const velocity = Math.round(
      ((recent.length - baselineNormalized) / baselineNormalized) * 100
    );

    const uniqueSources = new Set(articles.map((a) => a.source)).size;

    return {
      velocity,
      recentCount: recent.length,
      baselineCount: baseline.length,
      baselineNormalized: Math.round(baselineNormalized * 10) / 10,
      uniqueSources,
      totalArticles: articles.length,
    };
  } catch (error) {
    console.error(`  News fetch error for "${searchTerm}": ${error.message}`);
    return null;
  }
}

// --------------------------------------------------------------------------
// Process a list of brand records, fetching news velocity for each.
// Shared logic used by both the daily batch cron and the manual
// full refresh.
// --------------------------------------------------------------------------
async function processRecords(records) {
  let successes = 0;
  let failures = 0;
  const failedTerms = [];

  for (const record of records) {
    console.log(`  News: fetching coverage for "${record.name}"...`);
    const result = await fetchVelocityForTerm(getSearchTerm(record.name));

    if (result !== null) {
      record.newsVelocity = result.velocity;
      record.lastNewsUpdate = new Date();
      record.newsHistory = appendToHistory(record.newsHistory, result.velocity);

      await record.save();

      const direction = result.velocity > 0 ? '+' : '';
      console.log(
        `  News: ${record.name} = ${direction}${result.velocity}% velocity ` +
        `(recent 30d: ${result.recentCount} articles, ` +
        `baseline 30d rate: ${result.baselineNormalized} articles, ` +
        `${result.uniqueSources} unique sources)`
      );
      successes++;
    } else {
      console.log(`  News: ${record.name} - insufficient data`);
      failedTerms.push(record.name);
      failures++;
    }

    await delay(REQUEST_DELAY);
  }

  return { successes, failures, failedTerms };
}

// --------------------------------------------------------------------------
// DAILY CRON: Update Google News velocity for one batch of brands.
// Selects which batch to run based on the day of the year, cycling
// through all brands over the course of several days.
// --------------------------------------------------------------------------
export async function updateGoogleTrendsBatch() {
  await connectToDatabase();

  const startTime = Date.now();

  // Full active set (cap lifted with the brand seed). Sorted by rank
  // so established brands refresh first; the daily batch rotation
  // cycles through the long tail over the following cycles.
  const brands = await BrandTrend.find()
    .sort({ rank: 1, weekOf: -1 });

  const totalBatches = Math.ceil(brands.length / BATCH_SIZE);
  const startOfYear = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  );
  const batchIndex = totalBatches > 0 ? dayOfYear % totalBatches : 0;

  const start = batchIndex * BATCH_SIZE;
  const batch = brands.slice(start, start + BATCH_SIZE);

  const batchNames = batch.map((r) => r.name).join(', ');
  console.log(
    `Google News Velocity: batch ${batchIndex + 1} of ${totalBatches} ` +
    `(${batch.length} brands: ${batchNames})`
  );
  console.log(
    `  Methodology: articles in last 30 days vs prior 60 days, ` +
    `baseline floor: ${MIN_BASELINE_ARTICLES} articles`
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
      `News batch ${batchIndex + 1} completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(
      `News batch ${batchIndex + 1} completed successfully in ${totalTime}s`
    );
  }

  return summary;
}

// --------------------------------------------------------------------------
// MANUAL REFRESH: Update news velocity for all brands at once.
// Useful for ad-hoc refreshes via /api/refresh or local testing.
// --------------------------------------------------------------------------
export async function updateGoogleTrends() {
  await connectToDatabase();

  const startTime = Date.now();

  console.log('Starting Google News Velocity collection...');
  console.log(
    `  Methodology: articles in last 30 days vs prior 60 days, ` +
    `baseline floor: ${MIN_BASELINE_ARTICLES} articles`
  );

  // Full active set (cap lifted with the brand seed). Sorted by rank
  // so established brands refresh first; the daily batch rotation
  // cycles through the long tail over the following cycles.
  const brands = await BrandTrend.find()
    .sort({ rank: 1, weekOf: -1 });

  const result = await processRecords(brands);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    ...result,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.failures > 0) {
    console.warn(
      `News collection completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else {
    console.log(`News collection completed successfully in ${totalTime}s`);
  }

  return summary;
}