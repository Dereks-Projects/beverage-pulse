// app/about-the-data/page.js
// ==========================================================================
// "About the Data" page: the methodology and positioning page, separate from
// the company About page. Server component, with the shared Header and Footer
// for site congruence.
//
// Goal of the copy: inform how insightful the product is, build confidence in
// the method without revealing it, and make the case that this is a deeper
// read on culture, trend, and brand. Signals are named as concepts, not
// sources. No formulas, no weights, no platforms.
// ==========================================================================

import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from './page.module.css';

export const metadata = {
  title: 'About the Data',
  description:
    'How BeveragePulse reads cultural momentum at the crossroads of data science and behavioral science.',
};

const SIGNALS = [
  {
    name: 'Online Buzz',
    text: 'The conversation forming in enthusiast and community spaces, where new interest tends to surface first.',
  },
  {
    name: 'Video',
    text: 'How much people are actively watching content about the brand, not how many simply follow it.',
  },
  {
    name: 'News',
    text: 'The weight and direction of press coverage, and whether it is building or fading.',
  },
  {
    name: 'Search and Discovery',
    text: 'How often people seek the brand out on their own, a direct read on real curiosity.',
  },
];

export default function AboutTheDataPage() {
  return (
    <main className={styles.main}>
      <Header />

      <div className={styles.content}>
        <Link href="/" className={styles.backLink}>Back to the dashboard</Link>

        <h1 className={styles.pageTitle}>About the Data</h1>
        <p className={styles.pageSubtitle}>BeveragePulse reads cultural momentum where data science meets behavioral science, so you can see where a brand is heading before the market does.</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Culture, measured</h2>
          <p className={styles.paragraph}>Most trend tools count what is already obvious: likes, paid followers, a single popularity score. We do something different. BeveragePulse measures what people actually do and say about a brand across independent corners of culture, and reads the momentum forming underneath, often well before it reaches the shelf or the sales report.</p>
          <p className={styles.paragraph}>There is no vanity number here. We do not reward whoever bought the most followers or ran the biggest campaign. We track real behavior and real conversation, and we keep the signals honest and separate so nothing can be inflated by a single noisy source.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Four independent signals</h2>
          <p className={styles.paragraph}>Every brand is read through four separate lenses, each measuring a different kind of attention.</p>
          <div className={styles.signalGrid}>
            {SIGNALS.map((signal) => (
              <div key={signal.name} className={styles.signalCard}>
                <span className={styles.signalName}>{signal.name}</span>
                <span className={styles.signalText}>{signal.text}</span>
              </div>
            ))}
          </div>
          <p className={styles.paragraph}>We keep these four apart on purpose. A brand can be loud in one and quiet in another, and that contrast is itself a signal. We never blend them into a single score that hides what is really happening.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Why it reads ahead of the market</h2>
          <p className={styles.paragraph}>Culture moves first. What people watch, search for, and talk about tends to shift before it shows up in distribution, on menus, or in sales data. By the time a brand is everywhere on the shelf, the cultural signal that pointed to it has usually been visible for a long time.</p>
          <p className={styles.paragraph}>Confidence comes from agreement. When several independent signals move the same way at once, that is corroborated momentum, demand forming in the open rather than a one-off spike. When only one signal moves, we say so plainly and treat it as a flag to watch, not a trend.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>The crossroads</h2>
          <p className={styles.paragraph}>This is where data science meets behavioral science. The data science measures attention at scale, cleanly and consistently, across every brand we track. The behavioral science reads what that attention means: intent, curiosity, and momentum, the human signals that come before a buying decision. Neither half is enough on its own. Together they tell you not just what is happening, but what is coming.</p>
          <p className={styles.paragraph}>That is the edge BeveragePulse is built to give you: a clear view of the brands and categories rising in culture right now, while there is still time to act on them.</p>
        </section>
      </div>

      <Footer />
    </main>
  );
}