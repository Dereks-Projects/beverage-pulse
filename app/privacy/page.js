// app/privacy/page.js
// Privacy Policy for BeveragePulse.

import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Privacy Policy',
  description: 'BeveragePulse privacy policy. How we handle data and protect your privacy.',
};

export default function PrivacyPage() {
  return (
    <main className={styles.main}>
      <Header />

      <div className={styles.content}>
        <Link href="/" className={styles.backLink}>← Back to Dashboard</Link>

        <h1 className={styles.pageTitle}>Privacy Policy</h1>
        <p className={styles.lastUpdated}>Last updated: April 2026</p>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Overview</h2>
          <p className={styles.paragraph}>
            BeveragePulse is operated by Informative Media. We take your
            privacy seriously. This policy explains what information we
            collect, how we use it, and your rights regarding that
            information.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Information We Collect</h2>
          <p className={styles.paragraph}>
            BeveragePulse does not currently collect personal information
            from visitors. We do not require account registration, login
            credentials, email addresses, or any form of personal
            identification to use the dashboard.
          </p>
          <p className={styles.paragraph}>
            We do not use analytics tracking tools that collect personal
            data. We do not collect IP addresses, device fingerprints, or
            browsing history for profiling purposes.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Data We Process</h2>
          <p className={styles.paragraph}>
            BeveragePulse collects and processes publicly available data
            from Reddit and Google Trends for the purpose of generating
            beverage industry intelligence. This data consists of
            aggregated mention counts, search interest scores, and
            post engagement metrics. No personal information about
            individual Reddit users or Google users is collected,
            stored, or displayed.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Cookies</h2>
          <p className={styles.paragraph}>
            BeveragePulse uses minimal cookies necessary for the site to
            function. For details on our cookie usage, please see
            our <Link href="/cookies" className={styles.inlineLink}>Cookies Policy</Link>.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Third-Party Services</h2>
          <p className={styles.paragraph}>
            BeveragePulse does not share, sell, or distribute any data to
            third parties. We do not integrate third-party advertising
            networks, social media trackers, or marketing pixels.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Data Retention</h2>
          <p className={styles.paragraph}>
            Aggregated beverage trend data is retained in our database for
            the purpose of tracking historical trends. This data is
            statistical in nature and contains no personal information.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Changes to This Policy</h2>
          <p className={styles.paragraph}>
            We may update this privacy policy from time to time. Changes
            will be reflected on this page with an updated revision date.
            If we begin collecting personal information in the future, we
            will update this policy accordingly and provide appropriate
            notice.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Contact</h2>
          <p className={styles.paragraph}>
            If you have questions about this privacy policy, contact us
            at <a href="mailto:derek@informativemedia.com" className={styles.inlineLink}>derek@informativemedia.com</a>.
          </p>
        </div>
      </div>

      <Footer />
    </main>
  );
}