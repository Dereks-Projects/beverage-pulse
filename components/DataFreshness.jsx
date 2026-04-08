// components/DataFreshness.jsx
// Displays the age of each data source (Reddit, Google) with
// color-coded indicators.
//
// Green:  data is 7 days old or less (fresh)
// Yellow: data is 8-14 days old (aging)
// Red:    data is 15+ days old (stale)
// Gray:   no data available
//
// Props:
//   redditDate  - ISO string of the most recent Reddit data date
//   googleDate  - ISO string of the most recent Google Trends date, or null

import styles from './DataFreshness.module.css';

/**
 * Calculate data age and return status info.
 */
function getAgeStatus(dateString) {
  if (!dateString) {
    return {
      label: 'No data',
      dotClass: styles.dotNone,
      ageClass: styles.ageNone,
    };
  }

  const now = new Date();
  const dataDate = new Date(dateString);
  const diffMs = now - dataDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let label;
  if (diffDays === 0) {
    label = 'Today';
  } else if (diffDays === 1) {
    label = '1 day ago';
  } else {
    label = `${diffDays}d ago`;
  }

  if (diffDays <= 7) {
    return {
      label,
      dotClass: styles.dotFresh,
      ageClass: styles.ageFresh,
    };
  }

  if (diffDays <= 14) {
    return {
      label,
      dotClass: styles.dotAging,
      ageClass: styles.ageAging,
    };
  }

  return {
    label,
    dotClass: styles.dotStale,
    ageClass: styles.ageStale,
  };
}

export default function DataFreshness({ redditDate, googleDate }) {
  const reddit = getAgeStatus(redditDate);
  const google = getAgeStatus(googleDate);

  return (
    <div className={styles.freshness}>
      {/* Reddit source */}
      <div className={styles.source}>
        <span className={`${styles.dot} ${reddit.dotClass}`} />
        <span className={styles.sourceLabel}>Reddit</span>
        <span className={`${styles.sourceAge} ${reddit.ageClass}`}>
          {reddit.label}
        </span>
      </div>

      {/* Google source */}
      <div className={styles.source}>
        <span className={`${styles.dot} ${google.dotClass}`} />
        <span className={styles.sourceLabel}>Google</span>
        <span className={`${styles.sourceAge} ${google.ageClass}`}>
          {google.label}
        </span>
      </div>
    </div>
  );
}