'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import styles from './NavMenu.module.css';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/about-the-data', label: 'About the Data' },
  { href: '/about', label: 'About' },
  { href: 'mailto:derek@informativemedia.com', label: 'Contact' },
];

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/cookies', label: 'Cookies Policy' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/content-policy', label: 'Content Policy' },
];

function MenuPanel({ isOpen, onClose, pathname }) {
  if (typeof window === 'undefined') return null;

  return createPortal(
    <>
      {isOpen && (
        <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      )}

      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}>
        <nav className={styles.nav}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={onClose} className={`${styles.navLink} ${pathname === link.href ? styles.navLinkActive : ''}`}>{link.label}</a>
          ))}
        </nav>

        <div className={styles.legalSection}>
          <p className={styles.sectionLabel}>Legal</p>
          {LEGAL_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={onClose} className={`${styles.legalLink} ${pathname === link.href ? styles.legalLinkActive : ''}`}>{link.label}</a>
          ))}
        </div>

        <div className={styles.panelFooter}>
          <a href="https://informativemedia.com" target="_blank" rel="noopener noreferrer" className={styles.companyLink}>Informative Media</a>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function NavMenu() {
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
      <button className={`${styles.hamburger} ${isOpen ? styles.hamburgerOpen : ''}`} onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close menu' : 'Open menu'} aria-expanded={isOpen}>
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
        <span className={styles.hamburgerLine} />
      </button>

      {mounted && (
        <MenuPanel isOpen={isOpen} onClose={() => setIsOpen(false)} pathname={pathname} />
      )}
    </>
  );
}