export const dynamic = 'force-dynamic';

import connectToDatabase from '../lib/db';
import BrandTrend from '../models/BrandTrend';
import Header from '../components/Header';
import Dashboard from '../components/Dashboard';
import Footer from '../components/Footer';
import styles from './page.module.css';

async function getBrandTrends() {
  await connectToDatabase();

  // Fetch the AI-ranked brands, best rank first. Brands without an AI rank
  // are not on the board yet; they appear once the ranking reaches them.
  const trends = await BrandTrend.find({ aiRank: { $ne: null } })
    .sort({ aiRank: 1 })
    .limit(20)
    .lean();

  return JSON.parse(JSON.stringify(trends));
}

export default async function Home() {
  const brandTrends = await getBrandTrends();

  return (
    <main className={styles.main}>
      <Header />

      <Dashboard
        brandTrends={brandTrends}
      />

      <Footer />
    </main>
  );
}