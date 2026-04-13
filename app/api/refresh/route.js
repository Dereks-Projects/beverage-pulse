// app/api/refresh/route.js
// POST endpoint to manually trigger a Reddit data refresh.
// Reddit is the primary data source and the scout: it identifies
// which terms are generating real conversation. The top terms
// from Reddit become the active tracking list for Google and YouTube.
//
// Google Search Velocity and YouTube Social Velocity are handled
// by automated daily cron jobs (see /api/cron/google-trends and
// /api/cron/youtube). They run in staggered batches of 10 terms
// per day to stay within API quotas.
//
// Pipeline:
//   1. Reddit scrape (this route, manual trigger)
//   2. Google Search Velocity (daily cron, 10 terms/day)
//   3. YouTube Social Velocity (daily cron, 10 terms/day)

import { updateAllTrends } from '../../../lib/redditService.js';

export async function POST() {
  try {
    console.log('Manual refresh triggered: Reddit scrape...');

    const redditResult = await updateAllTrends();

    return Response.json({
      message: 'Reddit refresh completed. Google and YouTube velocity data updates via daily cron.',
      reddit: {
        beverages: redditResult.beverages.length,
        brands: redditResult.brands.length,
      },
    });
  } catch (error) {
    console.error('Error during refresh:', error);
    return Response.json(
      { error: 'Failed to refresh trends' },
      { status: 500 }
    );
  }
}