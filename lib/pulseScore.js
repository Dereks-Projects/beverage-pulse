// lib/pulseScore.js
// ==========================================================================
// BeveragePulse scoring engine.
//
// BRAND SIGNAL (Trending Brands list):
//   Equal weight across all available signals.
//   Buzz (25%) + Search (25%) + Social (25%) + PowerWeb (25%).
//   Adapts to however many signals have data.
//   Answers: "Which brands have the most momentum right now?"
//
// Velocity-to-score conversion:
//   -100% or worse = 0
//   0% (flat)      = 50
//   +100% or more  = 100
//
// HEAT INDEX (Trending Categories list) will be added later
// with a separate formula: PowerWeb-heavy, no Reddit Buzz.
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
 * Check if a value exists and is a number.
 */
function hasValue(val) {
  return val !== null && val !== undefined;
}

/**
 * BRAND SIGNAL: for the Trending Brands list.
 * Equal weight across all available signals.
 * Buzz (25%) + Search (25%) + Social (25%) + PowerWeb (25%).
 * Adapts to however many signals are available.
 *
 * @param {Object} trend - The trend document from MongoDB
 * @param {number} maxScore - The highest Reddit score in the current dataset
 * @returns {number|null} The Brand Signal score (0-100), or null if no data
 */
export function calculateBrandSignal(trend, maxScore) {
  const signals = [];

  // Buzz (Reddit engagement, normalized to 0-100)
  if (hasValue(trend.score) && trend.score > 0) {
    signals.push(normalizeBuzz(trend.score, maxScore));
  }

  // Search Velocity (Google, converted from % to 0-100)
  if (hasValue(trend.searchVelocity)) {
    signals.push(velocityToScore(trend.searchVelocity));
  }

  // Social Velocity (YouTube, converted from % to 0-100)
  if (hasValue(trend.socialVelocity)) {
    signals.push(velocityToScore(trend.socialVelocity));
  }

  // PowerWeb (5-layer intelligence, already 0-100)
  if (hasValue(trend.powerWebScore)) {
    signals.push(trend.powerWebScore);
  }

  if (signals.length === 0) return null;

  const sum = signals.reduce((total, val) => total + val, 0);
  return Math.round(sum / signals.length);
}

/**
 * Utility exports.
 */
export { velocityToScore, normalizeBuzz };