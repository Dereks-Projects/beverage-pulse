// components/ViewToggle.jsx
// Segmented control for switching between All, Alcoholic, and
// Non-Alcoholic views. This is the highest-level data split in
// the product, sitting above category filters.
//
// Props:
//   activeView   - 'all', 'alcoholic', or 'non-alcoholic'
//   onViewChange - callback receiving the new view string

'use client';

import styles from './ViewToggle.module.css';

const VIEWS = [
  { id: 'all', label: 'All' },
  { id: 'alcoholic', label: 'Alcoholic' },
  { id: 'non-alcoholic', label: 'Non-Alc' },
];

export default function ViewToggle({ activeView, onViewChange }) {
  return (
    <div className={styles.toggleWrapper}>
      <span className={styles.label}>View</span>
      <div className={styles.toggleGroup} role="tablist" aria-label="View toggle">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            role="tab"
            aria-selected={activeView === view.id}
            className={[
              styles.toggleButton,
              activeView === view.id ? styles.toggleButtonActive : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
    </div>
  );
}