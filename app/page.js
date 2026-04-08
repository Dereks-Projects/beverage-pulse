import connectToDatabase from '../lib/db';
import BeverageTrend from '../models/BeverageTrend';
import BrandTrend from '../models/BrandTrend';
import TickerBar from '../components/TickerBar';
import Dashboard from '../components/Dashboard';
import NavMenu from '../components/NavMenu';
import DataFreshness from '../components/DataFreshness';
import Footer from '../components/Footer';
import styles from './page.module.css';

async function getBeverageTrends() {
  await connectToDatabase();

  const trends = await BeverageTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20)
    .lean();

  return JSON.parse(JSON.stringify(trends));
}

async function getBrandTrends() {
  await connectToDatabase();

  const trends = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20)
    .lean();

  return JSON.parse(JSON.stringify(trends));
}

export default async function Home() {
  const beverageTrends = await getBeverageTrends();
  const brandTrends = await getBrandTrends();

  const dataDate = beverageTrends.length > 0
    ? new Date(beverageTrends[0].weekOf).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No data';

  const allTrends = [...beverageTrends, ...brandTrends];
  const redditDate = allTrends.reduce((latest, trend) => {
    if (!trend.lastUpdated) return latest;
    if (!latest) return trend.lastUpdated;
    return trend.lastUpdated > latest ? trend.lastUpdated : latest;
  }, null);

  const googleDate = allTrends.reduce((latest, trend) => {
    if (!trend.lastGoogleUpdate) return latest;
    if (!latest) return trend.lastGoogleUpdate;
    return trend.lastGoogleUpdate > latest ? trend.lastGoogleUpdate : latest;
  }, null);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <h1 className={styles.logo}>
              Beverage<span className={styles.logoAccent}>Pulse</span>
            </h1>
            <span className={styles.dataDate}>
              Week of {dataDate}
            </span>
            <DataFreshness redditDate={redditDate} googleDate={googleDate} />
          </div>
          <NavMenu redditDate={redditDate} googleDate={googleDate} />
        </div>
      </header>

      <TickerBar
        beverageTrends={beverageTrends}
        brandTrends={brandTrends}
        count={10}
      />

      <Dashboard
        beverageTrends={beverageTrends}
        brandTrends={brandTrends}
      />

      <Footer />
    </main>
  );
}