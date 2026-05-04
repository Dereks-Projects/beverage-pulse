// app/api/cron/wikipedia/route.js
// ==========================================================================
// Weekly cron endpoint for WikiTrend (Wikipedia pageview velocity).
//
// Called automatically by Vercel Cron every Monday at 8 AM UTC.
// Runs the full Wikipedia collection across all brands and beverage
// categories in a single execution. Wikipedia's API has no
// rate-limit concerns at our volume, so the entire taxonomy
// (~227 entries) finishes in well under a minute.
//
// Security: Verifies CRON_SECRET to prevent unauthorized access.
// Only Vercel's cron infrastructure or the project owner with the
// secret should call this endpoint.
// ==========================================================================

import { updateWikipediaTrends } from '../../../../lib/wikipediaService.js';

// Generous timeout. The actual run is <60s but we leave headroom
// for slow Wikipedia responses on individual articles.
export const maxDuration = 300;

export async function GET(request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Weekly Wikipedia (WikiTrend) cron triggered...');
    const result = await updateWikipediaTrends();

    return Response.json({
      message: 'Wikipedia velocity collection completed',
      ...result,
    });
  } catch (error) {
    console.error('Wikipedia cron error:', error.message);
    return Response.json(
      { error: 'Wikipedia collection failed', details: error.message },
      { status: 500 }
    );
  }
}