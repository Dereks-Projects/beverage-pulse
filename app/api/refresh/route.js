// app/api/refresh/route.js
// POST endpoint to manually trigger a full data refresh.
// Runs Reddit scrape first (primary data source), then
// Google Trends (secondary). If Google fails, Reddit data
// is still saved. Returns a summary of both operations.

import { updateAllTrends } from '../../../lib/redditService.js';
import { updateGoogleTrends } from '../../../lib/googleTrends.js';

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

    return Response.json({
      message: 'Refresh completed',
      reddit: {
        beverages: redditResult.beverages.length,
        brands: redditResult.brands.length,
      },
      google: googleResult,
    });
  } catch (error) {
    console.error('Error during refresh:', error);
    return Response.json(
      { error: 'Failed to refresh trends' },
      { status: 500 }
    );
  }
}