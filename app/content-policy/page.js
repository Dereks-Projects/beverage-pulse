// app/content-policy/page.js
// Content Policy for BeveragePulse.

import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from '../legal.module.css';

export const metadata = {
  title: 'Content Policy',
  description: 'BeveragePulse content policy. How our data is collected, processed, and protected.',
};

export default function ContentPolicyPage() {
  return (
    <main className={styles.main}>
      <Header />

      <div className={styles.content}>
        <Link href="/" className={styles.backLink}>← Back to Dashboard</Link>

        <h1 className={styles.pageTitle}>Content Policy</h1>
        <p className={styles.lastUpdated}>Last updated: April 2026</p>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Proprietary Intelligence</h2>
          <p className={styles.paragraph}>
            BeveragePulse is a proprietary beverage intelligence platform
            built and operated by Informative Media. The scoring models,
            ranking algorithms, divergence detection methods, data
            processing pipelines, and composite intelligence methodology
            are proprietary intellectual property of Informative Media.
            These systems may not be reproduced, reverse-engineered, or
            replicated without prior written permission.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Data Sources and Collection Methods</h2>
          <p className={styles.paragraph}>
            All data collected by BeveragePulse comes from publicly
            available sources on the internet. Our current data sources
            include Reddit (public post data accessed through the official
            Reddit API) and Google Trends (publicly available search
            interest data). No private, restricted, gated, or paywalled
            data is accessed or collected.
          </p>
          <p className={styles.paragraph}>
            BeveragePulse does not scrape, crawl, or access any data
            through unauthorized methods. All data collection is performed
            through official APIs and publicly available tools in full
            compliance with the terms of service of each data provider.
            No personal data about individual users of any platform is
            collected, stored, or displayed.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Use of Artificial Intelligence</h2>
          <p className={styles.paragraph}>
            BeveragePulse uses artificial intelligence as part of its
            development process and may incorporate AI-powered analysis
            in current and future features. AI is used to assist in data
            processing, trend analysis, sentiment classification, and
            content generation. The specific AI models, prompts, and
            integration methods used are proprietary to Informative Media.
          </p>
          <p className={styles.paragraph}>
            AI-generated analysis within BeveragePulse is always based on
            factual, publicly available data. We do not use AI to
            fabricate data, manipulate scores, or generate misleading
            information. AI is a tool in our intelligence pipeline, not
            a replacement for data integrity.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Proprietary Algorithm</h2>
          <p className={styles.paragraph}>
            The BeveragePulse scoring algorithm combines multiple data
            signals into weighted scores, rankings, and divergence
            indicators. The specific formulas, weights, normalization
            methods, and signal combinations are proprietary to
            Informative Media. While we explain the general methodology
            on our <Link href="/about" className={styles.inlineLink}>About</Link> page
            for transparency, the full implementation details are
            confidential and protected as trade secrets.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Content Ownership</h2>
          <p className={styles.paragraph}>
            All original content on BeveragePulse, including written
            explanations, data visualizations, page designs, and brand
            identity, is owned by Informative Media. Data sourced from
            Reddit and Google Trends is attributed to those platforms
            and used in accordance with their respective terms of service.
          </p>
          <p className={styles.paragraph}>
            You may reference BeveragePulse data in professional
            presentations, reports, or discussions with appropriate
            attribution to BeveragePulse by Informative Media. You may
            not republish, redistribute, or resell BeveragePulse data
            or content without prior written permission.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Ethical Data Practices</h2>
          <p className={styles.paragraph}>
            Informative Media is committed to ethical data collection and
            analysis. We do not engage in unauthorized scraping, data
            harvesting, or any collection method that violates the terms
            of service of any platform. We do not collect personal
            information about individuals. We do not manipulate or
            misrepresent data to produce desired outcomes.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Changes to This Policy</h2>
          <p className={styles.paragraph}>
            As BeveragePulse evolves and new data sources or AI
            capabilities are introduced, this content policy will be
            updated to reflect those changes. Updates will be posted
            on this page with a revised date.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Contact</h2>
          <p className={styles.paragraph}>
            If you have questions about our content practices or
            intellectual property, contact us
            at <a href="mailto:derek@informativemedia.com" className={styles.inlineLink}>derek@informativemedia.com</a>.
          </p>
        </div>
      </div>

      <Footer />
    </main>
  );
}