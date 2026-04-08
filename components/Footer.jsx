import styles from './Footer.module.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.tagline}>
          Beverage intelligence at the crossroads of behavioral and data science.
        </p>
        <p className={styles.legal}>
          &copy; {year}{' '}
          <a href="https://informativemedia.com" target="_blank" rel="noopener noreferrer" className={styles.legalLink}>Informative Media</a>. All rights reserved.
        </p>
      </div>
    </footer>
  );
}