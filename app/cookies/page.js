// app/cookies/page.js
// Cookies Policy for BeveragePulse.

import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Cookies Policy',
  description: 'BeveragePulse cookies policy. What cookies we use and why.',
};

export default function CookiesPage() {
  return (
    <main className={styles.main}>
      <Header />

      <div className={styles.content}>
        <Link href="/" className={styles.backLink}>← Back to Dashboard</Link>

        <h1 className={styles.pageTitle}>Cookies Policy</h1>
        <p className={styles.lastUpdated}>Last updated: April 2026</p>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What Are Cookies</h2>
          <p className={styles.paragraph}>
            Cookies are small text files stored on your device when you
            visit a website. They help websites remember preferences and
            improve the user experience. Some cookies are essential for a
            site to function, while others are used for analytics or
            advertising.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Cookies We Use</h2>
          <p className={styles.paragraph}>
            BeveragePulse uses only essential, functional cookies required
            for the site to operate. These are automatically set by our
            hosting infrastructure (Next.js) and are necessary for page
            routing and server-side rendering. They do not track your
            behavior, store personal information, or identify you in
            any way.
          </p>
          <p className={styles.paragraph}>
            We do not use advertising cookies, marketing cookies, social
            media cookies, or third-party analytics cookies.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What We Do Not Collect</h2>
          <p className={styles.paragraph}>
            BeveragePulse does not collect personal data through cookies
            or any other mechanism. We do not track individual users, build
            user profiles, or share cookie data with any third party. We
            do not use Google Analytics, Facebook Pixel, or any similar
            tracking service.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Google Trends Data</h2>
          <p className={styles.paragraph}>
            BeveragePulse retrieves publicly available search interest
            data from Google Trends as part of our data collection
            process. This is a server-side operation that does not involve
            cookies on your device. No data from your browser is sent to
            Google through BeveragePulse.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Managing Cookies</h2>
          <p className={styles.paragraph}>
            You can control and delete cookies through your browser
            settings. Most browsers allow you to block or delete cookies.
            However, blocking essential cookies may prevent the site from
            functioning correctly.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Changes to This Policy</h2>
          <p className={styles.paragraph}>
            If we introduce new cookie types in the future, such as
            analytics or preference cookies, we will update this policy
            and provide appropriate notice. Any changes will be reflected
            on this page with an updated revision date.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Contact</h2>
          <p className={styles.paragraph}>
            If you have questions about our cookie practices, contact us
            at <a href="mailto:derek@informativemedia.com" className={styles.inlineLink}>derek@informativemedia.com</a>.
          </p>
        </div>
      </div>

      <Footer />
    </main>
  );
}