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
//   time.
//
// Why it's reliable:
//   The Wikimedia REST API is a public, official endpoint provided
//   by the Wikimedia Foundation specifically for researchers and
//   analysts. One HTTP request per term returns clean JSON.
//
// Velocity methodology (matches News and YouTube):
//   - Recent window:   last 30 days, sum of daily pageviews
//   - Baseline window: prior 60 days, sum of daily pageviews,
//                      normalized to a 30-day rate (divided by 2)
//   - Velocity = ((recent - baselineNormalized) / baselineNormalized) * 100
//
// TWO SIGNALS, NOT ONE (2026-06-04):
//   This article yields two different things, and they are recorded
//   independently:
//     - PAGEVIEWS (presence): the recent 30-day pageview total. This is
//       the gate's signal: are people looking this brand up at all. It is
//       ALWAYS recorded whenever the article exists, even when velocity
//       cannot be computed. A thin-baseline brand with a real recent
//       surge is an early mover and must not be discarded.
//     - VELOCITY (momentum): the percentage change. Only written when the
//       baseline is rich enough (MIN_BASELINE_VIEWS) for the percentage to
//       be meaningful; otherwise null, while pageviews stand on their own.
//
// EVERY CHECK IS RECORDED (2026-06-04):
//   A term can come back three ways, and all three are now recorded so
//   coverage is auditable, matching News and YouTube:
//     - article exists  -> stamp lastWikipediaUpdate, write pageviews
//       (and velocity if rich enough)
//     - 404, no article -> stamp lastWikipediaUpdate with null values, so
//       "no article" is distinguishable from "never checked"
//     - network error   -> stamp NOTHING; we did not get a clean check, so
//       the brand is left untouched and never falsely marked as checked
//
// Floors (insufficient = null velocity, but pageviews still recorded):
//   - Article must exist (a 404 records null values)
//   - Baseline normalized total must be at least MIN_BASELINE_VIEWS for a
//     velocity to be written; below it, velocity is null and pageviews
//     carry the brand
//
// Scope:
//   Updates BOTH BrandTrend and BeverageTrend records.
//
// Idempotency:
//   Same-week runs overwrite the latest history entry rather than
//   pushing a new one. History is trimmed to MAX_HISTORY_LENGTH.
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
const WIKIMEDIA_BASE =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' +
  'en.wikipedia/all-access/user';

// Polite delay between requests.
const REQUEST_DELAY_MS = 200;

// Request timeout
const FETCH_TIMEOUT_MS = 15000;

// Minimum normalized baseline pageviews for a meaningful VELOCITY. Below
// this, velocity is null (the percentage would be noise), but pageviews
// are still recorded as a presence signal.
const MIN_BASELINE_VIEWS = 150;

// History array length per record
const MAX_HISTORY_LENGTH = 8;

// User-Agent. Wikimedia requests an identifying UA on programmatic requests.
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
//
// Returns the daily series when the article exists.
// Returns null ONLY for a 404 (the article does not exist under that title);
// this is a clean result the caller records as "no article."
// THROWS on a network error, timeout, or any non-404 bad response, so the
// caller can tell "we could not check" apart from "no article."
// --------------------------------------------------------------------------
async function fetchPageviews(articleTitle) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

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

    // 404 means the article does not exist under that title. A clean result.
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Wikimedia returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const items = data.items || [];

    return items.map((item) => ({
      date: item.timestamp, // YYYYMMDDHH
      views: item.views || 0,
    }));
  } catch (error) {
    clearTimeout(timeoutId);
    const detail = error.name === 'AbortError' ? 'timeout' : error.message;
    // Re-throw so a network failure is never mistaken for "no article."
    throw new Error(`Wikipedia fetch failed for "${articleTitle}": ${detail}`);
  }
}

// --------------------------------------------------------------------------
// Measure an existing article's pageview series.
//
// Always returns the recent 30-day pageview total (presence). Velocity is
// returned only when there are enough days and the baseline clears the
// floor; otherwise velocity is null while pageviews stand on their own.
// --------------------------------------------------------------------------
function measureArticle(pageviews) {
  const now = Date.now();
  const thirtyDaysAgoMs = now - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgoMs = now - 90 * 24 * 60 * 60 * 1000;

  let recentTotal = 0;
  let baselineTotal = 0;

  for (const point of pageviews) {
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

  const baselineNormalized = baselineTotal / 2;

  let velocity = null;
  if (pageviews.length >= 30 && baselineNormalized >= MIN_BASELINE_VIEWS) {
    velocity = Math.round(
      ((recentTotal - baselineNormalized) / baselineNormalized) * 100
    );
  }

  return {
    recentTotal,
    baselineNormalized: Math.round(baselineNormalized),
    velocity,
    daysWithData: pageviews.length,
  };
}

// --------------------------------------------------------------------------
// Process one taxonomy entry. Records the outcome of every check.
//
// Returns { state } where state is one of:
//   'velocity'   - article exists, pageviews and a meaningful velocity written
//   'presence'   - article exists, pageviews written, velocity too thin (null)
//   'no_article' - 404, recorded with null values (checked, no article)
//   'error'      - could not check; nothing written, record left untouched
// --------------------------------------------------------------------------
async function processEntry({ name, displayName, articleTitle, model }) {
  let pageviews;
  try {
    pageviews = await fetchPageviews(articleTitle);
  } catch (error) {
    console.log(`  Wikipedia: "${displayName}" - not checked (${error.message})`);
    return { state: 'error' };
  }

  // 404: no article under this title. Record the check so it is auditable.
  if (pageviews === null) {
    await model.findOneAndUpdate(
      { name },
      {
        $set: {
          wikipediaVelocity: null,
          wikipediaPageviews: null,
          lastWikipediaUpdate: new Date(),
        },
      },
      { upsert: false }
    );
    console.log(`  Wikipedia: "${displayName}" - no article (checked, recorded)`);
    return { state: 'no_article' };
  }

  // Article exists. Always record pageviews (presence). Record velocity only
  // when the baseline is rich enough; otherwise leave velocity null and do
  // not append a null to the history timeline.
  const measured = measureArticle(pageviews);
  const existing = await model.findOne({ name });

  const newHistory =
    measured.velocity !== null
      ? appendToHistory(existing?.wikipediaHistory, measured.velocity)
      : existing?.wikipediaHistory || [];

  await model.findOneAndUpdate(
    { name },
    {
      $set: {
        wikipediaVelocity: measured.velocity,
        wikipediaPageviews: measured.recentTotal,
        wikipediaHistory: newHistory,
        lastWikipediaUpdate: new Date(),
      },
    },
    { upsert: false }
  );

  if (measured.velocity !== null) {
    const direction = measured.velocity > 0 ? '+' : '';
    console.log(
      `  Wikipedia: ${displayName} = ${direction}${measured.velocity}% velocity ` +
      `(recent 30d: ${measured.recentTotal.toLocaleString()} views)`
    );
    return { state: 'velocity' };
  }

  console.log(
    `  Wikipedia: ${displayName} = presence only ` +
    `(recent 30d: ${measured.recentTotal.toLocaleString()} views, baseline too thin for velocity)`
  );
  return { state: 'presence' };
}

// --------------------------------------------------------------------------
// Main entry point: iterate every brand and beverage category,
// fetch and save Wikipedia data for each.
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
    `velocity floor: ${MIN_BASELINE_VIEWS} normalized views (pageviews always recorded)`
  );

  const brandStates = { velocity: 0, presence: 0, no_article: 0, error: 0 };
  const beverageStates = { velocity: 0, presence: 0, no_article: 0, error: 0 };
  const noArticleBrands = [];
  const erroredBrands = [];

  // ------ Brands ------
  for (const [name, entry] of Object.entries(BRAND_TAXONOMY)) {
    const articleTitle = getWikipediaTitle(name, 'brand');
    const { state } = await processEntry({
      name,
      displayName: entry.display,
      articleTitle,
      model: BrandTrend,
    });

    brandStates[state] = (brandStates[state] || 0) + 1;
    if (state === 'no_article') noArticleBrands.push(entry.display);
    if (state === 'error') erroredBrands.push(entry.display);

    await delay(REQUEST_DELAY_MS);
  }

  // ------ Beverage categories ------
  for (const [name, entry] of Object.entries(BEVERAGE_TAXONOMY)) {
    const articleTitle = getWikipediaTitle(name, 'beverage');
    const { state } = await processEntry({
      name,
      displayName: entry.display,
      articleTitle,
      model: BeverageTrend,
    });

    beverageStates[state] = (beverageStates[state] || 0) + 1;

    await delay(REQUEST_DELAY_MS);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    brands: brandStates,
    beverages: beverageStates,
    noArticleBrands,
    erroredBrands,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  console.log(
    `Wikipedia collection completed in ${totalTime}s.\n` +
    `  Brands: ${brandStates.velocity} with velocity, ${brandStates.presence} presence-only, ` +
    `${brandStates.no_article} no-article, ${brandStates.error} errors.\n` +
    `  Categories: ${beverageStates.velocity} with velocity, ${beverageStates.presence} presence-only, ` +
    `${beverageStates.no_article} no-article, ${beverageStates.error} errors.`
  );

  if (erroredBrands.length > 0) {
    console.warn(`  Not checked (errors): ${erroredBrands.join(', ')}`);
  }

  return summary;
}