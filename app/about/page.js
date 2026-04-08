// app/about/page.js
// Methodology and data source explanation page.
// Written for beverage directors and F&B leadership.
// No jargon, no academic language. Clear, direct, actionable.

import Link from 'next/link';
import Footer from '../../components/Footer';
import styles from './page.module.css';

export const metadata = {
  title: 'About the Data | BeveragePulse',
  description: 'How BeveragePulse collects, scores, and ranks beverage trend data.',
};

export default function AboutPage() {
  return (
    <main className={styles.main}>
      <div className={styles.content}>
        <Link href="/" className={styles.backLink}>
          ← Back to Dashboard
        </Link>

        <h1 className={styles.pageTitle}>About the Data</h1>
        <p className={styles.pageSubtitle}>
          BeveragePulse tracks what people are saying and searching about
          beverages and brands. Two independent data sources, updated weekly,
          designed to give beverage professionals a clear view of what is
          gaining traction and what is fading.
        </p>

        {/* ---- Data Sources ---- */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Data Sources</h2>

          <p className={styles.paragraph}>
            Every number in BeveragePulse comes from one of two sources.
            Neither source is proprietary or paywalled. Both reflect real
            consumer behavior, not surveys or industry forecasts.
          </p>

          <div className={styles.metricGrid}>
            <div className={styles.metricItem}>
              <p className={styles.metricName}>Reddit (Social Listening)</p>
              <p className={styles.metricExplanation}>
                We monitor 45+ beverage-related communities on Reddit, one of
                the largest public discussion platforms in the world. Every
                week, we scan thousands of posts across subreddits like
                r/cocktails, r/wine, r/bourbon, r/kombucha, r/bartenders,
                r/costco, and dozens more. We count how many times each
                tracked beverage or brand is mentioned and how popular those
                posts are (measured by upvotes). This tells you what industry
                professionals, enthusiasts, and consumers are actively
                discussing.
              </p>
            </div>

            <div className={styles.metricItem}>
              <p className={styles.metricName}>Google Trends (Search Behavior)</p>
              <p className={styles.metricExplanation}>
                We pull search interest data from Google Trends for every
                tracked term. This measures how often real people type a
                beverage or brand name into Google. The scale runs from 0 to
                100, where 100 represents the highest search volume recorded
                for that term in the past week. This tells you what mainstream
                consumers are curious about, researching, or looking to buy.
              </p>
            </div>
          </div>
        </div>

        {/* ---- Metrics Explained ---- */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>What the Numbers Mean</h2>

          <div className={styles.metricGrid}>
            <div className={styles.metricItem}>
              <p className={styles.metricName}>Reddit Score</p>
              <p className={styles.metricFormula}>
                Mentions x Post Popularity (Upvotes)
              </p>
              <p className={styles.metricExplanation}>
                Not a simple mention count. Each mention is weighted by how
                popular the post was. A mention in a post with 500 upvotes
                counts significantly more than a mention in a post with 2
                upvotes. This filters noise and surfaces terms that are
                generating real engagement, not just appearing in passing.
              </p>
            </div>

            <div className={styles.metricItem}>
              <p className={styles.metricName}>Google Interest</p>
              <p className={styles.metricFormula}>
                0 to 100 scale (relative search volume)
              </p>
              <p className={styles.metricExplanation}>
                Google normalizes search data to a 0-100 scale relative to the
                highest point in the selected time period. A score of 100 means
                peak search popularity. A score of 50 means the term was
                searched half as often as the peak. This is not an absolute
                count of searches. It is a relative measure that lets you
                compare terms against each other and track whether interest is
                rising or falling.
              </p>
            </div>

            <div className={styles.metricItem}>
              <p className={styles.metricName}>Mentions</p>
              <p className={styles.metricFormula}>
                Raw count across all tracked subreddits
              </p>
              <p className={styles.metricExplanation}>
                The unweighted number of times a term appeared in post titles
                and text across all tracked subreddits in the past week. This
                tells you pure volume. A term with high mentions but a low
                score is being talked about frequently in low-engagement posts.
                A term with low mentions but a high score appeared in a small
                number of highly popular conversations.
              </p>
            </div>

            <div className={styles.metricItem}>
              <p className={styles.metricName}>Rank</p>
              <p className={styles.metricFormula}>
                Position within current view and sort
              </p>
              <p className={styles.metricExplanation}>
                Rank is calculated dynamically based on your selected filters
                and sort order. If you are viewing Alcoholic beverages sorted
                by Score, rank 1 is the highest-scoring alcoholic beverage.
                Switch to Non-Alc or change the sort to Mentions and the
                ranks recalculate. This means rank always reflects exactly
                what you are looking at, not a fixed global position.
              </p>
            </div>
          </div>
        </div>

        {/* ---- Divergence Signals ---- */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Divergence Signals</h2>

          <p className={styles.paragraph}>
            The most actionable insight in BeveragePulse is when the two data
            sources disagree. We normalize the Reddit score to a 0-100 scale
            and compare it to the Google interest score. When the gap exceeds
            15 points, we flag it.
          </p>

          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <span className={`${styles.signalDot} ${styles.signalGreen}`} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Search &gt; Buzz: </span>
                Google search interest is significantly higher than Reddit
                discussion. Consumers are searching for this more than the
                industry is talking about it. This often signals mainstream
                demand that has not yet been fully recognized by operators.
                Consider this a potential buying or menu opportunity.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot} ${styles.signalAmber}`} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Buzz &gt; Search: </span>
                Reddit engagement is significantly higher than Google search
                interest. Industry professionals and enthusiasts are excited,
                but mainstream consumers are not searching yet. This is either
                a leading indicator (the trend will reach consumers soon) or
                an insider-only trend that may not cross over. Watch list.
              </div>
            </div>
          </div>
        </div>

        {/* ---- Data Freshness ---- */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Data Freshness</h2>

          <p className={styles.paragraph}>
            Both data sources are updated weekly. The freshness indicators in
            the header show how old the current data is. The color coding is
            simple:
          </p>

          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <span className={`${styles.signalDot} ${styles.signalGreen}`} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Green: </span>
                Data is 7 days old or less. Current.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot} ${styles.signalAmber}`} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Yellow: </span>
                Data is 8 to 14 days old. Still usable, but a refresh is due.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot} ${styles.signalRed}`} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Red: </span>
                Data is 15 or more days old. Stale. Do not make decisions
                based on this data without refreshing first.
              </div>
            </div>
          </div>
        </div>

        {/* ---- Categories ---- */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Category Taxonomy</h2>

          <p className={styles.paragraph}>
            Every tracked beverage and brand is classified into a category and
            a parent group. The parent groups are Alcoholic and Non-Alcoholic.
            The categories are:
          </p>

          <div className={styles.signalGrid}>
            <div className={styles.signalItem}>
              <span className={`${styles.signalDot}`} style={{ background: '#B45309' }} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Spirits: </span>
                Vodka, gin, rum, tequila, mezcal, whiskey, scotch, rye,
                cognac, brandy, and cocktails.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot}`} style={{ background: '#9F1239' }} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Wine: </span>
                Red, white, rose, sparkling, champagne, varietal wines, sake,
                and wine coolers.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot}`} style={{ background: '#D97706' }} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Beer: </span>
                Lager, ale, cider, hard cider, and all beer styles.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot}`} style={{ background: '#0D9488' }} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>RTD: </span>
                Ready-to-drink products including hard seltzers, canned
                cocktails, and hard teas.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot}`} style={{ background: '#78716C' }} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Coffee and Tea: </span>
                All coffee and tea varieties and products.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot}`} style={{ background: '#059669' }} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>Non-Alc: </span>
                Non-alcoholic spirits, mocktails, kombucha, cola, energy
                drinks, and functional beverages.
              </div>
            </div>

            <div className={styles.signalItem}>
              <span className={`${styles.signalDot}`} style={{ background: '#7C3AED' }} />
              <div className={styles.signalText}>
                <span className={styles.signalLabel}>THC: </span>
                THC-infused beverages (tracking coming soon).
              </div>
            </div>
          </div>
        </div>

        {/* ---- Coverage ---- */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Coverage and Limitations</h2>

          <p className={styles.paragraph}>
            BeveragePulse currently tracks approximately 45 beverage category
            terms and 90 brand names across 43 active subreddits. Google
            Trends data is collected for the top 20 beverages and top 20
            brands each week.
          </p>

          <p className={styles.paragraph}>
            Reddit data skews toward English-speaking, digitally engaged
            consumers and industry professionals. It over-represents craft,
            premium, and enthusiast categories relative to the general market.
            Google Trends data reflects broader US consumer behavior but does
            not distinguish between professional and casual interest.
          </p>

          <p className={styles.paragraph}>
            Neither source captures point-of-sale data, distributor volume,
            or pricing. BeveragePulse measures attention and interest, not
            transactions. It is designed to be a leading indicator, showing
            where consumer and industry attention is shifting before those
            shifts appear in sales reports.
          </p>
        </div>
      </div>

      <Footer />
    </main>
  );
}