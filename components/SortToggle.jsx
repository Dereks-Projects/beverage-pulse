// components/SortToggle.jsx
// Compact sort control using a native <select> element.
// Native selects are better than custom dropdowns for mobile:
// they trigger the OS-native picker, which is faster and more
// accessible than a custom menu.
//
// Props:
//   activeSort   - current sort key ('score', 'mentions', 'name')
//   onSortChange - callback receiving the new sort key

'use client';

import styles from './SortToggle.module.css';

const SORT_OPTIONS = [
  { id: 'score', label: 'Score' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'name', label: 'Name' },
];

export default function SortToggle({ activeSort, onSortChange }) {
  return (
    <div className={styles.sortWrapper}>
      <label htmlFor="sort-select" className={styles.label}>
        Sort
      </label>
      <select
        id="sort-select"
        className={styles.select}
        value={activeSort}
        onChange={(e) => onSortChange(e.target.value)}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}