// app/terms/page.js
// Terms of Use for BeveragePulse.

import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Terms of Use',
  description: 'BeveragePulse terms of use. Rules and conditions for using this site.',
};

export default function TermsPage() {
  return (
    <main className={styles.main}>
      <Header />

      <div className={styles.content}>
        <Link href="/" className={styles.backLink}>← Back to Dashboard</Link>

        <h1 className={styles.pageTitle}>Terms of Use</h1>
        <p className={styles.lastUpdated}>Last updated: April 2026</p>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Acceptance of Terms</h2>
          <p className={styles.paragraph}>
            By accessing and using BeveragePulse, you agree to be bound by
            these Terms of Use. If you do not agree with any part of these
            terms, you should not use this site. BeveragePulse is operated
            by Informative Media.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Use of the Site</h2>
          <p className={styles.paragraph}>
            BeveragePulse is provided for informational purposes only. The
            data, scores, rankings, and signals displayed on this site are
            intended to support beverage industry professionals in making
            informed decisions. They do not constitute financial advice,
            investment recommendations, or guarantees of market performance.
          </p>
          <p className={styles.paragraph}>
            You may use BeveragePulse for your own professional and
            informational purposes. You may not use automated tools,
            scrapers, bots, or other software to extract data from this
            site without prior written permission from Informative Media.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Intellectual Property</h2>
          <p className={styles.paragraph}>
            All content on BeveragePulse, including but not limited to the
            scoring algorithms, data models, ranking methodology, visual
            design, code, and written content, is the intellectual property
            of Informative Media. You may not reproduce, distribute,
            modify, or create derivative works from any part of this site
            without prior written permission.
          </p>
          <p className={styles.paragraph}>
            For details on our proprietary content and data methodology,
            see our <Link href="/content-policy" className={styles.inlineLink}>Content Policy</Link>.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Accuracy and Reliability</h2>
          <p className={styles.paragraph}>
            BeveragePulse aggregates data from publicly available sources
            including Reddit and Google Trends. While we make every effort
            to ensure accuracy, we do not guarantee that the data is
            complete, current, or error-free. Data sources may experience
            outages, rate limiting, or changes that affect the information
            displayed.
          </p>
          <p className={styles.paragraph}>
            You acknowledge that decisions made using BeveragePulse data
            are your own responsibility. Informative Media is not liable
            for any losses, damages, or outcomes resulting from the use
            of information on this site.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Availability</h2>
          <p className={styles.paragraph}>
            We strive to keep BeveragePulse available at all times, but we
            do not guarantee uninterrupted access. The site may be
            temporarily unavailable due to maintenance, updates, or
            circumstances beyond our control.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Limitation of Liability</h2>
          <p className={styles.paragraph}>
            To the fullest extent permitted by law, Informative Media and
            its affiliates shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages
            arising from your use of BeveragePulse, including but not
            limited to loss of profits, data, or business opportunities.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Changes to These Terms</h2>
          <p className={styles.paragraph}>
            We may update these Terms of Use at any time. Changes will be
            posted on this page with an updated revision date. Continued
            use of BeveragePulse after changes are posted constitutes
            acceptance of the revised terms.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Contact</h2>
          <p className={styles.paragraph}>
            If you have questions about these terms, contact us
            at <a href="mailto:derek@informativemedia.com" className={styles.inlineLink}>derek@informativemedia.com</a>.
          </p>
        </div>
      </div>

      <Footer />
    </main>
  );
}