// app/api/cron/reddit/route.js
// Weekly cron endpoint for Reddit Buzz data collection.
// Called automatically by Vercel Cron Jobs once per week (Monday).
// Scrapes 49 subreddits for mentions of all tracked beverages and
// brands, scores by mention count weighted by post upvotes.
//
// Reddit runs weekly, not daily, because:
//   - It scrapes "hot" and "top this week" posts
//   - Running daily would produce near-identical results
//   - Weekly cadence matches the "Week of" display on the dashboard
//
// Security: Verifies the CRON_SECRET to prevent unauthorized access.

import { updateAllTrends } from '../../../../lib/redditService.js';

export const maxDuration = 300;

export async function GET(request) {
  // Verify the request is from Vercel cron
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Weekly Reddit cron triggered...');
    const result = await updateAllTrends();

    return Response.json({
      message: 'Reddit scrape completed',
      beverages: result.beverages.length,
      brands: result.brands.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Reddit cron error:', error.message);
    return Response.json(
      { error: 'Reddit scrape failed', details: error.message },
      { status: 500 }
    );
  }
}