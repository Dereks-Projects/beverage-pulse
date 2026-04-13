// lib/pulseScore.js
// BeveragePulse Sentiment Score ("Pulse") calculation.
//
// Combines available signals into a single 0-100 score.
// Each signal is normalized to a 0-100 scale before averaging.
//
// Signals:
//   Buzz (Reddit)      - raw engagement score, normalized against maxScore
//   Search (Google)     - velocity %, converted to 0-100 scale
//   Social (YouTube)    - velocity %, converted to 0-100 scale
//   PowerWeb (future)   - already 0-100 when built
//
// Velocity-to-score conversion:
//   -100% or worse = 0
//   0% (flat)      = 50
//   +100% or more  = 100
//   Linear scale between. A term accelerating +50% scores 75.
//   A term decelerating -50% scores 25.
//
// The score only averages signals that have data.
// With 3 of 4 signals: average of 3. With 2: average of 2.
// This ensures the score is always as informed as possible
// without being penalized for missing PowerWeb data.

/**
 * Convert a velocity percentage (-100 to +100) to a 0-100 score.
 * 0% = 50 (flat). Clamped to 0-100 range.
 */
function velocityToScore(velocityPercent) {
  // Map: -100 -> 0, 0 -> 50, +100 -> 100
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
 * Calculate the Pulse score for a single trend record.
 *
 * @param {Object} trend - The trend document from MongoDB
 * @param {number} maxScore - The highest Reddit score in the current dataset
 * @returns {number|null} The Pulse score (0-100), or null if no data at all
 */
export function calculatePulse(trend, maxScore) {
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

  // Need at least one signal to produce a score
  if (signals.length === 0) return null;

  // Average all available signals
  const sum = signals.reduce((total, val) => total + val, 0);
  return Math.round(sum / signals.length);
}

/**
 * Utility exports for use in other components if needed.
 */
export { velocityToScore, normalizeBuzz };