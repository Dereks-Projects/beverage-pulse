// lib/wikipediaService.js
// ==========================================================================
// WikiTrend (Wikipedia Pageview Velocity) for BeveragePulse.
//
// What this is:
//   Wikipedia is the closest thing on the internet to a free,
//   neutral, audited record of "how many people are looking up a
//   topic right now." For each tracked brand and beverage category
//   we read the last 90 days of daily pageview counts from the
//   article's Wikipedia entry, then compute a velocity number that
//   tells us whether discovery interest is accelerating or cooling.
//
// What "discovery" means here:
//   News tracks press cycles. Reddit tracks community chatter.
//   YouTube tracks creator output. Wikipedia is different: people
//   look something up on Wikipedia AFTER they've heard about it
//   somewhere else. It's a second-touch curiosity signal, very hard
//   for any single party to game, and remarkably consistent over
//   time. A spike in Wikipedia traffic for a beverage brand almost
//   always reflects a real moment of cultural curiosity that has
//   already crossed into mainstream awareness.
//
// Why it's reliable:
//   The Wikimedia REST API is a public, official endpoint provided
//   by the Wikimedia Foundation specifically for researchers and
//   analysts. There is no IP blocking, no rate limit at our scale,
//   no scraping, no JavaScript rendering, no XML parsing. One HTTP
//   request per term returns clean JSON. The full taxonomy (74
//   categories + 153 brands = 227 entries) finishes in well under
//   a minute even with polite pacing.
//
// Velocity methodology (matches News and YouTube):
//   - Recent window:   last 30 days, sum of daily pageviews
//   - Baseline window: prior 60 days, sum of daily pageviews,
//                      normalized to a 30-day rate (divided by 2)
//   - Velocity = ((recent - baselineNormalized) / baselineNormalized) * 100
//
//   Positive: discovery interest is rising relative to baseline.
//   Negative: discovery interest is cooling.
//
// Floors (insufficient data = null, not a number):
//   - Article must exist (a 404 from Wikipedia returns null)
//   - Baseline normalized total must be at least MIN_BASELINE_VIEWS
//     (avoids the +500% noise spikes that come from tiny baselines)
//
// Scope:
//   Updates BOTH BrandTrend and BeverageTrend records. Beverage
//   coverage is included from day one because the eventual Trending
//   Categories list will need this data already in place.
//
// Idempotency:
//   Same-week runs overwrite the latest history entry rather than
//   pushing a new one. Running the cron twice in one day is safe.
//   History is trimmed to the most recent MAX_HISTORY_LENGTH entries.
// ==========================================================================

import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';
import {
  BEVERAGE_TAXONOMY,
  BRAND_TAXONOMY,
  getWikipediaTitle,
} from './taxonomy.js';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

// Wikimedia REST API base URL for pageview data.
// project: en.wikipedia, access: all-access (mobile + desktop + app),
// agent: user (excludes bot traffic, which is exactly what we want).
const WIKIMEDIA_BASE =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' +
  'en.wikipedia/all-access/user';

// Polite delay between requests. Wikimedia does not rate-limit at
// our volume but we pace anyway out of professional courtesy.
const REQUEST_DELAY_MS = 200;

// Request timeout
const FETCH_TIMEOUT_MS = 15000;

// Minimum pageviews in the baseline window (already normalized to
// 30 days) for velocity to be meaningful. A brand whose Wikipedia
// page averaged 2 views/day produces noisy percentages that mean
// nothing; we return null instead.
const MIN_BASELINE_VIEWS = 150;

// History array length per record
const MAX_HISTORY_LENGTH = 8;

// User-Agent. Wikimedia explicitly requests an identifying UA on
// programmatic requests; this helps them route abuse complaints
// correctly and is considered best practice. See:
// https://meta.wikimedia.org/wiki/User-Agent_policy
const USER_AGENT =
  'BeveragePulse/1.0 (https://beverage-pulse.vercel.app; intelligence platform)';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a Date as YYYYMMDD (Wikimedia API requires this format).
 */
function formatDateForApi(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Append a velocity value to a history array.
 * Same-week duplicates (within 2 days) are overwritten rather than
 * pushed, so manual reruns do not pollute the timeline.
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
// Fetch 90 days of daily pageviews for a Wikipedia article title.
// Returns an array of { date, views } or null if the article does
// not exist or any error occurs.
// --------------------------------------------------------------------------
async function fetchPageviews(articleTitle) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Wikipedia titles use underscores in URLs and need encoding for
  // any special characters (apostrophes, accents, ampersands).
  const encodedTitle = encodeURIComponent(articleTitle.replace(/ /g, '_'));

  const start = formatDateForApi(ninetyDaysAgo);
  const end = formatDateForApi(now);
  const url = `${WIKIMEDIA_BASE}/${encodedTitle}/daily/${start}/${end}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 404 means the article does not exist under that title.
    // Return null so the caller can record this as "no data."
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Wikimedia returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const items = data.items || [];

    return items.map((item) => ({
      // item.timestamp is in YYYYMMDDHH format
      date: item.timestamp,
      views: item.views || 0,
    }));
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`  Wikipedia: timeout fetching "${articleTitle}"`);
    } else {
      console.error(`  Wikipedia: error for "${articleTitle}": ${error.message}`);
    }
    return null;
  }
}

// --------------------------------------------------------------------------
// Compute velocity from a 90-day pageview series.
// Returns { velocity, recentTotal, baselineNormalized, daysWithData }
// or null if the data is too sparse to produce a meaningful number.
// --------------------------------------------------------------------------
function computeVelocity(pageviews) {
  if (!pageviews || pageviews.length < 30) {
    return null;
  }

  const now = Date.now();
  const thirtyDaysAgoMs = now - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgoMs = now - 90 * 24 * 60 * 60 * 1000;

  let recentTotal = 0;
  let baselineTotal = 0;

  for (const point of pageviews) {
    // Wikimedia returns YYYYMMDDHH; parse into a Date
    const year = parseInt(point.date.slice(0, 4), 10);
    const month = parseInt(point.date.slice(4, 6), 10) - 1;
    const day = parseInt(point.date.slice(6, 8), 10);
    const pointMs = Date.UTC(year, month, day);

    if (pointMs >= thirtyDaysAgoMs) {
      recentTotal += point.views;
    } else if (pointMs >= ninetyDaysAgoMs) {
      baselineTotal += point.views;
    }
  }

  // Baseline window is 60 days; normalize to a 30-day rate so the
  // recent and baseline figures are directly comparable.
  const baselineNormalized = baselineTotal / 2;

  if (baselineNormalized < MIN_BASELINE_VIEWS) {
    return null;
  }

  const velocity = Math.round(
    ((recentTotal - baselineNormalized) / baselineNormalized) * 100
  );

  return {
    velocity,
    recentTotal,
    baselineNormalized: Math.round(baselineNormalized),
    daysWithData: pageviews.length,
  };
}

// --------------------------------------------------------------------------
// Process one taxonomy entry: fetch pageviews, compute velocity,
// save to the appropriate Mongoose model.
// --------------------------------------------------------------------------
async function processEntry({ name, displayName, articleTitle, model }) {
  const pageviews = await fetchPageviews(articleTitle);

  if (pageviews === null) {
    console.log(`  Wikipedia: "${displayName}" - article not found or fetch error`);
    return { success: false, reason: 'not_found' };
  }

  const result = computeVelocity(pageviews);

  if (result === null) {
    console.log(
      `  Wikipedia: "${displayName}" - insufficient pageview data ` +
      `(${pageviews.length} days returned)`
    );
    return { success: false, reason: 'insufficient_data' };
  }

  // Find the existing record. The cron writes via findOneAndUpdate
  // with upsert so we never delete other signals' data.
  const existing = await model.findOne({ name });

  const newHistory = appendToHistory(
    existing?.wikipediaHistory,
    result.velocity
  );

  await model.findOneAndUpdate(
    { name },
    {
      $set: {
        wikipediaVelocity: result.velocity,
        wikipediaPageviews: result.recentTotal,
        wikipediaHistory: newHistory,
        lastWikipediaUpdate: new Date(),
      },
    },
    { upsert: false } // do not create new records here; only update existing
  );

  const direction = result.velocity > 0 ? '+' : '';
  console.log(
    `  Wikipedia: ${displayName} = ${direction}${result.velocity}% velocity ` +
    `(recent 30d: ${result.recentTotal.toLocaleString()} views, ` +
    `baseline 30d rate: ${result.baselineNormalized.toLocaleString()} views)`
  );

  return { success: true, velocity: result.velocity };
}

// --------------------------------------------------------------------------
// Main entry point: iterate every brand and beverage category,
// fetch and save Wikipedia velocity for each.
// --------------------------------------------------------------------------
export async function updateWikipediaTrends() {
  await connectToDatabase();

  const startTime = Date.now();

  console.log(
    `Starting Wikipedia velocity collection ` +
    `(${Object.keys(BRAND_TAXONOMY).length} brands + ` +
    `${Object.keys(BEVERAGE_TAXONOMY).length} categories)...`
  );
  console.log(
    `  Methodology: pageviews last 30 days vs prior 60 days, ` +
    `baseline floor: ${MIN_BASELINE_VIEWS} normalized views`
  );

  let brandSuccesses = 0;
  let brandFailures = 0;
  let beverageSuccesses = 0;
  let beverageFailures = 0;
  const failedBrands = [];
  const failedBeverages = [];

  // ------ Brands ------
  for (const [name, entry] of Object.entries(BRAND_TAXONOMY)) {
    const articleTitle = getWikipediaTitle(name, 'brand');
    const result = await processEntry({
      name,
      displayName: entry.display,
      articleTitle,
      model: BrandTrend,
    });

    if (result.success) {
      brandSuccesses++;
    } else {
      brandFailures++;
      failedBrands.push(entry.display);
    }

    await delay(REQUEST_DELAY_MS);
  }

  // ------ Beverage categories ------
  for (const [name, entry] of Object.entries(BEVERAGE_TAXONOMY)) {
    const articleTitle = getWikipediaTitle(name, 'beverage');
    const result = await processEntry({
      name,
      displayName: entry.display,
      articleTitle,
      model: BeverageTrend,
    });

    if (result.success) {
      beverageSuccesses++;
    } else {
      beverageFailures++;
      failedBeverages.push(entry.display);
    }

    await delay(REQUEST_DELAY_MS);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    brandsUpdated: brandSuccesses,
    brandsFailed: brandFailures,
    beveragesUpdated: beverageSuccesses,
    beveragesFailed: beverageFailures,
    failedBrands,
    failedBeverages,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  console.log(
    `Wikipedia collection completed in ${totalTime}s: ` +
    `${brandSuccesses} brands updated, ${brandFailures} skipped; ` +
    `${beverageSuccesses} categories updated, ${beverageFailures} skipped`
  );

  return summary;
}