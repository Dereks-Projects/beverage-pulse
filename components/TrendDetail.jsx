// app/components/TrendDetail.jsx
// ==========================================================================
// Expandable detail panel for a TrendCard.
//
// Shows, in order:
//   1. The four signal tiles (Online Buzz, Video, News, WikiTrend) as the
//      evidence. Each tile carries a plain description line and the time
//      window on its own second line, so all four read in unison.
//   2. The rank line, with honest movement, and a tooltip explaining it.
//   3. The full three-sentence analysis (aiAnalysis)
//   4. The bolded closing (aiClosing), with a tooltip explaining how the
//      confidence is judged.
//   5. The About the Data link (points to the dedicated method page).
// ==========================================================================

import Link from 'next/link';
import styles from './TrendDetail.module.css';
import Tooltip from './Tooltip';

// Tooltip after the rank/movement line. Plain reader language, edit freely.
const TREND_TOOLTIP =
  'How the brand has moved since last week. New to the ranking means it just entered the board, so there is no prior spot to compare yet; once it has a week of history this shows how far it rose or fell.';

// Tooltip after the closing sentence. Explains the corroboration idea.
const CORROBORATION_TOOLTIP =
  'How confident this read is, based on how many of the four signals point the same way. Several agreeing is a strong, corroborated call; one moving alone is only a flag worth watching.';

/**
 * Format a velocity percentage for display.
 */
function formatVelocity(value) {
  if (value === null || value === undefined) return null;
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value}%`;
}

/**
 * Color class for a velocity value.
 */
function getVelocityClass(value) {
  if (value === null || value === undefined) return '';
  if (value > 5) return styles.valueUp;
  if (value < -5) return styles.valueDown;
  return styles.valueFlat;
}

export default function TrendDetail({ trend, isOpen }) {
  const {
    score,
    newsVelocity,
    socialVelocity,
    wikipediaVelocity,
    aiRank,
    previousAiRank,
    aiAnalysis,
    aiClosing,
  } = trend;

  const hasNews = newsVelocity !== null && newsVelocity !== undefined;
  const hasSocial = socialVelocity !== null && socialVelocity !== undefined;
  const hasWiki = wikipediaVelocity !== null && wikipediaVelocity !== undefined;

  const hasAnalysis = typeof aiAnalysis === 'string' && aiAnalysis.trim() !== '';
  const hasClosing = typeof aiClosing === 'string' && aiClosing.trim() !== '';

  // Honest rank movement. With no previous rank stored yet, the brand is new
  // to the ranking and we say so rather than inventing a direction.
  let rankMovement = 'New to the ranking';
  if (typeof previousAiRank === 'number') {
    if (previousAiRank > aiRank) rankMovement = `Up from #${previousAiRank}`;
    else if (previousAiRank < aiRank) rankMovement = `Down from #${previousAiRank}`;
    else rankMovement = 'Unchanged';
  }

  return (
    <div
      className={`${styles.detail} ${isOpen ? styles.detailOpen : ''}`}
      aria-hidden={!isOpen}
    >
      {/* Four signal tiles: the evidence behind the rank */}
      <div className={styles.signalGrid}>
        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>Online Buzz</span>
          <span className={styles.signalValue}>
            {Math.round(score || 0).toLocaleString()}
          </span>
          <span className={styles.signalHint}>
            How much people are talking about it online
            <span className={styles.signalWindow}>This week</span>
          </span>
        </div>

        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>Social Media</span>
          <span className={`${styles.signalValue} ${hasSocial ? getVelocityClass(socialVelocity) : styles.valuePending}`}>
            {hasSocial ? formatVelocity(socialVelocity) : '—'}
          </span>
          <span className={styles.signalHint}>
            {hasSocial ? 'How much people are watching videos about it' : 'Collecting data'}
            {hasSocial && <span className={styles.signalWindow}>Last 90 days</span>}
          </span>
        </div>

        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>News</span>
          <span className={`${styles.signalValue} ${hasNews ? getVelocityClass(newsVelocity) : styles.valuePending}`}>
            {hasNews ? formatVelocity(newsVelocity) : '—'}
          </span>
          <span className={styles.signalHint}>
            {hasNews ? 'How much the press is writing about it' : 'Collecting data'}
            {hasNews && <span className={styles.signalWindow}>Last 90 days</span>}
          </span>
        </div>

        <div className={styles.signalBlock}>
          <span className={styles.signalTitle}>WikiTrend</span>
          <span className={`${styles.signalValue} ${hasWiki ? getVelocityClass(wikipediaVelocity) : styles.valuePending}`}>
            {hasWiki ? formatVelocity(wikipediaVelocity) : '—'}
          </span>
          <span className={styles.signalHint}>
            {hasWiki ? 'How often people are looking it up' : 'Collecting data'}
            {hasWiki && <span className={styles.signalWindow}>Last 90 days</span>}
          </span>
        </div>
      </div>

      {/* Rank line, with a tooltip explaining the movement */}
      <div className={styles.rankRow}>
        <span className={styles.rankInfo}>
          <span className={styles.rankValue}>#{aiRank}</span> {rankMovement}
        </span>
        <Tooltip text={TREND_TOOLTIP} align="left" />
      </div>

      {/* The full three-sentence analysis */}
      {hasAnalysis && (
        <div className={styles.analysisBlock}>
          <p className={styles.analysisBody}>{aiAnalysis}</p>
        </div>
      )}

      {/* The bolded closing forward read, with a tooltip on corroboration */}
      {hasClosing && (
        <p className={styles.analysisClosing}>{aiClosing} <Tooltip text={CORROBORATION_TOOLTIP} align="left" /></p>
      )}

      {/* About the Data link (dedicated method page) */}
      <div className={styles.aboutLink}>
        <Link href="/about-the-data" className={styles.aboutAnchor}>About the Data</Link>
      </div>
    </div>
  );
}