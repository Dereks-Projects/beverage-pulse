// components/TrendCard.jsx
// The core visual unit of the BeveragePulse dashboard.
// Card surface shows: rank, name, category, Pulse score, trend arrow.
// The Pulse score is the hero number. Everything else is under the hood.
//
// Props:
//   trend    - MongoDB document with displayRank and pulseScore added by Dashboard
//   type     - 'beverage' or 'brand' (determines taxonomy lookup)
//   maxScore - highest Reddit score in the current view (passed to TrendDetail)

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

export default function TrendCard({ trend, type = 'beverage', maxScore = 0 }) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    name,
    rank,
    change,
    previousRank,
    displayRank,
    pulseScore,
  } = trend;

  const displayedRank = displayRank || rank;

  const displayName = getDisplayName(name, type);
  const categoryMeta = getCategoryMeta(name, type);
  const changeInfo = formatChange(change, previousRank, rank);

  const hasPulse = pulseScore !== null && pulseScore !== undefined;

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

        {/* Name + category badge */}
        <div className={styles.info}>
          <span className={styles.name}>{displayName}</span>
          <span
            className={styles.categoryBadge}
            style={{
              '--badge-bg': `${categoryMeta.color}20`,
              '--badge-color': categoryMeta.color,
            }}
          >
            {categoryMeta.label}
          </span>
        </div>

        {/* Pulse score + trend arrow */}
        <div className={styles.pulseBlock}>
          <div className={styles.pulseRow}>
            <span className={styles.pulseLabel}>Pulse</span>
            <span className={styles.pulseValue}>
              {hasPulse ? pulseScore : '—'}
            </span>
          </div>
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