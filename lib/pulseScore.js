// lib/pulseScore.js
// ==========================================================================
// BeveragePulse scoring engine.
//
// Two distinct formulas for two distinct intelligence products:
//
// PRODUCT PULSE (brands):
//   Equal weight across all available signals.
//   Buzz + Search Velocity + Social Velocity + PowerWeb (25% each).
//   Answers: "Which specific products should I act on right now?"
//
// MARKET PULSE (beverage subcategories):
//   PowerWeb-heavy with Search/Social confirmation. No Reddit Buzz.
//   PowerWeb (67%) + Search Velocity (17%) + Social Velocity (16%).
//   Answers: "Which categories are the market moving toward?"
//
//   Reddit Buzz is excluded from Market Pulse because consumers
//   search "pinot noir" on Google and watch "pinot noir" on YouTube,
//   but on Reddit they say "Meiomi" (the brand). Buzz data flows
//   through Product Pulse where it belongs.
//
//   Until PowerWeb is built, Market Pulse uses Search and Social
//   velocity only, which still captures subcategory demand accurately.
//
// Velocity-to-score conversion:
//   -100% or worse = 0
//   0% (flat)      = 50
//   +100% or more  = 100
// ==========================================================================

/**
 * Convert a velocity percentage (-100 to +100) to a 0-100 score.
 * 0% = 50 (flat). Clamped to 0-100 range.
 */
function velocityToScore(velocityPercent) {
  const score = 50 + (velocityPercent / 2);
  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Normalize a buzz (Reddit) score to 0-100 using the max score
 * in the current dataset as the ceiling.
 */
function normalizeBuzz(score, maxScore) {
  if (!maxScore || maxScore === 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (score / maxScore) * 100)));
}

/**
 * PRODUCT PULSE: for brands.
 * Equal weight across all available signals.
 * Buzz (25%) + Search (25%) + Social (25%) + PowerWeb (25%).
 * Adapts to however many signals are available.
 *
 * @param {Object} trend - The trend document from MongoDB
 * @param {number} maxScore - The highest Reddit score in the current dataset
 * @returns {number|null} The Pulse score (0-100), or null if no data
 */
export function calculateProductPulse(trend, maxScore) {
  const signals = [];

  // Buzz (Reddit engagement, normalized to 0-100)
  if (trend.score !== null && trend.score !== undefined && trend.score > 0) {
    signals.push(normalizeBuzz(trend.score, maxScore));
  }

  // Search Velocity (Google, converted from % to 0-100)
  if (trend.searchVelocity !== null && trend.searchVelocity !== undefined) {
    signals.push(velocityToScore(trend.searchVelocity));
  }

  // Social Velocity (YouTube, converted from % to 0-100)
  if (trend.socialVelocity !== null && trend.socialVelocity !== undefined) {
    signals.push(velocityToScore(trend.socialVelocity));
  }

  // PowerWeb (future, already 0-100)
  // if (trend.powerWebScore !== null && trend.powerWebScore !== undefined) {
  //   signals.push(trend.powerWebScore);
  // }

  if (signals.length === 0) return null;

  const sum = signals.reduce((total, val) => total + val, 0);
  return Math.round(sum / signals.length);
}

/**
 * MARKET PULSE: for beverage subcategories.
 * PowerWeb-heavy with Search/Social confirmation. No Reddit Buzz.
 * PowerWeb (67%) + Search Velocity (17%) + Social Velocity (16%).
 *
 * Until PowerWeb is built, uses only Search and Social velocity
 * with equal weight between them (50/50).
 *
 * @param {Object} trend - The trend document from MongoDB
 * @returns {number|null} The Pulse score (0-100), or null if no data
 */
export function calculateMarketPulse(trend) {
  const hasPowerWeb = false; // trend.powerWebScore !== null && trend.powerWebScore !== undefined;
  const hasSearch = trend.searchVelocity !== null && trend.searchVelocity !== undefined;
  const hasSocial = trend.socialVelocity !== null && trend.socialVelocity !== undefined;

  // If PowerWeb is available, use the full weighted formula
  if (hasPowerWeb) {
    // const powerWeb = trend.powerWebScore;
    // const search = hasSearch ? velocityToScore(trend.searchVelocity) : 50;
    // const social = hasSocial ? velocityToScore(trend.socialVelocity) : 50;
    // return Math.round((powerWeb * 0.67) + (search * 0.17) + (social * 0.16));
  }

  // Without PowerWeb: use Search and Social velocity only
  const signals = [];

  if (hasSearch) {
    signals.push(velocityToScore(trend.searchVelocity));
  }

  if (hasSocial) {
    signals.push(velocityToScore(trend.socialVelocity));
  }

  // Fallback: if no velocity data yet, use normalized Buzz as a temporary
  // placeholder so the list isn't empty during the cold-start period.
  // This will be replaced as cron data fills in.
  if (signals.length === 0) {
    if (trend.score !== null && trend.score !== undefined && trend.score > 0) {
      // Use a dampened buzz score (max 50) so it never outranks
      // real velocity data once it arrives
      return Math.round(Math.min(50, (trend.score / 10)));
    }
    return null;
  }

  const sum = signals.reduce((total, val) => total + val, 0);
  return Math.round(sum / signals.length);
}

/**
 * Utility exports.
 */
export { velocityToScore, normalizeBuzz };