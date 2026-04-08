// components/TrendDetail.jsx
// Compact expandable detail panel for a TrendCard.
// Three-column stat grid, divergence signal, subreddit bars.
// Every number has a short one-line hint, not a paragraph.

import styles from './TrendDetail.module.css';

/**
 * Calculate divergence between Reddit and Google.
 */
function getDivergence(score, googleInterest, maxScore) {
  if (googleInterest === null || googleInterest === undefined) return null;
  if (!maxScore || maxScore === 0) return null;

  const redditNormalized = Math.round((score / maxScore) * 100);
  const gap = googleInterest - redditNormalized;

  if (Math.abs(gap) < 15) return null;

  if (gap > 0) {
    return {
      label: 'Consumer search outpacing buzz',
      hint: 'People are searching for this more than the industry is discussing it.',
      className: 'divergencePositive',
      icon: '↗',
    };
  }

  return {
    label: 'Buzz outpacing consumer search',
    hint: 'Industry is talking about this more than consumers are searching for it.',
    className: 'divergenceWatch',
    icon: '↘',
  };
}

/**
 * Calculate Google trend direction from history.
 */
function getGoogleDirection(googleHistory, currentValue) {
  if (!googleHistory || googleHistory.length < 2 || currentValue === null) {
    return null;
  }

  const oldest = googleHistory[0]?.value;
  if (oldest === null || oldest === undefined) return null;

  const change = currentValue - oldest;
  const weeks = googleHistory.length;

  if (Math.abs(change) < 3) {
    return { direction: 'flat', change: 0, weeks, label: `Flat over ${weeks}wk` };
  }

  if (change > 0) {
    return { direction: 'up', change, weeks, label: `▲ ${change}pts over ${weeks}wk` };
  }

  return { direction: 'down', change: Math.abs(change), weeks, label: `▼ ${Math.abs(change)}pts over ${weeks}wk` };
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
    googleHistory,
  } = trend;

  const hasGoogleData = googleInterest !== null && googleInterest !== undefined;

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

  // Divergence
  const divergence = getDivergence(score, googleInterest, maxScore);

  // Google direction
  const googleDirection = getGoogleDirection(googleHistory || [], googleInterest);

  return (
    <div
      className={`${styles.detail} ${isOpen ? styles.detailOpen : ''}`}
      aria-hidden={!isOpen}
    >
      {/* Stats grid */}
      <div className={styles.statsGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Reddit</span>
          <span className={styles.statValue}>
            {Math.round(score || 0).toLocaleString()}
          </span>
          <span className={styles.statHint}>Buzz weighted by upvotes</span>
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Google</span>
          <span className={`${styles.statValue} ${hasGoogleData ? styles.statValueGoogle : styles.statValueMuted}`}>
            {hasGoogleData ? googleInterest : '—'}
          </span>
          <span className={styles.statHint}>
            {hasGoogleData ? 'Search interest, 0-100' : 'Not yet collected'}
          </span>
          {googleDirection && (
            <span
              className={`${styles.googleDirection} ${
                googleDirection.direction === 'up'
                  ? styles.directionUp
                  : googleDirection.direction === 'down'
                  ? styles.directionDown
                  : styles.directionFlat
              }`}
            >
              {googleDirection.label}
            </span>
          )}
        </div>

        <div className={styles.stat}>
          <span className={styles.statLabel}>Mentions</span>
          <span className={styles.statValue}>
            {mentions.toLocaleString()}
          </span>
          <span className={styles.statHint}>Raw count, unweighted</span>
        </div>
      </div>

      {/* Rank row */}
      <div className={styles.rankRow}>
        <span className={styles.rankInfo}>
          <span className={styles.rankValue}>#{rank}</span> {rankChangeText}
        </span>
      </div>

      {/* Divergence signal */}
      {divergence && (
        <div
          className={`${styles.divergenceBlock} ${
            divergence.className === 'divergencePositive'
              ? styles.divergencePositive
              : styles.divergenceWatch
          }`}
        >
          <span className={styles.divergenceIcon}>{divergence.icon}</span>
          <div className={styles.divergenceText}>
            <span className={styles.divergenceLabel}>{divergence.label}</span>
            {' '}
            <span className={styles.divergenceHint}>{divergence.hint}</span>
          </div>
        </div>
      )}

      {/* Subreddit breakdown */}
      {breakdownEntries.length > 0 ? (
        <div className={styles.breakdownBlock}>
          <p className={styles.breakdownTitle}>Top subreddits</p>
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
      ) : (
        <p className={styles.noData}>No subreddit data available.</p>
      )}
    </div>
  );
}