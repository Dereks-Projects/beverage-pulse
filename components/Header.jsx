// components/Header.jsx
// Shared header component used on every page.
// This is a server component that fetches its own data from MongoDB.
// Renders: logo, data week, freshness indicators, hamburger menu.

import connectToDatabase from '../lib/db';
import BeverageTrend from '../models/BeverageTrend';
import BrandTrend from '../models/BrandTrend';
import NavMenu from './NavMenu';
import DataFreshness from './DataFreshness';
import styles from './Header.module.css';

export default async function Header() {
  await connectToDatabase();

  // Fetch minimal data for the header: latest weekOf date and freshness timestamps
  const latestBeverage = await BeverageTrend.findOne()
    .sort({ weekOf: -1 })
    .select('weekOf lastUpdated lastGoogleUpdate')
    .lean();

  const latestBrand = await BrandTrend.findOne()
    .sort({ weekOf: -1 })
    .select('weekOf lastUpdated lastGoogleUpdate')
    .lean();

  // Determine the display date (week of)
  const weekOfDate = latestBeverage?.weekOf || latestBrand?.weekOf || null;
  const dataDate = weekOfDate
    ? new Date(weekOfDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No data';

  // Find the most recent Reddit update across both collections
  const redditDates = [
    latestBeverage?.lastUpdated,
    latestBrand?.lastUpdated,
  ].filter(Boolean);
  const redditDate = redditDates.length > 0
    ? redditDates.reduce((a, b) => (a > b ? a : b))
    : null;

  // Find the most recent Google update across both collections
  const googleDates = [
    latestBeverage?.lastGoogleUpdate,
    latestBrand?.lastGoogleUpdate,
  ].filter(Boolean);
  const googleDate = googleDates.length > 0
    ? googleDates.reduce((a, b) => (a > b ? a : b))
    : null;

  // Serialize dates for client components (NavMenu is a client component)
  const redditDateStr = redditDate ? new Date(redditDate).toISOString() : null;
  const googleDateStr = googleDate ? new Date(googleDate).toISOString() : null;

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.headerLeft}>
          <h1 className={styles.logo}>
            Beverage<span className={styles.logoAccent}>Pulse</span>
          </h1>
          <span className={styles.dataDate}>
            Week of {dataDate}
          </span>
          <DataFreshness redditDate={redditDateStr} googleDate={googleDateStr} />
        </div>
        <NavMenu redditDate={redditDateStr} googleDate={googleDateStr} />
      </div>
    </header>
  );
}