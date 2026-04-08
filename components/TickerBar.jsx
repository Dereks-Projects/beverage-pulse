// components/TickerBar.jsx
// Auto-rotating ticker strip that cycles through three views:
//   1. Top by Reddit Score
//   2. Top by Google Search Interest
//   3. Biggest Movers (rank changes from previous week)
//
// Rotates every 5 seconds. Pauses on mouse hover.
// View 3 (movers) only shows items with actual rank changes,
// hiding gracefully when all items are "new."
//
// Props:
//   beverageTrends - top beverage trends (already sorted by score)
//   brandTrends    - top brand trends (already sorted by score)

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getDisplayName } from '../lib/taxonomy';
import styles from './TickerBar.module.css';

const VIEWS = [
  { id: 'reddit', label: 'Top Reddit' },
  { id: 'google', label: 'Top Google' },
  { id: 'movers', label: 'Movers' },
];

const ROTATION_INTERVAL = 5000;

/**
 * Format change indicator for the ticker.
 */
function formatChange(change, previousRank, currentRank) {
  switch (change) {
    case 'up': {
      const diff = previousRank ? previousRank - currentRank : 0;
      return {
        text: diff > 0 ? `▲${diff}` : '▲',
        className: styles.changeUp,
      };
    }
    case 'down': {
      const diff = previousRank ? currentRank - previousRank : 0;
      return {
        text: diff > 0 ? `▼${diff}` : '▼',
        className: styles.changeDown,
      };
    }
    case 'same':
      return { text: '—', className: styles.changeSame };
    case 'new':
    default:
      return { text: '★', className: styles.changeNew };
  }
}

/**
 * Build the items for each view.
 */
function getViewItems(viewId, beverages, brands) {
  const allTrends = [...beverages, ...brands];

  switch (viewId) {
    case 'reddit': {
      // Top 10 by Reddit score
      return [...allTrends]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 10)
        .map((t) => ({
          key: t._id,
          name: getDisplayName(t.name, beverages.includes(t) ? 'beverage' : 'brand'),
          primary: Math.round(t.score || 0),
          primaryLabel: null,
          change: formatChange(t.change, t.previousRank, t.rank),
          type: 'reddit',
        }));
    }
    case 'google': {
      // Top 10 by Google interest, only items with data
      return [...allTrends]
        .filter((t) => t.googleInterest !== null && t.googleInterest !== undefined)
        .sort((a, b) => b.googleInterest - a.googleInterest)
        .slice(0, 10)
        .map((t) => ({
          key: t._id,
          name: getDisplayName(t.name, beverages.includes(t) ? 'beverage' : 'brand'),
          primary: t.googleInterest,
          primaryLabel: null,
          change: null,
          type: 'google',
        }));
    }
    case 'movers': {
      // Items with actual rank changes, sorted by magnitude
      const movers = allTrends
        .filter((t) => t.change === 'up' || t.change === 'down')
        .map((t) => ({
          ...t,
          magnitude: t.previousRank
            ? Math.abs(t.previousRank - t.rank)
            : 0,
          isBeverage: beverages.includes(t),
        }))
        .sort((a, b) => b.magnitude - a.magnitude)
        .slice(0, 10);

      if (movers.length === 0) return null;

      return movers.map((t) => ({
        key: t._id,
        name: getDisplayName(t.name, t.isBeverage ? 'beverage' : 'brand'),
        primary: Math.round(t.score || 0),
        primaryLabel: null,
        change: formatChange(t.change, t.previousRank, t.rank),
        type: 'mover',
      }));
    }
    default:
      return [];
  }
}

export default function TickerBar({ beverageTrends, brandTrends }) {
  const [activeViewIndex, setActiveViewIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef(null);

  // Determine which views have data
  const availableViews = VIEWS.filter((view) => {
    const items = getViewItems(view.id, beverageTrends, brandTrends);
    return items !== null && items.length > 0;
  });

  // Rotate through available views
  const rotateView = useCallback(() => {
    setActiveViewIndex((prev) => (prev + 1) % availableViews.length);
  }, [availableViews.length]);

  useEffect(() => {
    if (isPaused || availableViews.length <= 1) return;

    intervalRef.current = setInterval(rotateView, ROTATION_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [isPaused, rotateView, availableViews.length]);

  // Don't render if no data
  if (availableViews.length === 0) return null;

  const currentView = availableViews[activeViewIndex % availableViews.length];
  const items = getViewItems(currentView.id, beverageTrends, brandTrends) || [];

  return (
    <div
      className={styles.ticker}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={styles.tickerInner}>
        {/* View label and dots */}
        <div className={styles.viewLabel}>
          <span className={styles.viewLabelText}>{currentView.label}</span>
          {availableViews.length > 1 && (
            <div className={styles.viewDots}>
              {availableViews.map((view, i) => (
                <span
                  key={view.id}
                  className={`${styles.viewDot} ${
                    i === activeViewIndex % availableViews.length
                      ? styles.viewDotActive
                      : ''
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Scrolling items */}
        <div className={styles.trackWrapper}>
          <div className={styles.track} key={currentView.id}>
            {items.map((item, index) => (
              <div key={item.key} className={styles.item}>
                <span className={styles.itemRank}>{index + 1}</span>
                <span className={styles.itemName}>{item.name}</span>
                {currentView.id === 'google' ? (
                  <span className={styles.itemGoogle}>{item.primary}</span>
                ) : (
                  <span className={styles.itemScore}>{item.primary}</span>
                )}
                {item.change && (
                  <span className={`${styles.itemChange} ${item.change.className}`}>
                    {item.change.text}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}