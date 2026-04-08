// components/FilterBar.jsx
// Horizontal pill bar for filtering trends by beverage category.
// Receives the active filter, a callback to change it, and an
// optional list of visible category ids to show only relevant
// pills when a parent view (alcoholic/non-alc) is active.
//
// Props:
//   activeFilter       - currently selected category id, or 'all'
//   onFilterChange     - callback receiving the new category id
//   visibleCategories  - array of category ids to show, or null for all

'use client';

import styles from './FilterBar.module.css';
import { CATEGORIES } from '../lib/taxonomy';

// Build the full ordered list of filters: "All" first, then categories
const ALL_FILTERS = [
  { id: 'all', label: 'All', color: null },
  ...Object.values(CATEGORIES).map((cat) => ({
    id: cat.id,
    label: cat.label,
    color: cat.color,
  })),
];

export default function FilterBar({ activeFilter, onFilterChange, visibleCategories }) {
  // If visibleCategories is provided, show only "All" + those categories.
  // Otherwise show everything.
  const filters = visibleCategories
    ? ALL_FILTERS.filter(
        (f) => f.id === 'all' || visibleCategories.includes(f.id)
      )
    : ALL_FILTERS;

  return (
    <div className={styles.filterBar} role="tablist" aria-label="Category filter">
      {filters.map((filter) => {
        const isActive = activeFilter === filter.id;

        // Set the active pill's color to match its category
        const activeStyle = isActive && filter.color
          ? {
              '--pill-active-bg': `${filter.color}18`,
              '--pill-active-color': filter.color,
            }
          : undefined;

        return (
          <button
            key={filter.id}
            role="tab"
            aria-selected={isActive}
            className={[
              styles.pill,
              isActive ? styles.pillActive : '',
              filter.id === 'all' ? styles.pillAll : '',
            ].filter(Boolean).join(' ')}
            style={activeStyle}
            onClick={() => onFilterChange(filter.id)}
          >
            {filter.color && (
              <span
                className={styles.dot}
                style={{ backgroundColor: filter.color }}
              />
            )}
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}