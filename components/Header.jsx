// components/Header.jsx
// Shared header used on every page. Server component that reads the data week
// from MongoDB and renders a centered wordmark and data week, with the
// portfolio chevron pinned left and the hamburger menu pinned right.

import connectToDatabase from '../lib/db';
import BeverageTrend from '../models/BeverageTrend';
import BrandTrend from '../models/BrandTrend';
import PortfolioMenu from './PortfolioMenu';
import NavMenu from './NavMenu';
import styles from './Header.module.css';

export default async function Header() {
  await connectToDatabase();

  const latestBeverage = await BeverageTrend.findOne().sort({ weekOf: -1 }).select('weekOf').lean();
  const latestBrand = await BrandTrend.findOne().sort({ weekOf: -1 }).select('weekOf').lean();

  const weekOfDate = latestBeverage?.weekOf || latestBrand?.weekOf || null;
  const dataDate = weekOfDate
    ? new Date(weekOfDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No data';

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.headerPortfolio}>
          <PortfolioMenu />
        </div>
        <div className={styles.headerCenter}>
          <h1 className={styles.logo}>Beverage<span className={styles.logoAccent}>Pulse</span></h1>
          <span className={styles.dataDate}>Week of {dataDate}</span>
        </div>
        <div className={styles.headerNav}>
          <NavMenu />
        </div>
      </div>
    </header>
  );
}