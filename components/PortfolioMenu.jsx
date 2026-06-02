'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import styles from './PortfolioMenu.module.css';

// External portfolio sites, top to bottom. Each opens in a new tab.
const PORTFOLIO_LINKS = [
  { href: 'https://restaurantstandards.com', name: 'Restaurant Standards', description: 'Restaurant Training & Development' },
  { href: 'https://somm.site', name: 'Somm.Site', description: 'Wine Culture Insights' },
  { href: 'https://somm.tips', name: 'Somm.Tips', description: 'Beverage Recommendation Engine' },
  { href: 'https://beverage.fyi', name: 'Beverage.fyi', description: 'Online Magazine' },
  { href: 'https://hospitality.fyi', name: 'Hospitality.fyi', description: 'Online Magazine' },
];

const PARENT_COMPANY = { href: 'https://www.informativemedia.com', name: 'Informative Media' };

function PortfolioPanel({ isOpen, onClose }) {
  if (typeof window === 'undefined') return null;

  return createPortal(
    <>
      {isOpen && (
        <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      )}

      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}>
        <p className={styles.sectionLabel}>Our Portfolio</p>
        <nav className={styles.portfolioNav}>
          {PORTFOLIO_LINKS.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" onClick={onClose} className={styles.portfolioLink}><span className={styles.portfolioName}>{link.name}</span><span className={styles.portfolioDescription}>{link.description}</span></a>
          ))}
        </nav>

        <div className={styles.parentSection}>
          <p className={styles.sectionLabel}>Presented By</p>
          <a href={PARENT_COMPANY.href} target="_blank" rel="noopener noreferrer" onClick={onClose} className={styles.parentLink}>{PARENT_COMPANY.name}</a>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function PortfolioMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <button className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close portfolio menu' : 'Open portfolio menu'} aria-expanded={isOpen}>
        <svg className={styles.chevronIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4 6 8 10 12 6" /></svg>
      </button>

      {mounted && (
        <PortfolioPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}