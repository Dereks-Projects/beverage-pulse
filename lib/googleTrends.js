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
//   Split articles into two windows:
//     - Recent:   published in the last 30 days
//     - Baseline: published 31-90 days ago
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
// GATE WIRING (2026-06-05):
//   News collects only the gate survivors, not the whole universe. Each run
//   calls buildGate() for the survivor names and re-loads them as savable
//   documents. The daily batch rotates over the survivor set; the manual
//   refresh does the whole survivor set in one pass.
//
// THROTTLE-SAFE CATCH-UP (2026-06-05):
//   A long sequential full pass of all survivors gets soft-throttled by
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
//   updateGoogleTrendsBatch() - daily cron, one batch of the survivor set
//   updateGoogleTrends()      - manual full pass over the survivor set
// ==========================================================================

import { XMLParser } from 'fast-xml-parser';
import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getDisplayName } from './taxonomy.js';
import { buildGate } from './gate.js';

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
// Load the gate survivors as savable documents.
//
// The gate returns lean objects, which cannot be saved, so we take the
// survivor NAMES and re-load them as real documents, sorted by rank for a
// stable, even rotation.
// --------------------------------------------------------------------------
async function loadSurvivorRecords(survivorNames) {
  if (!survivorNames || survivorNames.length === 0) return [];
  return BrandTrend.find({ name: { $in: survivorNames } }).sort({
    rank: 1,
    weekOf: -1,
  });
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
  const articles = await fetchNewsArticles(query);

  if (articles.length === 0) {
    return null;
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

  const recent = articles.filter((a) => a.pubDate.getTime() >= thirtyDaysAgo);
  const baseline = articles.filter(
    (a) =>
      a.pubDate.getTime() >= ninetyDaysAgo &&
      a.pubDate.getTime() < thirtyDaysAgo
  );

  if (baseline.length < MIN_BASELINE_ARTICLES) {
    return null;
  }

  // Normalize baseline to a 30-day rate so the comparison is apples-to-apples
  // (recent window is 30 days, baseline is 60).
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
// DAILY CRON: Update Google News velocity for one batch of the survivor set.
// Selects which batch to run based on the day of the year, cycling through
// the survivors over the following cycles.
// --------------------------------------------------------------------------
export async function updateGoogleTrendsBatch() {
  await connectToDatabase();

  const startTime = Date.now();

  const { survivorNames, summary: gateSummary } = await buildGate();
  const brands = await loadSurvivorRecords(survivorNames);

  if (brands.length === 0) {
    console.warn('News: no gate survivors to process.');
    return {
      batch: 0,
      totalBatches: 0,
      termsInBatch: 0,
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
      survivorCount: 0,
      gateEligible: gateSummary?.eligibleCount ?? null,
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
    `over ${brands.length} gate survivors (${batch.length} brands: ${batchNames})`
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
    survivorCount: brands.length,
    gateEligible: gateSummary?.eligibleCount ?? null,
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
// MANUAL REFRESH: Update news velocity for the whole survivor set in one
// pass. News uses free public feeds with no quota, so a full pass is safe;
// it is just slow (about 5 seconds per brand).
// --------------------------------------------------------------------------
export async function updateGoogleTrends({ chunkSize = 0, chunkPauseMs = 0 } = {}) {
  await connectToDatabase();

  const startTime = Date.now();

  console.log('Starting Google News Velocity collection over gate survivors...');
  console.log(
    `  Methodology: quoted-name query, articles last 30 days vs prior 60 days, ` +
    `baseline floor: ${MIN_BASELINE_ARTICLES} articles`
  );

  const { survivorNames, summary: gateSummary } = await buildGate();
  const brands = await loadSurvivorRecords(survivorNames);

  if (brands.length === 0) {
    console.warn('News: no gate survivors to process.');
    return {
      successes: 0,
      failures: 0,
      errors: 0,
      failedTerms: [],
      erroredTerms: [],
      survivorCount: 0,
      gateEligible: gateSummary?.eligibleCount ?? null,
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
      `  ${brands.length} gate survivors, throttle-safe: chunks of ${chunkSize}, ` +
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
    console.log(`  ${brands.length} gate survivors to process.`);
    result = await processRecords(brands);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    ...result,
    survivorCount: brands.length,
    gateEligible: gateSummary?.eligibleCount ?? null,
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