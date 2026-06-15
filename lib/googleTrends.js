// lib/googleTrends.js
// ==========================================================================
// Google News Velocity service for BeveragePulse.
//
// FILENAME NOTE:
//   Named googleTrends.js for path stability: the cron route at
//   /api/cron/google-trends/route.js imports from this path. The contents
//   are news-based; only the path is trends-named. Function names are kept
//   for backward compatibility with that route.
//
// SOURCE:
//   Google News RSS, a free public feed that returns up to ~100 of the most
//   recent matching articles, each with a publication date and source.
//
// QUERY FORM (2026-06-05):
//   We query the brand's quoted display name alone, for example "Campari" or
//   "White Claw". We do NOT append a category word.
//
//   Diagnostics drove this. Appending the category word ("Campari liqueur",
//   "Crown Royal whisky") is treated by Google as a required term, and that
//   word often does not appear in real coverage, so it threw away the real
//   articles and the feed backfilled with ancient ones. The quoted name
//   restores full coverage for distinctive names and, for multi-word names,
//   enforces the exact phrase so unrelated articles are not matched.
//
//   Collision names (Prime, Corona) are handled by the floor below, not by a
//   qualifier. A name so common it floods with off-topic articles fills only
//   the recent window, leaving the baseline window empty, so it falls below
//   the floor and returns an honest null rather than a noisy number. Steady
//   background pollution reads as flat (velocity measures change), so it does
//   not create a false riser; an event-driven spike on a collision name is
//   caught by corroboration in the ranking layer, where a lone News spike
//   with flat Reddit, Wikipedia, and YouTube is treated as a flag, not a
//   confirmed move.
//
// VELOCITY METHODOLOGY:
//   Two date-bounded searches, one per window, counted separately:
//     - Recent:   published in the last 30 days
//     - Baseline: published 31-90 days ago
//   Each window is queried directly with date operators rather than split out
//   of one recency-capped feed, so a heavily covered brand's baseline window
//   is not starved. See TWO-WINDOW FIX below.
//   Velocity is the percentage change between the recent count and the
//   baseline count, with the baseline normalized to a 30-day rate (it covers
//   a 60-day window):
//     velocity = ((recentCount - baselineCount/2) / (baselineCount/2)) * 100
//   Positive means coverage is accelerating; negative means it is cooling.
//
// FLOOR (insufficient data = null, not a number):
//   If the baseline window has fewer than MIN_BASELINE_ARTICLES articles, the
//   term returns null. This is the collision-noise guard described above.
//
// ERROR VS EMPTY SPLIT (2026-06-05):
//   A term yields no value for two different reasons that must not be
//   confused: a clean below-floor result (checked, too thin) versus a fetch
//   error such as a timeout or a bad HTTP status (could not check at all).
//   On a clean below-floor result we stamp lastNewsUpdate so coverage is
//   auditable. On an error we stamp NOTHING, so a brand we could not reach
//   never reads as falsely checked. fetchVelocityForTerm THROWS on a fetch
//   error and returns null ONLY for a clean below-floor or empty feed. This
//   mirrors the split already proven on the YouTube service.
//
// TWO-WINDOW FIX (2026-06-11):
//   Earlier this pulled one recency-sorted feed and split it by date. Google
//   News RSS caps that feed near 100 of the most recent items, so the biggest
//   brands (Red Bull, Monster, Prime) had no items old enough to fill the
//   31-90 day baseline, tripped the floor, and returned a false null. Each
//   window is now its own date-bounded query, so the baseline is reached
//   directly. Results are still filtered by parsed publish date, so a loose
//   date operator cannot miscount; the method can only match or beat the old
//   one. This mirrors how the YouTube service already queries its two windows.
//
// ROSTER WIRING (2026-06-11):
//   News collects the anchor roster: every brand the loader gave an aiRank.
//   Each run loads those brands as savable documents, sorted by aiRank for a
//   stable, even rotation. The daily batch rotates over the roster; the
//   manual refresh does the whole roster in one pass. This replaces the
//   retired gate-survivor wiring.
//
// THROTTLE-SAFE CATCH-UP (2026-06-05):
//   A long sequential full pass of all roster brands gets soft-throttled by
//   Google News, which returns thinned feeds that trip the floor. Confirmed:
//   brands that fail in a 172-request pass all pass in isolation. The daily
//   cron (ten requests) never hits this. For the manual catch-up, pass
//   { chunkSize, chunkPauseMs } to process in small chunks with a pause
//   between them, matching the low-volume cadence the cron uses. With no
//   options the pass runs straight through, as before.
//
// HISTORY:
//   Each successful run appends { value, weekOf } to newsHistory, trimmed to
//   the most recent 8 entries. Same-week entries are overwritten.
//
// SCOPE:
//   Brand records only.
//
// EXPORTS:
//   updateGoogleTrendsBatch() - daily cron, one batch of the roster
//   updateGoogleTrends()      - manual full pass over the roster
// ==========================================================================

import { XMLParser } from 'fast-xml-parser';
import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getDisplayName } from './taxonomy.js';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

// Number of brands per daily batch
const BATCH_SIZE = 10;

// Delay between requests (milliseconds). Google News RSS does not document a
// rate limit but politeness suggests pacing.
const REQUEST_DELAY = 5000;

// Minimum articles in the baseline window for a meaningful velocity. Below
// this, percentage swings are noise, and a collision name's off-topic flood
// (which lands in the recent window) is rejected here.
const MIN_BASELINE_ARTICLES = 3;

// Articles per window at which the feed is treated as saturated. Google News
// RSS returns at most ~100 of the most recent items, so when BOTH windows sit
// at that ceiling the true counts are censored and a rate of change cannot be
// read. We report flat and flag it rather than emit the ceiling artifact.
const SATURATION_COUNT = 95;

// Maximum history entries retained per brand
const MAX_HISTORY_LENGTH = 8;

// Request timeout for the RSS fetch
const FETCH_TIMEOUT_MS = 15000;

// User agent string. RSS endpoints generally do not check this strictly, but
// presenting a real browser identity is polite.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// XML parser configured for RSS. Attributes are ignored because we only need
// the text content of title, pubDate, and source elements.
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
 * Build the News query for a brand: the quoted display name alone.
 * Quoting enforces the exact phrase for multi-word names and is a no-op for
 * single words. No category qualifier is appended (see QUERY FORM note).
 */
function buildNewsQuery(name) {
  const display = getDisplayName(name, 'brand');
  return `"${display}"`;
}

/**
 * Format a timestamp as YYYY-MM-DD for the Google News after:/before: date
 * operators. UTC so the window boundaries do not drift with the local zone.
 */
function toQueryDate(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extract the source name from an RSS <source> element. The element may parse
 * as a plain string or as an object depending on whether attributes were
 * present in the XML.
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
 * Append a velocity value to a brand's newsHistory array. Same-week entries
 * (within 2 days) are overwritten rather than appended, so manual refreshes
 * do not pollute the timeline. Returns a new array trimmed to
 * MAX_HISTORY_LENGTH.
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
// Load the anchor roster as savable documents: every brand the loader gave
// an aiRank, sorted by aiRank for a stable, even rotation. Replaces the
// retired gate-survivor loader.
// --------------------------------------------------------------------------
async function loadRosterRecords() {
  return BrandTrend.find({ aiRank: { $ne: null } }).sort({ aiRank: 1 });
}

// --------------------------------------------------------------------------
// TARGETED RE-CHECK: run the News velocity check for a specific short list of
// brand keys, with no chunk pause. For spot-checking a handful of brands
// after a full pass without paying for the whole roster. Reuses the same
// query, floor, history, and error-versus-empty split as every other path,
// so a re-check cannot drift from the real pipeline.
//
// names: an array of stored brand keys (the same strings the summaries print,
// for example "red bull", "ciroc", "d-usse"). Case-insensitive.
// Returns the standard result shape plus requested, found, and missing.
// --------------------------------------------------------------------------
export async function recheckNewsByNames(names) {
  await connectToDatabase();

  const wanted = Array.isArray(names)
    ? names.map((n) => String(n).trim().toLowerCase()).filter(Boolean)
    : [];

  if (wanted.length === 0) {
    return {
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
      requested: 0,
      found: 0,
      missing: [],
      timestamp: new Date().toISOString(),
    };
  }

  const brands = await BrandTrend.find({ name: { $in: wanted } });
  const foundNames = new Set(brands.map((b) => b.name.toLowerCase()));
  const missing = wanted.filter((n) => !foundNames.has(n));

  console.log(
    `News re-check: ${brands.length} of ${wanted.length} brands found, ` +
    `no pause between requests.`
  );
  if (missing.length > 0) {
    console.warn(`  Not in the database (skipped): ${missing.join(', ')}`);
  }

  const result = await processRecords(brands);

  return {
    ...result,
    requested: wanted.length,
    found: brands.length,
    missing,
    timestamp: new Date().toISOString(),
  };
}

// --------------------------------------------------------------------------
// Fetch and parse the Google News RSS feed for a query.
//
// Returns an array of { title, pubDate, source } objects on success (which
// may be empty if the feed has no items). THROWS on a network error, a
// timeout, or a non-ok HTTP status, so the caller can tell "could not check"
// apart from "checked, empty."
// --------------------------------------------------------------------------
async function fetchNewsArticles(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml',
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

    // The XML parser returns a single object when there is one item, and an
    // array when there are multiple. Normalize to an array.
    const itemArray = Array.isArray(items) ? items : [items];

    return itemArray
      .map((item) => ({
        title:
          typeof item.title === 'string' ? item.title : String(item.title || ''),
        pubDate: new Date(item.pubDate),
        source: getSourceName(item.source),
      }))
      .filter((article) => !isNaN(article.pubDate.getTime()));
  } catch (error) {
    clearTimeout(timeoutId);
    const detail = error.name === 'AbortError' ? 'timeout' : error.message;
    // Re-throw so a fetch failure is never mistaken for "checked, empty."
    throw new Error(`News fetch failed for "${query}": ${detail}`);
  }
}

// --------------------------------------------------------------------------
// Compute News Velocity for a single query.
//
// Returns null ONLY for a clean below-floor or empty result (checked, too
// thin). THROWS on any fetch error, propagated from fetchNewsArticles. The
// caller relies on this split: null means "checked, too thin," a thrown error
// means "could not check." See ERROR VS EMPTY SPLIT.
// --------------------------------------------------------------------------
async function fetchVelocityForTerm(query) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

  // One date-bounded search per window, instead of one recency-capped feed
  // split by date. This reaches the older baseline articles the ~100-item cap
  // would otherwise hide (see TWO-WINDOW FIX). The date operators are a hint,
  // so each result is still filtered by parsed publish date below: that makes
  // the counts correct even if the operator is loose, so the method can only
  // match or beat the single-feed approach.
  const recentQuery = `${query} after:${toQueryDate(thirtyDaysAgo)}`;
  const baselineQuery =
    `${query} after:${toQueryDate(ninetyDaysAgo)} before:${toQueryDate(thirtyDaysAgo)}`;

  const recentArticles = await fetchNewsArticles(recentQuery);
  const baselineArticles = await fetchNewsArticles(baselineQuery);

  const recent = recentArticles.filter(
    (a) => a.pubDate.getTime() >= thirtyDaysAgo
  );
  const baseline = baselineArticles.filter(
    (a) =>
      a.pubDate.getTime() >= ninetyDaysAgo &&
      a.pubDate.getTime() < thirtyDaysAgo
  );

  // Nothing in either window: checked, empty. A clean null, not an error.
  if (recent.length === 0 && baseline.length === 0) {
    return null;
  }

  if (baseline.length < MIN_BASELINE_ARTICLES) {
    return null;
  }

  // Normalize baseline to a 30-day rate so the comparison is apples-to-apples
  // (recent window is 30 days, baseline is 60).
  const baselineNormalized = baseline.length / 2;

  // Saturation guard. When BOTH windows sit at the feed cap, the article
  // counts are censored at ~100, so the normalization manufactures a fixed
  // ~+100% that is an artifact of the ceiling, not real movement. In that
  // case the rate of change is not measurable from this source: report flat
  // and flag it. Brands below the cap are unaffected and measured as before.
  const saturated =
    recent.length >= SATURATION_COUNT && baseline.length >= SATURATION_COUNT;

  const velocity = saturated
    ? 0
    : Math.round(((recent.length - baselineNormalized) / baselineNormalized) * 100);

  const uniqueSources = new Set(
    [...recent, ...baseline].map((a) => a.source)
  ).size;

  return {
    velocity,
    saturated,
    recentCount: recent.length,
    baselineCount: baseline.length,
    baselineNormalized: Math.round(baselineNormalized * 10) / 10,
    uniqueSources,
    totalArticles: recent.length + baseline.length,
  };
}

// --------------------------------------------------------------------------
// Process a list of brand records, fetching news velocity for each.
//
// Three outcomes per record:
//   success      - write velocity, stamp lastNewsUpdate, append history
//   clean empty  - below floor or empty feed: stamp lastNewsUpdate only
//                  (checked, recorded), no value, no history
//   error        - could not check (network, timeout, bad status): stamp
//                  NOTHING, leave the record untouched, count it separately
// --------------------------------------------------------------------------
async function processRecords(records) {
  let successes = 0;
  let failures = 0;
  let errors = 0;
  const failedTerms = [];
  const erroredTerms = [];

  for (const record of records) {
    console.log(`  News: fetching coverage for "${record.name}"...`);

    let result;
    try {
      result = await fetchVelocityForTerm(buildNewsQuery(record.name));
    } catch (error) {
      // We did not get a clean check. Do NOT stamp anything: the brand must
      // still read as "not yet checked," never as a false "checked, empty."
      console.error(`  News ERROR (not checked): ${record.name} - ${error.message}`);
      erroredTerms.push(record.name);
      errors++;
      await delay(REQUEST_DELAY);
      continue;
    }

    if (result !== null) {
      record.newsVelocity = result.velocity;
      record.newsSaturated = result.saturated === true;
      record.lastNewsUpdate = new Date();
      record.newsHistory = appendToHistory(record.newsHistory, result.velocity);

      await record.save();

      if (result.saturated) {
        console.log(
          `  News: ${record.name} = flat, saturated ` +
          `(both windows at the feed cap: recent ${result.recentCount}, ` +
          `baseline ${result.baselineCount}, ${result.uniqueSources} unique sources)`
        );
      } else {
        const direction = result.velocity > 0 ? '+' : '';
        console.log(
          `  News: ${record.name} = ${direction}${result.velocity}% velocity ` +
          `(recent 30d: ${result.recentCount} articles, ` +
          `baseline 30d rate: ${result.baselineNormalized} articles, ` +
          `${result.uniqueSources} unique sources)`
        );
      }
      successes++;
    } else {
      // Clean below-floor or empty. Record that we checked, without writing a
      // value or polluting the history timeline.
      record.lastNewsUpdate = new Date();
      await record.save();

      console.log(`  News: ${record.name} - insufficient data (checked, recorded)`);
      failedTerms.push(record.name);
      failures++;
    }

    await delay(REQUEST_DELAY);
  }

  return { successes, failures, errors, failedTerms, erroredTerms };
}

// --------------------------------------------------------------------------
// DAILY CRON: Update Google News velocity for one batch of the roster.
// Selects which batch to run based on the day of the year, cycling through
// the roster over the following cycles.
// --------------------------------------------------------------------------
export async function updateGoogleTrendsBatch() {
  await connectToDatabase();

  const startTime = Date.now();

  const brands = await loadRosterRecords();

  if (brands.length === 0) {
    console.warn('News: no roster brands to process.');
    return {
      batch: 0,
      totalBatches: 0,
      termsInBatch: 0,
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
      rosterCount: 0,
      totalTime: 0,
      timestamp: new Date().toISOString(),
    };
  }

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
    `over ${brands.length} roster brands (${batch.length} brands: ${batchNames})`
  );
  console.log(
    `  Methodology: quoted-name query, articles last 30 days vs prior 60 days, ` +
    `baseline floor: ${MIN_BASELINE_ARTICLES} articles`
  );

  const result = await processRecords(batch);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    batch: batchIndex + 1,
    totalBatches,
    termsInBatch: batch.length,
    ...result,
    rosterCount: brands.length,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.errors > 0) {
    console.warn(
      `News batch ${batchIndex + 1}: ${result.errors} term(s) could not be checked: ` +
      `${result.erroredTerms.join(', ')}`
    );
  }
  if (result.failures > 0) {
    console.warn(
      `News batch ${batchIndex + 1} completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else if (result.errors === 0) {
    console.log(
      `News batch ${batchIndex + 1} completed successfully in ${totalTime}s`
    );
  }

  return summary;
}

// --------------------------------------------------------------------------
// MANUAL REFRESH: Update news velocity for the whole roster in one
// pass. News uses free public feeds with no quota, so a full pass is safe;
// it is just slow (about 5 seconds per brand).
// --------------------------------------------------------------------------
export async function updateGoogleTrends({ chunkSize = 0, chunkPauseMs = 0 } = {}) {
  await connectToDatabase();

  const startTime = Date.now();

  console.log('Starting Google News Velocity collection over the roster...');
  console.log(
    `  Methodology: quoted-name query, articles last 30 days vs prior 60 days, ` +
    `baseline floor: ${MIN_BASELINE_ARTICLES} articles`
  );

  const brands = await loadRosterRecords();

  if (brands.length === 0) {
    console.warn('News: no roster brands to process.');
    return {
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
      rosterCount: 0,
      totalTime: 0,
      timestamp: new Date().toISOString(),
    };
  }

  let result;
  if (chunkSize > 0) {
    // Throttle-safe mode: process in small chunks with a pause between them,
    // so the request rate stays near the cron's low cadence and Google does
    // not start returning thinned feeds. See THROTTLE-SAFE CATCH-UP note.
    console.log(
      `  ${brands.length} roster brands, throttle-safe: chunks of ${chunkSize}, ` +
      `pausing ${Math.round(chunkPauseMs / 1000)}s between chunks.`
    );
    result = {
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
    };
    const totalChunks = Math.ceil(brands.length / chunkSize);
    for (let i = 0; i < totalChunks; i++) {
      const chunk = brands.slice(i * chunkSize, (i + 1) * chunkSize);
      console.log(`  Chunk ${i + 1} of ${totalChunks} (${chunk.length} brands)...`);
      const r = await processRecords(chunk);
      result.successes += r.successes;
      result.failures += r.failures;
      result.errors += r.errors;
      result.failedTerms.push(...r.failedTerms);
      result.erroredTerms.push(...r.erroredTerms);
      if (i < totalChunks - 1 && chunkPauseMs > 0) {
        console.log(`  Pausing ${Math.round(chunkPauseMs / 1000)}s before the next chunk...`);
        await delay(chunkPauseMs);
      }
    }
  } else {
    console.log(`  ${brands.length} roster brands to process.`);
    result = await processRecords(brands);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    ...result,
    rosterCount: brands.length,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.errors > 0) {
    console.warn(
      `News collection: ${result.errors} term(s) could not be checked: ` +
      `${result.erroredTerms.join(', ')}`
    );
  }
  if (result.failures > 0) {
    console.warn(
      `News collection completed with ${result.failures} terms below floor: ` +
      `${result.failedTerms.join(', ')}`
    );
  } else if (result.errors === 0) {
    console.log(`News collection completed successfully in ${totalTime}s`);
  }

  return summary;
}