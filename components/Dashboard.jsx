// components/Dashboard.jsx
// ==========================================================================
// Main dashboard component. Two intelligence products side by side:
//
// LEFT COLUMN: Product Pulse (brands)
//   "Which specific products should I act on right now?"
//   Scored by: Buzz + Search + Social + PowerWeb (equal weight)
//
// RIGHT COLUMN: Market Pulse (beverage subcategories)
//   "Which categories are the market moving toward?"
//   Scored by: PowerWeb (67%) + Search (17%) + Social (16%)
//   Until PowerWeb is built: Search + Social velocity only
//
// Default view: All (full landscape). User narrows from there.
// ==========================================================================

'use client';

import { useState, useMemo } from 'react';
import TrendCard from './TrendCard';
import FilterBar from './FilterBar';
import ViewToggle from './ViewToggle';
import SortToggle from './SortToggle';
import { calculateProductPulse, calculateMarketPulse } from '../lib/pulseScore';
import {
  CATEGORIES,
  BEVERAGE_TAXONOMY,
  BRAND_TAXONOMY,
} from '../lib/taxonomy';
import styles from './Dashboard.module.css';

/**
 * Get the category id for a trend item.
 */
function getCategoryId(name, type) {
  const taxonomy = type === 'brand' ? BRAND_TAXONOMY : BEVERAGE_TAXONOMY;
  const entry = taxonomy[name.toLowerCase()];
  return entry ? entry.category : null;
}

/**
 * Get the parent group ('alcoholic' or 'non-alcoholic') for a trend item.
 */
function getParentGroup(name, type) {
  const categoryId = getCategoryId(name, type);
  if (!categoryId) return null;

  const category = CATEGORIES[categoryId];
  return category ? category.parent : null;
}

/**
 * Find the highest Reddit score in an array of trends.
 * Used for Buzz normalization in Product Pulse.
 */
function getMaxScore(trends) {
  if (trends.length === 0) return 0;
  return Math.max(...trends.map((t) => t.score || 0));
}

/**
 * Add Product Pulse scores to brand trends.
 */
function addProductPulseScores(trends, maxScore) {
  return trends.map((trend) => ({
    ...trend,
    pulseScore: calculateProductPulse(trend, maxScore),
  }));
}

/**
 * Add Market Pulse scores to beverage trends.
 */
function addMarketPulseScores(trends) {
  return trends.map((trend) => ({
    ...trend,
    pulseScore: calculateMarketPulse(trend),
  }));
}

/**
 * Apply view and category filters to a trends array.
 */
function filterTrends(trends, view, category, type) {
  let filtered = trends;

  if (view !== 'all') {
    filtered = filtered.filter(
      (trend) => getParentGroup(trend.name, type) === view
    );
  }

  if (category !== 'all') {
    filtered = filtered.filter(
      (trend) => getCategoryId(trend.name, type) === category
    );
  }

  return filtered;
}

/**
 * Sort a trends array by the selected key.
 * Default sort uses Pulse score.
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
 * Recalculate ranks based on position in the filtered/sorted array.
 */
function applyDisplayRanks(trends) {
  return trends.map((trend, index) => ({
    ...trend,
    displayRank: index + 1,
  }));
}

export default function Dashboard({ beverageTrends, brandTrends }) {
  const [activeView, setActiveView] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeSort, setActiveSort] = useState('score');

  // Reset category filter when view changes
  function handleViewChange(newView) {
    setActiveView(newView);
    setActiveFilter('all');
  }

  // Determine which category pills to show
  const visibleCategories = useMemo(() => {
    if (activeView === 'all') return null;

    return Object.values(CATEGORIES)
      .filter((cat) => cat.parent === activeView)
      .map((cat) => cat.id);
  }, [activeView]);

  // Calculate max scores for Buzz normalization (unfiltered)
  const maxBrandScore = useMemo(
    () => getMaxScore(brandTrends),
    [brandTrends]
  );

  // Add Pulse scores using the correct formula for each list
  const brandsWithPulse = useMemo(
    () => addProductPulseScores(brandTrends, maxBrandScore),
    [brandTrends, maxBrandScore]
  );

  const beveragesWithPulse = useMemo(
    () => addMarketPulseScores(beverageTrends),
    [beverageTrends]
  );

  // Filter, sort, rank
  const filteredBrands = applyDisplayRanks(
    sortTrends(
      filterTrends(brandsWithPulse, activeView, activeFilter, 'brand'),
      activeSort
    )
  );

  const filteredBeverages = applyDisplayRanks(
    sortTrends(
      filterTrends(beveragesWithPulse, activeView, activeFilter, 'beverage'),
      activeSort
    )
  );

  return (
    <div className={styles.dashboard}>
      {/* Top controls row: view toggle + sort */}
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

      {/* Two-column intelligence grid */}
      <div className={styles.columns}>
        {/* LEFT: Product Pulse (brands) */}
        <section className={styles.column}>
          <div className={styles.columnHeader}>
            <h2 className={styles.columnTitle}>Product Pulse</h2>
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
                No products in this category.
              </p>
            )}
          </div>
        </section>

        {/* RIGHT: Market Pulse (beverage subcategories) */}
        <section className={styles.column}>
          <div className={styles.columnHeader}>
            <h2 className={styles.columnTitle}>Market Pulse</h2>
            <span className={styles.columnCount}>
              {filteredBeverages.length} result{filteredBeverages.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className={styles.cardList} role="list">
            {filteredBeverages.map((trend) => (
              <TrendCard
                key={trend._id}
                trend={trend}
                type="beverage"
                maxScore={getMaxScore(beverageTrends)}
              />
            ))}
            {filteredBeverages.length === 0 && (
              <p className={styles.empty}>
                No categories in this view.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}