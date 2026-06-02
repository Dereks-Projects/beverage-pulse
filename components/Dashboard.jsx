// components/Dashboard.jsx
// ==========================================================================
// Trending Brands dashboard. Single list, always ordered by the AI rank.
//
// There is no user-facing sort control. The rank is the product's point of
// view, so the board's order is fixed to aiRank, lowest number first. The
// View toggle and the category filter narrow the list; they never reorder it.
// ==========================================================================

'use client';

import { useState, useMemo } from 'react';
import TrendCard from './TrendCard';
import FilterBar from './FilterBar';
import ViewToggle from './ViewToggle';
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
 * Order the board by the AI rank, lowest number first. Brands without a
 * numeric rank fall to the bottom.
 */
function sortByRank(trends) {
  return [...trends].sort((a, b) => {
    const ra = typeof a.aiRank === 'number' ? a.aiRank : Infinity;
    const rb = typeof b.aiRank === 'number' ? b.aiRank : Infinity;
    return ra - rb;
  });
}

export default function Dashboard({ brandTrends }) {
  const [activeView, setActiveView] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');

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

  const filteredBrands = sortByRank(
    filterTrends(brandTrends, activeView, activeFilter)
  );

  return (
    <div className={styles.dashboard}>
      {/* Top controls: view toggle only */}
      <div className={styles.controlsRow}>
        <ViewToggle
          activeView={activeView}
          onViewChange={handleViewChange}
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