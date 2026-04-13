// app/api/refresh/route.js
// POST endpoint to manually trigger a full data refresh.
// Runs three data sources in sequence:
//   1. Reddit scrape (primary - buzz signal)
//   2. Google Trends (secondary - search signal)
//   3. YouTube (tertiary - culture signal)
// Each source is independent. If one fails, the others still save.
// Returns a summary of all three operations.

import { updateAllTrends } from '../../../lib/redditService.js';
import { updateGoogleTrends } from '../../../lib/googleTrends.js';
import { updateYoutubeTrends } from '../../../lib/youtubeService.js';

export async function POST() {
  try {
    console.log('Manual refresh triggered...');

    // Step 1: Reddit scrape (primary)
    const redditResult = await updateAllTrends();

    // Step 2: Google Trends (secondary, non-blocking)
    let googleResult = null;
    try {
      googleResult = await updateGoogleTrends();
    } catch (googleError) {
      console.error('Google Trends update failed:', googleError.message);
      googleResult = {
        successes: 0,
        failures: -1,
        failedTerms: [],
        error: googleError.message,
      };
    }

    // Step 3: YouTube (tertiary, non-blocking)
    let youtubeResult = null;
    try {
      youtubeResult = await updateYoutubeTrends();
    } catch (youtubeError) {
      console.error('YouTube update failed:', youtubeError.message);
      youtubeResult = {
        successes: 0,
        failures: -1,
        failedTerms: [],
        error: youtubeError.message,
      };
    }

    return Response.json({
      message: 'Refresh completed',
      reddit: {
        beverages: redditResult.beverages.length,
        brands: redditResult.brands.length,
      },
      google: googleResult,
      youtube: youtubeResult,
    });
  } catch (error) {
    console.error('Error during refresh:', error);
    return Response.json(
      { error: 'Failed to refresh trends' },
      { status: 500 }
    );
  }
}