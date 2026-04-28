// lib/powerWebService.js
// ==========================================================================
// PowerWeb: Multi-Layer Web Intelligence for BeveragePulse.
//
// Scrapes 20 sources across 5 intelligence layers to determine
// which beverage terms have the broadest, deepest market signal.
//
// LAYERS:
//   1. Retail     - What's selling (retailer homepages)
//   2. Trade      - What the industry is writing about
//   3. Lifestyle  - What mainstream culture is embracing
//   4. Next-Gen   - What younger demographics care about
//   5. Awards     - What experts are validating
//
// SCORING:
//   1. Fetch each source, extract text, find taxonomy terms
//   2. Score by page position (top = 5x, middle = 3x, bottom = 1x)
//   3. Normalize per source (highest term = 100)
//   4. Average across all sources where term appears
//   5. Apply Layer Breadth Multiplier:
//      - 1 layer:  x 0.50 (niche signal, dampened)
//      - 2 layers: x 0.70 (emerging crossover)
//      - 3 layers: x 0.85 (strong crossover)
//      - 4 layers: x 0.95 (broad consensus)
//      - 5 layers: x 1.00 (full-spectrum signal)
//
// HISTORY TRACKING:
//   Each brand save appends { value, weekOf } to powerWebHistory.
//   PowerWeb runs in batches every weekday, so a 6-day rolling
//   window prevents history from filling with same-week duplicates:
//   if the last entry is within 6 days, overwrite it; otherwise
//   append a new entry. Result: ~1 entry per week, always the
//   most recent score available for that week.
//
//   Beverage records do NOT yet receive history writes. The
//   categories list is roadmapped but not built.
//
// Ethical posture:
//   - Public HTML only, no login or authentication
//   - Standard browser user agent
//   - 5-second delay between requests
//   - Graceful handling of blocks and errors
//   - Editorial sites actively want their content indexed
// ==========================================================================

import * as cheerio from 'cheerio';
import connectToDatabase from './db.js';
import BeverageTrend from '../models/BeverageTrend.js';
import BrandTrend from '../models/BrandTrend.js';
import { BEVERAGE_TERMS, BRAND_TERMS } from './taxonomy.js';

// --------------------------------------------------------------------------
// Source definitions: 20 sources across 5 layers
// --------------------------------------------------------------------------
const SOURCES = [
  // Layer 1: Retail (what's selling)
  { id: 'abcfws', name: 'ABC Fine Wine', url: 'https://www.abcfws.com', layer: 'retail' },
  { id: 'winecom', name: 'Wine.com', url: 'https://www.wine.com', layer: 'retail' },
  { id: 'wineinsiders', name: 'Wine Insiders', url: 'https://www.wineinsiders.com', layer: 'retail' },
  { id: 'reservebar', name: 'ReserveBar', url: 'https://www.reservebar.com', layer: 'retail' },

  // Layer 2: Trade publications (what the industry is writing about)
  { id: 'vinepair', name: 'VinePair', url: 'https://vinepair.com', layer: 'trade' },
  { id: 'punchdrink', name: 'Punch', url: 'https://punchdrink.com', layer: 'trade' },
  { id: 'imbibe', name: 'Imbibe', url: 'https://imbibemagazine.com', layer: 'trade' },
  { id: 'tastingtable', name: 'Tasting Table', url: 'https://www.tastingtable.com', layer: 'trade' },
  { id: 'wineenthusiast', name: 'Wine Enthusiast', url: 'https://www.wineenthusiast.com', layer: 'trade' },
  { id: 'winefolly', name: 'Wine Folly', url: 'https://winefolly.com', layer: 'trade' },
  { id: 'diffordsguide', name: "Difford's Guide", url: 'https://www.diffordsguide.com', layer: 'trade' },

  // Layer 3: Lifestyle (what mainstream culture is embracing)
  { id: 'eater', name: 'Eater', url: 'https://www.eater.com', layer: 'lifestyle' },
  { id: 'bonappetit', name: 'Bon Appétit', url: 'https://www.bonappetit.com', layer: 'lifestyle' },
  { id: 'foodandwine', name: 'Food & Wine', url: 'https://www.foodandwine.com', layer: 'lifestyle' },
  { id: 'thrillist', name: 'Thrillist', url: 'https://www.thrillist.com', layer: 'lifestyle' },

  // Layer 4: Next-Gen (what younger demographics care about)
  { id: 'complex', name: 'Complex', url: 'https://www.complex.com', layer: 'nextgen' },
  { id: 'refinery29', name: 'Refinery29', url: 'https://www.refinery29.com', layer: 'nextgen' },
  { id: 'tasty', name: 'Tasty', url: 'https://tasty.co', layer: 'nextgen' },

  // Layer 5: Awards and recognition (what experts are validating)
  { id: 'decanter', name: 'Decanter', url: 'https://www.decanter.com', layer: 'awards' },
  { id: 'wineandspirits', name: 'Wine & Spirits', url: 'https://www.wineandspiritsmagazine.com', layer: 'awards' },
];

// Layer breadth multipliers
const BREADTH_MULTIPLIERS = {
  1: 0.50,
  2: 0.70,
  3: 0.85,
  4: 0.95,
  5: 1.00,
};

// Number of sources per daily batch
const BATCH_SIZE = 10;

// Delay between requests (milliseconds)
const REQUEST_DELAY = 5000;

// History configuration
const MAX_HISTORY_LENGTH = 8;
const HISTORY_OVERWRITE_WINDOW_DAYS = 6;

// User agent for requests
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// All taxonomy terms combined for searching
const ALL_TERMS = [...BEVERAGE_TERMS, ...BRAND_TERMS];

// --------------------------------------------------------------------------
// Delay helper
// --------------------------------------------------------------------------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// Helper: append a PowerWeb score to a brand's powerWebHistory.
//
// PowerWeb runs in batches every weekday, so without a deduplication
// window the history would fill in 8 days. A 6-day rolling window
// keeps history weekly: if the last entry is within 6 days, it is
// overwritten; otherwise a new entry is appended.
//
// Returns a new array trimmed to MAX_HISTORY_LENGTH.
// --------------------------------------------------------------------------
function appendToPowerWebHistory(existingHistory, value, when) {
  const history = existingHistory ? [...existingHistory] : [];

  const cutoff = new Date(
    when.getTime() - HISTORY_OVERWRITE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  if (lastEntry && new Date(lastEntry.weekOf) > cutoff) {
    history[history.length - 1] = { value, weekOf: when };
  } else {
    history.push({ value, weekOf: when });
  }

  while (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  return history;
}

// --------------------------------------------------------------------------
// Fetch and parse a source page
// --------------------------------------------------------------------------
async function fetchPageContent(source) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(source.url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`  PowerWeb: ${source.name} returned ${response.status}`);
      return null;
    }

    const html = await response.text();

    if (html.length < 500) {
      console.error(`  PowerWeb: ${source.name} returned minimal content (${html.length} chars)`);
      return null;
    }

    // Parse with cheerio, extract text content
    // Keep nav and footer: on retail sites, navigation contains
    // merchandising decisions. On editorial sites, nav contains
    // editorial category priorities. Both are valid signals.
    const $ = cheerio.load(html);

    // Remove only non-content elements
    $('script, style, noscript, iframe, svg').remove();

    // Extract text content preserving document order
    const textContent = $('body').text()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();

    if (textContent.length < 100) {
      console.error(`  PowerWeb: ${source.name} yielded insufficient text (${textContent.length} chars)`);
      return null;
    }

    console.log(`  PowerWeb: ${source.name} fetched (${textContent.length.toLocaleString()} chars) [${source.layer}]`);
    return textContent;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`  PowerWeb: ${source.name} timed out`);
    } else {
      console.error(`  PowerWeb: ${source.name} failed: ${error.message}`);
    }
    return null;
  }
}

// --------------------------------------------------------------------------
// Score terms on a page by position and mention density
// --------------------------------------------------------------------------
function scoreTermsOnPage(pageText, terms) {
  const totalLength = pageText.length;
  const scores = {};

  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

    let match;
    let totalScore = 0;
    let mentionCount = 0;

    while ((match = regex.exec(pageText)) !== null) {
      mentionCount++;

      // Determine position zone
      const position = match.index / totalLength;

      let positionWeight;
      if (position < 0.2) {
        positionWeight = 5;
      } else if (position < 0.8) {
        positionWeight = 3;
      } else {
        positionWeight = 1;
      }

      totalScore += positionWeight;
    }

    if (mentionCount > 0) {
      scores[term] = {
        rawScore: totalScore,
        mentions: mentionCount,
      };
    }
  }

  return scores;
}

// --------------------------------------------------------------------------
// Normalize scores for a single source (highest = 100)
// --------------------------------------------------------------------------
function normalizeSourceScores(rawScores) {
  const maxScore = Math.max(
    ...Object.values(rawScores).map((s) => s.rawScore),
    1
  );

  const normalized = {};

  for (const [term, data] of Object.entries(rawScores)) {
    normalized[term] = Math.round((data.rawScore / maxScore) * 100);
  }

  return normalized;
}

// --------------------------------------------------------------------------
// Process a list of sources, return final scored terms
// --------------------------------------------------------------------------
async function processSources(sourceList) {
  const termAccumulator = {};
  let successCount = 0;
  let failCount = 0;
  const failedSources = [];

  for (const source of sourceList) {
    console.log(`  PowerWeb: scraping ${source.name} [${source.layer}]...`);

    const pageText = await fetchPageContent(source);

    if (pageText === null) {
      failCount++;
      failedSources.push(source.name);
      await delay(REQUEST_DELAY);
      continue;
    }

    // Score all taxonomy terms on this page
    const rawScores = scoreTermsOnPage(pageText, ALL_TERMS);

    if (Object.keys(rawScores).length === 0) {
      console.log(`  PowerWeb: ${source.name} - no taxonomy terms found`);
      failCount++;
      failedSources.push(source.name);
      await delay(REQUEST_DELAY);
      continue;
    }

    // Normalize for this source
    const normalized = normalizeSourceScores(rawScores);

    const termCount = Object.keys(normalized).length;
    console.log(`  PowerWeb: ${source.name} - ${termCount} terms found [${source.layer}]`);

    // Accumulate into cross-source totals
    for (const [term, score] of Object.entries(normalized)) {
      if (!termAccumulator[term]) {
        termAccumulator[term] = {
          total: 0,
          count: 0,
          layers: new Set(),
          breakdown: {},
        };
      }
      termAccumulator[term].total += score;
      termAccumulator[term].count += 1;
      termAccumulator[term].layers.add(source.layer);
      termAccumulator[term].breakdown[source.id] = score;
    }

    successCount++;
    await delay(REQUEST_DELAY);
  }

  // Calculate cross-source averages with layer breadth multiplier
  const finalScores = {};
  for (const [term, data] of Object.entries(termAccumulator)) {
    const avgScore = data.total / data.count;
    const layerCount = data.layers.size;
    const multiplier = BREADTH_MULTIPLIERS[layerCount] || BREADTH_MULTIPLIERS[5];

    const finalScore = Math.round(avgScore * multiplier);

    finalScores[term] = {
      score: finalScore,
      avgBeforeMultiplier: Math.round(avgScore),
      layerCount,
      layerNames: Array.from(data.layers),
      sourceCount: data.count,
      breakdown: data.breakdown,
    };
  }

  return {
    scores: finalScores,
    successCount,
    failCount,
    failedSources,
  };
}

// --------------------------------------------------------------------------
// Save PowerWeb scores to database
// --------------------------------------------------------------------------
async function saveScores(scores) {
  let beverageUpdates = 0;
  let brandUpdates = 0;

  // Update beverage records (history not yet tracked here;
  // will be added when categories list is built)
  const beverages = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  for (const beverage of beverages) {
    const termKey = beverage.name.toLowerCase();
    const scoreData = scores[termKey];

    if (scoreData) {
      beverage.powerWebScore = scoreData.score;
      beverage.lastPowerWebUpdate = new Date();
      beverage.powerWebBreakdown = scoreData.breakdown;
      await beverage.save();
      console.log(
        `  PowerWeb saved: ${beverage.name} = ${scoreData.score}/100 ` +
        `(avg ${scoreData.avgBeforeMultiplier} x ${scoreData.layerCount} layers: ` +
        `${scoreData.layerNames.join(', ')})`
      );
      beverageUpdates++;
    }
  }

  // Update brand records (with powerWebHistory tracking)
  const brands = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  for (const brand of brands) {
    const termKey = brand.name.toLowerCase();
    const scoreData = scores[termKey];

    if (scoreData) {
      brand.powerWebScore = scoreData.score;
      brand.lastPowerWebUpdate = new Date();
      brand.powerWebBreakdown = scoreData.breakdown;
      brand.powerWebHistory = appendToPowerWebHistory(
        brand.powerWebHistory,
        scoreData.score,
        new Date()
      );
      await brand.save();
      console.log(
        `  PowerWeb saved: ${brand.name} = ${scoreData.score}/100 ` +
        `(avg ${scoreData.avgBeforeMultiplier} x ${scoreData.layerCount} layers: ` +
        `${scoreData.layerNames.join(', ')})`
      );
      brandUpdates++;
    }
  }

  return { beverageUpdates, brandUpdates };
}

// --------------------------------------------------------------------------
// DAILY CRON: Process one batch of sources
// --------------------------------------------------------------------------
export async function updatePowerWebBatch() {
  await connectToDatabase();

  const startTime = Date.now();

  // Calculate which batch to run today
  const totalBatches = Math.ceil(SOURCES.length / BATCH_SIZE);
  const startOfYear = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
  );
  const batchIndex = dayOfYear % totalBatches;

  const start = batchIndex * BATCH_SIZE;
  const batch = SOURCES.slice(start, start + BATCH_SIZE);

  const batchNames = batch.map((s) => `${s.name} [${s.layer}]`).join(', ');
  console.log(
    `PowerWeb: batch ${batchIndex + 1} of ${totalBatches} ` +
    `(${batch.length} sources: ${batchNames})`
  );

  const result = await processSources(batch);

  // Save scores to database
  const saved = await saveScores(result.scores);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    batch: batchIndex + 1,
    totalBatches,
    sourcesInBatch: batch.length,
    sourcesSucceeded: result.successCount,
    sourcesFailed: result.failCount,
    failedSources: result.failedSources,
    termsScored: Object.keys(result.scores).length,
    beverageUpdates: saved.beverageUpdates,
    brandUpdates: saved.brandUpdates,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.failCount > 0) {
    console.warn(
      `PowerWeb batch ${batchIndex + 1} completed with ${result.failCount} failures: ` +
      `${result.failedSources.join(', ')}`
    );
  } else {
    console.log(
      `PowerWeb batch ${batchIndex + 1} completed successfully in ${totalTime}s`
    );
  }

  return summary;
}

// --------------------------------------------------------------------------
// FULL RUN: Process all sources at once (manual trigger)
// --------------------------------------------------------------------------
export async function updatePowerWeb() {
  await connectToDatabase();

  const startTime = Date.now();

  console.log(`Starting PowerWeb intelligence collection (${SOURCES.length} sources across 5 layers)...`);

  const result = await processSources(SOURCES);

  // Save scores to database
  const saved = await saveScores(result.scores);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    sourcesScraped: result.successCount,
    sourcesFailed: result.failCount,
    failedSources: result.failedSources,
    termsScored: Object.keys(result.scores).length,
    beverageUpdates: saved.beverageUpdates,
    brandUpdates: saved.brandUpdates,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  if (result.failCount > 0) {
    console.warn(
      `PowerWeb completed with ${result.failCount} failures: ` +
      `${result.failedSources.join(', ')}`
    );
  } else {
    console.log(`PowerWeb completed successfully in ${totalTime}s`);
  }

  return summary;
}