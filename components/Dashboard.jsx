// components/Dashboard.jsx
// Client component that manages view toggle, category filter,
// and sort state. Calculates Pulse score for each trend and
// passes it to TrendCard.
//
// Props:
//   beverageTrends - array of beverage trend objects from MongoDB
//   brandTrends    - array of brand trend objects from MongoDB

'use client';

import { useState, useMemo } from 'react';
import TrendCard from './TrendCard';
import FilterBar from './FilterBar';
import ViewToggle from './ViewToggle';
import SortToggle from './SortToggle';
import { calculatePulse } from '../lib/pulseScore';
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
 * Used for Buzz normalization in Pulse calculation.
 */
function getMaxScore(trends) {
  if (trends.length === 0) return 0;
  return Math.max(...trends.map((t) => t.score || 0));
}

/**
 * Add Pulse score to each trend in an array.
 */
function addPulseScores(trends, maxScore) {
  return trends.map((trend) => ({
    ...trend,
    pulseScore: calculatePulse(trend, maxScore),
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
 * Default sort (score) now uses Pulse score.
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
  const [activeView, setActiveView] = useState('alcoholic');
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
  const maxBeverageScore = useMemo(
    () => getMaxScore(beverageTrends),
    [beverageTrends]
  );

  const maxBrandScore = useMemo(
    () => getMaxScore(brandTrends),
    [brandTrends]
  );

  // Add Pulse scores before filtering/sorting
  const beveragesWithPulse = useMemo(
    () => addPulseScores(beverageTrends, maxBeverageScore),
    [beverageTrends, maxBeverageScore]
  );

  const brandsWithPulse = useMemo(
    () => addPulseScores(brandTrends, maxBrandScore),
    [brandTrends, maxBrandScore]
  );

  // Filter, sort by Pulse, then recalculate display ranks
  const filteredBeverages = applyDisplayRanks(
    sortTrends(
      filterTrends(beveragesWithPulse, activeView, activeFilter, 'beverage'),
      activeSort
    )
  );

  const filteredBrands = applyDisplayRanks(
    sortTrends(
      filterTrends(brandsWithPulse, activeView, activeFilter, 'brand'),
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

      {/* Two-column trend grid */}
      <div className={styles.columns}>
        {/* Beverage trends */}
        <section className={styles.column}>
          <div className={styles.columnHeader}>
            <h2 className={styles.columnTitle}>Beverages</h2>
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
                maxScore={maxBeverageScore}
              />
            ))}
            {filteredBeverages.length === 0 && (
              <p className={styles.empty}>
                No beverages in this category.
              </p>
            )}
          </div>
        </section>

        {/* Brand trends */}
        <section className={styles.column}>
          <div className={styles.columnHeader}>
            <h2 className={styles.columnTitle}>Brands</h2>
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
    </div>
  );
}