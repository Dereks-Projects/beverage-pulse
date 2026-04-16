// components/TrendDetail.jsx
// Expandable detail panel for a TrendCard.
// Layout:
//   - Pulse score centered as hero number
//   - Four signal quadrants: Buzz, Search, Social, PowerWeb
//   - Each with one-line human-language explainer
//   - Rank change
//   - AI analysis placeholder
//   - Subreddit breakdown bars
//   - Link to About page

import Link from 'next/link';
import styles from './TrendDetail.module.css';

/**
 * Format a velocity percentage for display.
 */
function formatVelocity(value) {
  if (value === null || value === undefined) return null;
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}%`;
}

/**
 * Get the CSS class for a velocity value.
 */
function getVelocityClass(value) {
  if (value === null || value === undefined) return '';
  if (value > 5) return styles.valueUp;
  if (value < -5) return styles.valueDown;
  return styles.valueFlat;
}

/**
 * Get the CSS class for a PowerWeb score.
 */
function getPowerWebClass(value) {
  if (value === null || value === undefined) return '';
  if (value >= 60) return styles.valueUp;
  if (value <= 25) return styles.valueDown;
  return styles.valueFlat;
}

export default function TrendDetail({ trend, isOpen, maxScore }) {
  const {
    score,
    mentions,
    rank,
    change,
    previousRank,
    subredditBreakdown,
    googleInterest,
    searchVelocity,
    youtubeScore,
    socialVelocity,
    powerWebScore,
    pulseScore,
  } = trend;

  const hasSearchVelocity = searchVelocity !== null && searchVelocity !== undefined;
  const hasSocialVelocity = socialVelocity !== null && socialVelocity !== undefined;
  const hasPowerWeb = powerWebScore !== null && powerWebScore !== undefined;
  const hasPulse = pulseScore !== null && pulseScore !== undefined;

  // Subreddit breakdown
  const breakdownEntries = Object.entries(subredditBreakdown || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  const maxCount = breakdownEntries.length > 0 ? breakdownEntries[0][1] : 0;

  // Rank change
  let rankChangeText = 'New entry';
  if (change === 'up' && previousRank) rankChangeText = `Up from #${previousRank}`;
  else if (change === 'down' && previousRank) rankChangeText = `Down from #${previousRank}`;
  else if (change === 'same') rankChangeText = 'Unchanged';

  return (
    <div
      className={`${styles.detail} ${isOpen ? styles.detailOpen : ''}`}
      aria-hidden={!isOpen}
    >
      {/* Pulse hero score */}
      <div className={styles.pulseHero}>
        <span className={styles.pulseValue}>
          {hasPulse ? pulseScore : '—'}
        </span>
        <span className={styles.pulseLabel}>Pulse Score</span>
      </div>

      {/* Four signal quadrants */}
      <div className={styles.signalGrid}>
        {/* Buzz (Reddit) */}
        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>Buzz</span>
          <span className={styles.signalValue}>
            {Math.round(score || 0).toLocaleString()}
          </span>
          <span className={styles.signalHint}>Industry conversation this week</span>
        </div>

        {/* Social (YouTube) */}
        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>Social</span>
          <span className={`${styles.signalValue} ${hasSocialVelocity ? getVelocityClass(socialVelocity) : styles.valuePending}`}>
            {hasSocialVelocity ? formatVelocity(socialVelocity) : '—'}
          </span>
          <span className={styles.signalHint}>
            {hasSocialVelocity ? 'Creator attention momentum, 90 days' : 'Collecting data'}
          </span>
        </div>

        {/* Search (Google) */}
        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>Search</span>
          <span className={`${styles.signalValue} ${hasSearchVelocity ? getVelocityClass(searchVelocity) : styles.valuePending}`}>
            {hasSearchVelocity ? formatVelocity(searchVelocity) : '—'}
          </span>
          <span className={styles.signalHint}>
            {hasSearchVelocity ? 'Consumer search momentum, 90 days' : 'Collecting data'}
          </span>
        </div>

        {/* PowerWeb */}
        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>PowerWeb</span>
          <span className={`${styles.signalValue} ${hasPowerWeb ? getPowerWebClass(powerWebScore) : styles.valuePending}`}>
            {hasPowerWeb ? powerWebScore : '—'}
          </span>
          <span className={styles.signalHint}>
            {hasPowerWeb ? 'Retailer and editorial positioning' : 'Collecting data'}
          </span>
        </div>
      </div>

      {/* Rank row */}
      <div className={styles.rankRow}>
        <span className={styles.rankInfo}>
          <span className={styles.rankValue}>#{rank}</span> {rankChangeText}
        </span>
      </div>

      {/* AI analysis placeholder */}
      <div className={styles.analysisBlock}>
        <p className={styles.analysisText}>
          AI-powered analysis will appear here. A 3-sentence synopsis of this
          item's performance, trajectory, and what it means for your business.
        </p>
      </div>

      {/* Subreddit breakdown */}
      {breakdownEntries.length > 0 && (
        <div className={styles.breakdownBlock}>
          <p className={styles.breakdownTitle}>Where the buzz is</p>
          <div className={styles.breakdownList}>
            {breakdownEntries.map(([subreddit, count]) => (
              <div key={subreddit} className={styles.breakdownItem}>
                <span className={styles.subredditName}>r/{subreddit}</span>
                <div className={styles.barWrapper}>
                  <div
                    className={styles.bar}
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className={styles.barCount}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* About link */}
      <div className={styles.aboutLink}>
        <Link href="/about" className={styles.aboutAnchor}>About the Data</Link>
      </div>
    </div>
  );
}