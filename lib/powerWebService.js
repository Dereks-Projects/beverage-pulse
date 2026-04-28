// lib/powerWebService.js
// ==========================================================================
// PowerWeb: Cultural + Commercial Intelligence for BeveragePulse.
//
// PowerWeb measures the institutional layer of the beverage market:
// what trade publications are writing about, and what retailers are
// stocking. It complements the three consumer-side signals (Reddit,
// Google, YouTube) by capturing what the supply side is doing.
//
// TWO SUB-SIGNALS, ONE DISPLAY:
//
//   1. Editorial Pulse (60% of combined score)
//      Scrapes archive listing pages from trade publications.
//      A brand mentioned in 8 articles across 4 publications in
//      the last 30 days has earned editorial weight.
//
//   2. Retail Position (40% of combined score)
//      Scrapes retailer category pages. A brand listed near the
//      top of a "Bourbon" collection has earned merchandising
//      weight.
//
//   Each sub-signal is stored in its own database fields so the
//   AI analysis layer can read both independently and write
//   specific predictive sentences. The combined powerWebScore
//   is what displays on the dashboard card.
//
// WHY ARCHIVES, NOT HOMEPAGES:
//   The previous implementation scraped publication homepages.
//   Homepages change hourly, are dominated by editor-of-the-day
//   choices, and are increasingly rendered client-side (JavaScript)
//   so that cheerio finds little content. Archive listing pages
//   are server-rendered, comprehensive, and stable — they show
//   every article in chronological order.
//
// SCORING (per source):
//   1. Fetch the source page, extract text via cheerio
//   2. Score each taxonomy term by mention count and page position:
//        - Top 20% of page: 5x weight
//        - Middle 60% of page: 3x weight
//        - Bottom 20% of page: 1x weight
//      For editorial archives, top of page = newest articles, so
//      position weighting also serves as recency weighting.
//   3. Brand mentions are weighted 2x category mentions, because
//      brands are specific marketing decisions while category
//      mentions are background noise.
//   4. Normalize per source so the highest-scoring term = 100.
//
// SCORING (cross-source):
//   1. Average normalized scores across all sources where a term
//      appears (within editorial set; same separately for retail).
//   2. Apply Layer Breadth Multiplier:
//        - 1 layer:  x 0.50 (niche signal, dampened)
//        - 2 layers: x 0.70 (emerging crossover)
//        - 3 layers: x 0.85 (strong crossover)
//        - 4 layers: x 0.95 (broad consensus)
//        - 5 layers: x 1.00 (full-spectrum signal)
//
// COMBINED SCORE:
//   powerWebScore = round(0.60 * editorialScore + 0.40 * retailScore)
//
//   When only one of the two sub-signals has data for a brand,
//   the combined score uses just that side at full weight rather
//   than half-blending with zero.
//
// ETHICAL POSTURE:
//   - Public HTML only, no login or authentication
//   - Standard browser user agent
//   - 5-second delay between requests
//   - Graceful handling of blocks and errors
//   - All target URLs are public archive and category pages that
//     publishers and retailers actively want indexed for SEO
// ==========================================================================

import * as cheerio from 'cheerio';
import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { BEVERAGE_TERMS, BRAND_TERMS } from './taxonomy.js';

// --------------------------------------------------------------------------
// Editorial sources: trade publication archive listing pages.
// Each source is a paginated archive that surfaces the most recent
// articles. Headlines and dek text are dense with brand and
// category mentions.
// --------------------------------------------------------------------------
const EDITORIAL_SOURCES = [
  {
    id: 'vinepair-booze-news',
    name: 'VinePair Booze News',
    url: 'https://vinepair.com/booze-news/',
    layer: 'trade',
  },
  {
    id: 'vinepair-spirits',
    name: 'VinePair Spirits',
    url: 'https://vinepair.com/explore/category/spirit/?post_type=post',
    layer: 'trade',
  },
  {
    id: 'punch',
    name: 'Punch',
    url: 'https://punchdrink.com/articles/',
    layer: 'trade',
  },
  {
    id: 'imbibe-news',
    name: 'Imbibe News',
    url: 'https://imbibemagazine.com/category/news/',
    layer: 'trade',
  },
  {
    id: 'decanter-news',
    name: 'Decanter Wine News',
    url: 'https://www.decanter.com/wine-news/',
    layer: 'awards',
  },
];

// --------------------------------------------------------------------------
// Retail sources: retailer category pages. Each URL targets one
// beverage category so we capture which brands the retailer is
// merchandising for that category and where they sit in the listing.
// --------------------------------------------------------------------------
const RETAIL_SOURCES = [
  {
    id: 'reservebar-bourbon',
    name: 'ReserveBar Bourbon',
    url: 'https://www.reservebar.com/collections/bourbon',
    layer: 'retail',
  },
  {
    id: 'reservebar-tequila',
    name: 'ReserveBar Tequila',
    url: 'https://www.reservebar.com/collections/tequila',
    layer: 'retail',
  },
  {
    id: 'reservebar-vodka',
    name: 'ReserveBar Vodka',
    url: 'https://www.reservebar.com/collections/vodka',
    layer: 'retail',
  },
  {
    id: 'reservebar-all',
    name: 'ReserveBar All Products',
    url: 'https://www.reservebar.com/collections/all-products',
    layer: 'retail',
  },
  {
    id: 'reservebar-new',
    name: 'ReserveBar New Releases',
    url: 'https://www.reservebar.com/collections/new-releases',
    layer: 'retail',
  },
];

// Layer breadth multipliers
const BREADTH_MULTIPLIERS = {
  1: 0.50,
  2: 0.70,
  3: 0.85,
  4: 0.95,
  5: 1.00,
};

// Brand mentions are weighted higher than category mentions because
// brands are specific marketing decisions while category mentions
// are often background context.
const BRAND_WEIGHT_MULTIPLIER = 2;

// Combined score weighting (must sum to 1.0)
const EDITORIAL_WEIGHT = 0.60;
const RETAIL_WEIGHT = 0.40;

// History configuration
const MAX_HISTORY_LENGTH = 8;
const HISTORY_OVERWRITE_WINDOW_DAYS = 6;

// Delay between requests (milliseconds)
const REQUEST_DELAY = 5000;

// User agent for requests
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// --------------------------------------------------------------------------
// Delay helper
// --------------------------------------------------------------------------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --------------------------------------------------------------------------
// History helper. Uses a 6-day rolling window so the daily cron does
// not flood the array with same-week duplicates.
// --------------------------------------------------------------------------
function appendToHistory(existingHistory, value, when) {
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
// Fetch and parse a source page. Returns lowercased text content,
// or null on failure.
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

    const $ = cheerio.load(html);

    // Remove non-content elements only. Navigation, headlines, and
    // article cards are kept because they carry the primary signal.
    $('script, style, noscript, iframe, svg').remove();

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
// Score a list of terms on a page by mention count and position.
// The weightMultiplier lets us boost brand mentions over category
// mentions when accumulating combined scores.
// --------------------------------------------------------------------------
function scoreTermsOnPage(pageText, terms, weightMultiplier = 1) {
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
        rawScore: totalScore * weightMultiplier,
        mentions: mentionCount,
      };
    }
  }

  return scores;
}

// --------------------------------------------------------------------------
// Normalize scores for a single source so the highest-scoring term
// is set to 100. This makes scores comparable across sources of
// different sizes and content densities.
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
// Process a list of sources and return final scored terms.
// Combines beverage and brand term scoring with brand weighting.
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

    // Score beverage terms (weight 1) and brand terms (weight 2)
    // separately, then merge so brand mentions carry more weight
    // in the per-source normalization step.
    const beverageScores = scoreTermsOnPage(pageText, BEVERAGE_TERMS, 1);
    const brandScores = scoreTermsOnPage(pageText, BRAND_TERMS, BRAND_WEIGHT_MULTIPLIER);
    const rawScores = { ...beverageScores, ...brandScores };

    if (Object.keys(rawScores).length === 0) {
      console.log(`  PowerWeb: ${source.name} - no taxonomy terms found`);
      failCount++;
      failedSources.push(source.name);
      await delay(REQUEST_DELAY);
      continue;
    }

    const normalized = normalizeSourceScores(rawScores);

    const termCount = Object.keys(normalized).length;
    const brandCount = Object.keys(brandScores).length;
    console.log(`  PowerWeb: ${source.name} - ${termCount} terms (${brandCount} brands) [${source.layer}]`);

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

  // Apply layer breadth multiplier
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
// Combine editorial and retail scores into the display value.
// If only one sub-signal has data for a brand, that sub-signal is
// used at full weight rather than half-blending with zero.
// --------------------------------------------------------------------------
function combineScores(editorialScore, retailScore) {
  const hasEditorial = editorialScore !== null && editorialScore !== undefined;
  const hasRetail = retailScore !== null && retailScore !== undefined;

  if (hasEditorial && hasRetail) {
    return Math.round(EDITORIAL_WEIGHT * editorialScore + RETAIL_WEIGHT * retailScore);
  }
  if (hasEditorial) return editorialScore;
  if (hasRetail) return retailScore;
  return null;
}

// --------------------------------------------------------------------------
// Save scores to the database. For each tracked brand, write the
// editorial sub-signal, the retail sub-signal, and the combined
// powerWebScore. Append to all three history arrays.
// --------------------------------------------------------------------------
async function saveScores(editorialScores, retailScores) {
  let brandUpdates = 0;

  const brands = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20);

  const now = new Date();

  for (const brand of brands) {
    const termKey = brand.name.toLowerCase();
    const editorial = editorialScores[termKey] || null;
    const retail = retailScores[termKey] || null;

    if (!editorial && !retail) {
      continue;
    }

    const editorialValue = editorial ? editorial.score : null;
    const retailValue = retail ? retail.score : null;
    const combined = combineScores(editorialValue, retailValue);

    if (editorial) {
      brand.editorialScore = editorialValue;
      brand.lastEditorialUpdate = now;
      brand.editorialBreakdown = editorial.breakdown;
      brand.editorialHistory = appendToHistory(
        brand.editorialHistory,
        editorialValue,
        now
      );
    }

    if (retail) {
      brand.retailScore = retailValue;
      brand.lastRetailUpdate = now;
      brand.retailBreakdown = retail.breakdown;
      brand.retailHistory = appendToHistory(
        brand.retailHistory,
        retailValue,
        now
      );
    }

    if (combined !== null) {
      brand.powerWebScore = combined;
      brand.lastPowerWebUpdate = now;
      brand.powerWebHistory = appendToHistory(
        brand.powerWebHistory,
        combined,
        now
      );

      // Combined breakdown shows both editorial and retail source scores
      // in one map, so the dashboard can render a per-source view.
      const combinedBreakdown = {
        ...(editorial ? editorial.breakdown : {}),
        ...(retail ? retail.breakdown : {}),
      };
      brand.powerWebBreakdown = combinedBreakdown;
    }

    await brand.save();

    const editorialLabel = editorial
      ? `editorial ${editorialValue} (${editorial.layerCount} layers)`
      : 'editorial -';
    const retailLabel = retail
      ? `retail ${retailValue} (${retail.layerCount} layers)`
      : 'retail -';
    const combinedLabel = combined !== null ? `combined ${combined}` : 'no data';

    console.log(
      `  PowerWeb saved: ${brand.name} = ${combinedLabel} ` +
      `(${editorialLabel}, ${retailLabel})`
    );

    brandUpdates++;
  }

  return { brandUpdates };
}

// --------------------------------------------------------------------------
// Main entry point: process all sources, save results.
// --------------------------------------------------------------------------
export async function updatePowerWeb() {
  await connectToDatabase();

  const startTime = Date.now();

  console.log(
    `Starting PowerWeb collection ` +
    `(${EDITORIAL_SOURCES.length} editorial + ${RETAIL_SOURCES.length} retail sources)...`
  );
  console.log(
    `  Brand weight multiplier: ${BRAND_WEIGHT_MULTIPLIER}x, ` +
    `combined blend: ${EDITORIAL_WEIGHT * 100}% editorial / ${RETAIL_WEIGHT * 100}% retail`
  );

  // Editorial pass
  console.log('PowerWeb: editorial pass...');
  const editorialResult = await processSources(EDITORIAL_SOURCES);

  // Retail pass
  console.log('PowerWeb: retail pass...');
  const retailResult = await processSources(RETAIL_SOURCES);

  // Save combined results
  const saved = await saveScores(editorialResult.scores, retailResult.scores);

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    editorialSourcesSucceeded: editorialResult.successCount,
    editorialSourcesFailed: editorialResult.failCount,
    editorialFailedSources: editorialResult.failedSources,
    editorialTermsScored: Object.keys(editorialResult.scores).length,
    retailSourcesSucceeded: retailResult.successCount,
    retailSourcesFailed: retailResult.failCount,
    retailFailedSources: retailResult.failedSources,
    retailTermsScored: Object.keys(retailResult.scores).length,
    brandUpdates: saved.brandUpdates,
    totalTime,
    timestamp: new Date().toISOString(),
  };

  const totalFailures = editorialResult.failCount + retailResult.failCount;

  if (totalFailures > 0) {
    console.warn(
      `PowerWeb completed with ${totalFailures} failures: ` +
      `${[...editorialResult.failedSources, ...retailResult.failedSources].join(', ')}`
    );
  } else {
    console.log(`PowerWeb completed successfully in ${totalTime}s`);
  }

  return summary;
}

// --------------------------------------------------------------------------
// Backward compatibility: the existing /api/cron/powerweb route
// imports updatePowerWebBatch. The batch concept is no longer
// needed (10 sources fit comfortably in one cron run), but we
// keep the export so the cron route does not break.
// --------------------------------------------------------------------------
export async function updatePowerWebBatch() {
  return updatePowerWeb();
}