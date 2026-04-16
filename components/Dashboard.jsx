// components/Dashboard.jsx
// ==========================================================================
// Trending Brands dashboard. Single list. Full width.
//
// Shows the top 20 brands ranked by Brand Signal: a composite score
// from Buzz (Reddit), Search (Google), Social (YouTube), and
// PowerWeb (5-layer editorial and retail intelligence).
//
// Trending Categories will be added as a toggle later.
// ==========================================================================

'use client';

import { useState, useMemo } from 'react';
import TrendCard from './TrendCard';
import FilterBar from './FilterBar';
import ViewToggle from './ViewToggle';
import SortToggle from './SortToggle';
import { calculateBrandSignal } from '../lib/pulseScore';
import {
  CATEGORIES,
  BRAND_TAXONOMY,
} from '../lib/taxonomy';
import styles from './Dashboard.module.css';

/**
 * Get the category id for a brand.
 */
function getCategoryId(name) {
  const entry = BRAND_TAXONOMY[name.toLowerCase()];
  return entry ? entry.category : null;
}

/**
 * Get the parent group ('alcoholic' or 'non-alcoholic') for a brand.
 */
function getParentGroup(name) {
  const categoryId = getCategoryId(name);
  if (!categoryId) return null;

  const category = CATEGORIES[categoryId];
  return category ? category.parent : null;
}

/**
 * Find the highest Reddit score in an array of trends.
 * Used for Buzz normalization in Brand Signal calculation.
 */
function getMaxScore(trends) {
  if (trends.length === 0) return 0;
  return Math.max(...trends.map((t) => t.score || 0));
}

/**
 * Add Brand Signal scores to brand trends.
 */
function addBrandSignalScores(trends, maxScore) {
  return trends.map((trend) => ({
    ...trend,
    pulseScore: calculateBrandSignal(trend, maxScore),
  }));
}

/**
 * Apply view and category filters.
 */
function filterTrends(trends, view, category) {
  let filtered = trends;

  if (view !== 'all') {
    filtered = filtered.filter(
      (trend) => getParentGroup(trend.name) === view
    );
  }

  if (category !== 'all') {
    filtered = filtered.filter(
      (trend) => getCategoryId(trend.name) === category
    );
  }

  return filtered;
}

/**
 * Sort by the selected key.
 */
function sortTrends(trends, sortKey) {
  const sorted = [...trends];

  switch (sortKey) {
    case 'score':
      return sorted.sort((a, b) => (b.pulseScore || 0) - (a.pulseScore || 0));
    case 'mentions':
      return sorted.sort((a, b) => b.mentions - a.mentions);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return sorted;
  }
}

/**
 * Recalculate display ranks.
 */
function applyDisplayRanks(trends) {
  return trends.map((trend, index) => ({
    ...trend,
    displayRank: index + 1,
  }));
}

export default function Dashboard({ brandTrends }) {
  const [activeView, setActiveView] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeSort, setActiveSort] = useState('score');

  function handleViewChange(newView) {
    setActiveView(newView);
    setActiveFilter('all');
  }

  const visibleCategories = useMemo(() => {
    if (activeView === 'all') return null;

    return Object.values(CATEGORIES)
      .filter((cat) => cat.parent === activeView)
      .map((cat) => cat.id);
  }, [activeView]);

  const maxBrandScore = useMemo(
    () => getMaxScore(brandTrends),
    [brandTrends]
  );

  const brandsWithSignal = useMemo(
    () => addBrandSignalScores(brandTrends, maxBrandScore),
    [brandTrends, maxBrandScore]
  );

  const filteredBrands = applyDisplayRanks(
    sortTrends(
      filterTrends(brandsWithSignal, activeView, activeFilter),
      activeSort
    )
  );

  return (
    <div className={styles.dashboard}>
      {/* Top controls */}
      <div className={styles.controlsRow}>
        <ViewToggle
          activeView={activeView}
          onViewChange={handleViewChange}
        />
        <SortToggle
          activeSort={activeSort}
          onSortChange={setActiveSort}
        />
      </div>

      {/* Category filter pills */}
      <div className={styles.filterSection}>
        <p className={styles.filterLabel}>Filter by category</p>
        <FilterBar
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          visibleCategories={visibleCategories}
        />
      </div>

      {/* Single column: Trending Brands */}
      <section className={styles.singleColumn}>
        <div className={styles.columnHeader}>
          <h2 className={styles.columnTitle}>Trending Brands</h2>
          <span className={styles.columnCount}>
            {filteredBrands.length} result{filteredBrands.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={styles.cardList} role="list">
          {filteredBrands.map((trend) => (
            <TrendCard
              key={trend._id}
              trend={trend}
              type="brand"
              maxScore={maxBrandScore}
            />
          ))}
          {filteredBrands.length === 0 && (
            <p className={styles.empty}>
              No brands in this category.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}