// components/Tooltip.jsx
// Reusable tooltip component. Shows a small dark card with
// explanatory text. Desktop: hover to show. Mobile: tap to
// toggle. Tap anywhere else to dismiss.
//
// Props:
//   text      - the explanation text to display
//   align     - 'center' (default), 'left', or 'right'

'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './Tooltip.module.css';

export default function Tooltip({ text, align = 'center' }) {
  const [isVisible, setIsVisible] = useState(false);
  const wrapperRef = useRef(null);

  // Close tooltip when tapping outside (mobile behavior)
  useEffect(() => {
    if (!isVisible) return;

    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsVisible(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isVisible]);

  // Determine alignment class
  let alignClass = '';
  if (align === 'left') alignClass = styles.tooltipLeft;
  if (align === 'right') alignClass = styles.tooltipRight;

  return (
    <span
      className={styles.wrapper}
      ref={wrapperRef}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <span
        className={styles.trigger}
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(!isVisible);
        }}
        role="button"
        aria-label="More info"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setIsVisible(!isVisible);
          }
        }}
      >
        <span className={styles.triggerText}>?</span>
      </span>

      <span
        className={[
          styles.tooltip,
          isVisible ? styles.tooltipVisible : '',
          alignClass,
        ].filter(Boolean).join(' ')}
        role="tooltip"
      >
        <span className={styles.tooltipText}>{text}</span>
      </span>
    </span>
  );
}