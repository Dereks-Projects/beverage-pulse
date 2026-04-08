// components/TrendCard.jsx
// The core visual unit of the BeveragePulse dashboard.
// Shows rank, name, category, divergence signal, Reddit score,
// Google interest, and trend direction.
//
// Reddit and Google scores are displayed side by side as separate
// labeled numbers. No composite blending. Two honest numbers.
//
// Divergence label appears only when the two sources meaningfully
// disagree, highlighting opportunities or watch items.
//
// Props:
//   trend    - MongoDB document with displayRank added by Dashboard
//   type     - 'beverage' or 'brand' (determines taxonomy lookup)
//   maxScore - highest Reddit score in the current view (for divergence calc)

'use client';

import { useState } from 'react';
import styles from './TrendCard.module.css';
import TrendDetail from './TrendDetail';
import {
  CATEGORIES,
  BEVERAGE_TAXONOMY,
  BRAND_TAXONOMY,
  getDisplayName,
} from '../lib/taxonomy';

/**
 * Look up category metadata for a given term.
 */
function getCategoryMeta(name, type) {
  const taxonomy = type === 'brand' ? BRAND_TAXONOMY : BEVERAGE_TAXONOMY;
  const entry = taxonomy[name.toLowerCase()];

  if (!entry) {
    return { label: 'Other', color: '#5A6478' };
  }

  const category = CATEGORIES[entry.category];

  if (!category) {
    return { label: 'Other', color: '#5A6478' };
  }

  return { label: category.label, color: category.color };
}

/**
 * Format the change indicator.
 */
function formatChange(change, previousRank, currentRank) {
  switch (change) {
    case 'up': {
      const diff = previousRank ? previousRank - currentRank : 0;
      return {
        text: diff > 0 ? `+${diff}` : 'UP',
        arrow: '▲',
        className: styles.changeUp,
      };
    }
    case 'down': {
      const diff = previousRank ? currentRank - previousRank : 0;
      return {
        text: diff > 0 ? `-${diff}` : 'DN',
        arrow: '▼',
        className: styles.changeDown,
      };
    }
    case 'same':
      return {
        text: '—',
        arrow: '',
        className: styles.changeSame,
      };
    case 'new':
    default:
      return {
        text: 'NEW',
        arrow: '★',
        className: styles.changeNew,
      };
  }
}

/**
 * Calculate divergence between Reddit and Google signals.
 * Returns null if not enough data or signals roughly agree.
 */
function getDivergence(score, googleInterest, maxScore) {
  if (googleInterest === null || googleInterest === undefined) return null;
  if (!maxScore || maxScore === 0) return null;

  const redditNormalized = Math.round((score / maxScore) * 100);
  const gap = googleInterest - redditNormalized;

  if (Math.abs(gap) < 15) return null;

  if (gap > 0) {
    return {
      label: 'Search > Buzz',
      className: styles.divergencePositive,
    };
  }

  return {
    label: 'Buzz > Search',
    className: styles.divergenceWatch,
  };
}

export default function TrendCard({ trend, type = 'beverage', maxScore = 0 }) {
  const [isOpen, setIsOpen] = useState(false);

  const { name, rank, score, mentions, change, previousRank, displayRank, googleInterest } = trend;

  const displayedRank = displayRank || rank;

  const displayName = getDisplayName(name, type);
  const categoryMeta = getCategoryMeta(name, type);
  const changeInfo = formatChange(change, previousRank, rank);

  const displayScore = Math.round(score || 0).toLocaleString();
  const hasGoogleData = googleInterest !== null && googleInterest !== undefined;

  const divergence = getDivergence(score || 0, googleInterest, maxScore);

  const rankClass = displayedRank <= 3
    ? `${styles.rank} ${styles.rankTop}`
    : styles.rank;

  const cardClass = isOpen
    ? `${styles.card} ${styles.cardOpen}`
    : styles.card;

  return (
    <div>
      <div
        className={cardClass}
        role="listitem"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        {/* Rank */}
        <div className={rankClass}>
          {displayedRank}
        </div>

        {/* Name, category, and divergence signal */}
        <div className={styles.info}>
          <span className={styles.name}>{displayName}</span>
          <div className={styles.badges}>
            <span
              className={styles.categoryBadge}
              style={{
                '--badge-bg': `${categoryMeta.color}20`,
                '--badge-color': categoryMeta.color,
              }}
            >
              {categoryMeta.label}
            </span>
            {divergence && (
              <span className={`${styles.divergenceLabel} ${divergence.className}`}>
                {divergence.label}
              </span>
            )}
          </div>
        </div>

        {/* Scores: Reddit and Google stacked, plus change */}
        <div className={styles.metrics}>
          <div className={styles.redditScore}>
            <span className={styles.scoreLabel}>Reddit</span>
            <span className={styles.scoreValue}>{displayScore}</span>
          </div>
          {hasGoogleData && (
            <div className={styles.googleScore}>
              <span className={styles.googleLabel}>Google</span>
              <span className={styles.googleValue}>{googleInterest}</span>
            </div>
          )}
          <span className={`${styles.change} ${changeInfo.className}`}>
            {changeInfo.arrow && (
              <span className={styles.arrow}>{changeInfo.arrow}</span>
            )}
            {changeInfo.text}
          </span>
        </div>
      </div>

      {/* Expandable detail panel */}
      <TrendDetail trend={trend} isOpen={isOpen} maxScore={maxScore} />
    </div>
  );
}