// lib/pulseScore.js
// ==========================================================================
// BeveragePulse scoring engine.
//
// Two distinct formulas for two distinct intelligence products:
//
// PRODUCT PULSE (brands):
//   Equal weight across all available signals.
//   Buzz (25%) + Search Velocity (25%) + Social Velocity (25%) + PowerWeb (25%).
//   Answers: "Which specific products should I act on right now?"
//
// MARKET PULSE (beverage subcategories):
//   PowerWeb-heavy with Search/Social confirmation. No Reddit Buzz.
//   PowerWeb (67%) + Search Velocity (17%) + Social Velocity (16%).
//   Answers: "Which categories are the market moving toward?"
//
//   Reddit Buzz is excluded from Market Pulse because consumers
//   search subcategory terms on Google and YouTube, but on Reddit
//   they use brand names. Buzz flows through Product Pulse.
//
// Both formulas adapt to available data. If only 2 of 4 signals
// exist, the score averages those 2. As data fills in, scores
// sharpen automatically. No manual intervention needed.
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
 * Check if a value exists and is a number.
 */
function hasValue(val) {
  return val !== null && val !== undefined;
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

  // PowerWeb (retailer intelligence, already 0-100)
  if (hasValue(trend.powerWebScore)) {
    signals.push(trend.powerWebScore);
  }

  if (signals.length === 0) return null;

  const sum = signals.reduce((total, val) => total + val, 0);
  return Math.round(sum / signals.length);
}

/**
 * MARKET PULSE: for beverage subcategories.
 * PowerWeb-heavy with Search/Social confirmation. No Reddit Buzz.
 *
 * When all three signals are available:
 *   PowerWeb (67%) + Search Velocity (17%) + Social Velocity (16%)
 *
 * When PowerWeb + one velocity signal:
 *   PowerWeb (75%) + available velocity (25%)
 *
 * When PowerWeb only:
 *   PowerWeb (100%)
 *
 * When velocity only (no PowerWeb yet):
 *   Equal weight across available velocity signals
 *
 * Fallback (no velocity, no PowerWeb):
 *   Dampened Buzz score capped at 50 as placeholder
 *
 * @param {Object} trend - The trend document from MongoDB
 * @returns {number|null} The Pulse score (0-100), or null if no data
 */
export function calculateMarketPulse(trend) {
  const hasPowerWeb = hasValue(trend.powerWebScore);
  const hasSearch = hasValue(trend.searchVelocity);
  const hasSocial = hasValue(trend.socialVelocity);

  const powerWeb = hasPowerWeb ? trend.powerWebScore : null;
  const search = hasSearch ? velocityToScore(trend.searchVelocity) : null;
  const social = hasSocial ? velocityToScore(trend.socialVelocity) : null;

  // Full formula: PowerWeb + Search + Social
  if (hasPowerWeb && hasSearch && hasSocial) {
    return Math.round(
      (powerWeb * 0.67) + (search * 0.17) + (social * 0.16)
    );
  }

  // PowerWeb + one velocity signal
  if (hasPowerWeb && (hasSearch || hasSocial)) {
    const velocity = hasSearch ? search : social;
    return Math.round((powerWeb * 0.75) + (velocity * 0.25));
  }

  // PowerWeb only
  if (hasPowerWeb) {
    return powerWeb;
  }

  // Velocity signals only (PowerWeb not yet built/populated)
  const velocitySignals = [];
  if (hasSearch) velocitySignals.push(search);
  if (hasSocial) velocitySignals.push(social);

  if (velocitySignals.length > 0) {
    const sum = velocitySignals.reduce((total, val) => total + val, 0);
    return Math.round(sum / velocitySignals.length);
  }

  // Fallback: dampened Buzz as temporary placeholder
  if (hasValue(trend.score) && trend.score > 0) {
    return Math.round(Math.min(50, (trend.score / 10)));
  }

  return null;
}

/**
 * Utility exports.
 */
export { velocityToScore, normalizeBuzz };