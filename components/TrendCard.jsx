// components/TrendCard.jsx
// ==========================================================================
// The core visual unit of the BeveragePulse dashboard.
//
// COLLAPSED SURFACE (this file):
//   rank, brand name, subcategory badge, directional signal, lead sentence.
//   When a brand has no analysis yet, the lead is replaced by a NEW state
//   rather than a faked sentence.
//
// A small "?" tooltip sits after the lead sentence and explains what the
// rank means. It is always visible because the lead is always visible.
//
// The card expands on click to reveal TrendDetail (the four signals, the
// full read, and the closing).
//
// The hero is no longer a number. The rank and the directional pill carry
// "where it stands," and the lead sentence carries "what is happening."
// ==========================================================================

'use client';

import { useState } from 'react';
import styles from './TrendCard.module.css';
import TrendDetail from './TrendDetail';
import Tooltip from './Tooltip';
import {
  CATEGORIES,
  BEVERAGE_TAXONOMY,
  BRAND_TAXONOMY,
  getDisplayName,
} from '../lib/taxonomy';

// Tooltip text shown after the first sentence, explaining the rank.
// Plain language, one reader-facing thought. Edit freely.
const RANK_TOOLTIP =
  'Where the brand ranks this week once all four signals are weighed together. Broad momentum across several signals outranks a big spike in just one.';

/**
 * Look up category metadata (label + color) for a given term.
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
 * Directional movement from last week's AI rank to this week's.
 *
 * Honest by design: with no previous rank stored, the brand is new to the
 * ranking, so we say NEW rather than invent a direction. The previousAiRank
 * field is wired up in the ranking service in a later step; until then every
 * ranked brand reads as NEW, which is correct for the first published week.
 */
function getDirection(aiRank, previousAiRank) {
  if (previousAiRank === null || previousAiRank === undefined) {
    return { text: 'NEW', arrow: '★', className: styles.changeNew };
  }

  const diff = previousAiRank - aiRank;

  if (diff > 0) {
    return { text: `+${diff}`, arrow: '▲', className: styles.changeUp };
  }
  if (diff < 0) {
    return { text: `${diff}`, arrow: '▼', className: styles.changeDown };
  }
  return { text: '—', arrow: '', className: styles.changeSame };
}

export default function TrendCard({ trend, type = 'beverage', maxScore = 0 }) {
  const [isOpen, setIsOpen] = useState(false);

  const { name, aiRank, aiHeadline, previousAiRank } = trend;

  const displayName = getDisplayName(name, type);
  const categoryMeta = getCategoryMeta(name, type);

  const hasAnalysis =
    typeof aiHeadline === 'string' && aiHeadline.trim() !== '';

  const direction = getDirection(aiRank, previousAiRank);

  const rankClass =
    typeof aiRank === 'number' && aiRank <= 3
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
        {/* Header: rank, name + category, directional signal */}
        <div className={styles.header}>
          <div className={rankClass}>
            {typeof aiRank === 'number' ? aiRank : '—'}
          </div>

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

          {hasAnalysis && (
            <span className={`${styles.change} ${direction.className}`}>
              {direction.arrow && (
                <span className={styles.arrow}>{direction.arrow}</span>
              )}
              {direction.text}
            </span>
          )}
        </div>

        {/* Lead sentence with the rank tooltip, or the NEW state when there is not enough data */}
        {hasAnalysis ? (
          <p className={styles.lead}>{aiHeadline} <Tooltip text={RANK_TOOLTIP} align="right" /></p>
        ) : (
          <div className={styles.newState}>
            <span className={styles.newStar}>★</span>
            <span className={styles.newLabel}>NEW</span>
            <span className={styles.newHint}>Signal building, not enough data yet</span>
          </div>
        )}
      </div>

      {/* Expandable detail panel */}
      <TrendDetail trend={trend} isOpen={isOpen} maxScore={maxScore} />
    </div>
  );
}