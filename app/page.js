export const dynamic = 'force-dynamic';

import connectToDatabase from '../lib/db';
import BrandTrend from '../models/BrandTrend';
import Header from '../components/Header';
import TickerBar from '../components/TickerBar';
import Dashboard from '../components/Dashboard';
import Footer from '../components/Footer';
import styles from './page.module.css';

async function getBrandTrends() {
  await connectToDatabase();

  const trends = await BrandTrend.find()
    .sort({ weekOf: -1, rank: 1 })
    .limit(20)
    .lean();

  return JSON.parse(JSON.stringify(trends));
}

export default async function Home() {
  const brandTrends = await getBrandTrends();

  return (
    <main className={styles.main}>
      <Header />

      <TickerBar
        beverageTrends={[]}
        brandTrends={brandTrends}
        count={10}
      />

      <Dashboard
        brandTrends={brandTrends}
      />

      <Footer />
    </main>
  );
}