// components/Dashboard.jsx
// ==========================================================================
// Trending Brands dashboard. Single list, always ordered by the AI rank.
//
// The home board shows the alcoholic Top 100, the product's flagship. The
// category pills narrow to one category and draw from the full roster, so
// brands ranked below 100 (energy, non-alc, THC) still appear in their own
// pill even though they are not on the main board. Selecting a pill is the
// only thing that lifts the Top 100 cap. The rank is the point of view, so
// nothing here reorders the board.
// ==========================================================================

'use client';

import { useState } from 'react';
import TrendCard from './TrendCard';
import FilterBar from './FilterBar';
import { BRAND_TAXONOMY } from '../lib/taxonomy';
import styles from './Dashboard.module.css';

// The home board is the alcoholic Top 100. A selected pill is exempt: it
// shows that category's full set, including brands ranked below 100.
const HOME_BOARD_SIZE = 100;

/**
 * Get the category id for a brand.
 */
function getCategoryId(name) {
  const entry = BRAND_TAXONOMY[name.toLowerCase()];
  return entry ? entry.category : null;
}

/**
 * Narrow to a single category, or pass everything through when 'all'.
 */
function filterByCategory(trends, category) {
  if (category === 'all') return trends;
  return trends.filter((trend) => getCategoryId(trend.name) === category);
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
  const [activeFilter, setActiveFilter] = useState('all');

  // No pill selected: the home board, capped to the alcoholic Top 100.
  // A pill selected: that category's full set from the whole roster, so
  // brands below rank 100 still surface in their own pill.
  const inCategory = filterByCategory(brandTrends, activeFilter);
  const scoped =
    activeFilter === 'all'
      ? inCategory.filter(
          (trend) => typeof trend.aiRank === 'number' && trend.aiRank <= HOME_BOARD_SIZE
        )
      : inCategory;
  const filteredBrands = sortByRank(scoped);

  return (
    <div className={styles.dashboard}>
      {/* Category filter pills */}
      <div className={styles.filterSection}>
        <p className={styles.filterLabel}>Filter by category</p>
        <FilterBar
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          visibleCategories={null}
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
            <TrendCard key={trend._id} trend={trend} type="brand" />
          ))}
          {filteredBrands.length === 0 && (
            <p className={styles.empty}>No brands in this category.</p>
          )}
        </div>
      </section>
    </div>
  );
}