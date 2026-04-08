'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import DataFreshness from './DataFreshness';
import styles from './NavMenu.module.css';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/about', label: 'About the Data' },
];

function NavLink({ href, label, isActive, onClose }) {
  const bg = isActive ? '#1C2230' : 'transparent';
  const color = isActive ? '#E8ECF1' : '#8A94A6';
  const linkStyle = { display: 'block', padding: '12px 16px', fontSize: '18px', fontWeight: 600, color: color, backgroundColor: bg, textDecoration: 'none', borderRadius: '6px' };

  return (
    <a key={href} href={href} onClick={onClose} style={linkStyle}>{label}</a>
  );
}

function MenuPanel({ isOpen, onClose, redditDate, googleDate, pathname }) {
  if (typeof window === 'undefined') return null;

  const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', zIndex: 9998 };
  const panelStyle = { position: 'fixed', top: 0, right: 0, bottom: 0, width: '300px', maxWidth: '85vw', backgroundColor: '#111520', borderLeft: '1px solid #2A3040', boxShadow: isOpen ? '-8px 0 30px rgba(0, 0, 0, 0.6)' : 'none', zIndex: 9999, transform: isOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s ease', display: 'flex', flexDirection: 'column', padding: '60px 24px 24px', overflowY: 'auto' };
  const navStyle = { display: 'flex', flexDirection: 'column', gap: '4px' };
  const statusWrapStyle = { padding: '16px', marginTop: '24px', borderTop: '1px solid #2A3040' };
  const statusLabelStyle = { fontSize: '11px', fontWeight: 600, color: '#5A6478', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' };
  const footerStyle = { marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #2A3040', paddingLeft: '16px' };
  const footerLinkStyle = { fontSize: '14px', fontWeight: 500, color: '#5A6478', textDecoration: 'none', borderBottom: '1px solid #5A6478' };

  return createPortal(
    <>
      {isOpen && (
        <div onClick={onClose} aria-hidden="true" style={overlayStyle} />
      )}

      <div style={panelStyle}>
        <nav style={navStyle}>
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href} label={link.label} isActive={pathname === link.href} onClose={onClose} />
          ))}
        </nav>

        <div style={statusWrapStyle}>
          <p style={statusLabelStyle}>Data Status</p>
          <DataFreshness redditDate={redditDate} googleDate={googleDate} />
        </div>

        <div style={footerStyle}>
          <a href="https://informativemedia.com" target="_blank" rel="noopener noreferrer" style={footerLinkStyle}>Informative Media</a>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function NavMenu({ redditDate, googleDate }) {
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
        <MenuPanel isOpen={isOpen} onClose={() => setIsOpen(false)} redditDate={redditDate} googleDate={googleDate} pathname={pathname} />
      )}
    </>
  );
}