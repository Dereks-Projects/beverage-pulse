import Link from 'next/link';
import styles from './Footer.module.css';

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/terms', label: 'Terms' },
  { href: '/content-policy', label: 'Content Policy' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.brand}>
          <p className={styles.wordmark}>Beverage<span className={styles.wordmarkAccent}>Pulse</span></p>
          <p className={styles.tagline}>Beverage intelligence at the crossroads of behavioral and data science.</p>
        </div>

        <div className={styles.links}>
          <nav className={styles.legalNav}>
            {LEGAL_LINKS.map((link, index) => (
              <span key={link.href} className={styles.legalItem}>
                <Link href={link.href} className={styles.legalLink}>{link.label}</Link>
                {index < LEGAL_LINKS.length - 1 && <span className={styles.divider}>/</span>}
              </span>
            ))}
          </nav>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>&copy; {year} <a href="https://informativemedia.com" target="_blank" rel="noopener noreferrer" className={styles.companyLink}>Informative Media</a>. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}