// app/page.js
export const dynamic = 'force-dynamic';

import connectToDatabase from '../lib/db';
import BrandTrend from '../models/BrandTrend';
import Header from '../components/Header';
import Dashboard from '../components/Dashboard';
import Footer from '../components/Footer';
import styles from './page.module.css';

async function getBrandTrends() {
  await connectToDatabase();

  // Fetch every brand on the board, best rank first. The board and the
  // category pills both read from this one set, so it must be the full
  // roster, not a top slice. A cap here starves the pills, since a brand
  // ranked below the cap can never appear in its category pill. Brands
  // without an AI rank are not on the board yet.
  const trends = await BrandTrend.find({ aiRank: { $ne: null } })
    .sort({ aiRank: 1 })
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