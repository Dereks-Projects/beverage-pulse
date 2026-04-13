// app/api/cron/google-trends/route.js
// Daily cron endpoint for Google Trends Search Velocity.
// Called automatically by Vercel Cron Jobs once per day (weekdays).
// Processes 10 terms per run, cycling through all tracked terms
// over the course of 4 days (scales automatically as terms grow).
//
// Security: Verifies the CRON_SECRET to prevent unauthorized access.
// Only Vercel's cron infrastructure should call this endpoint.

import { updateGoogleTrendsBatch } from '../../../../lib/googleTrends.js';

export async function GET(request) {
  // Verify the request is from Vercel cron
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Daily Google Trends cron triggered...');
    const result = await updateGoogleTrendsBatch();

    return Response.json({
      message: 'Google Trends batch completed',
      ...result,
    });
  } catch (error) {
    console.error('Google Trends cron error:', error.message);
    return Response.json(
      { error: 'Google Trends batch failed', details: error.message },
      { status: 500 }
    );
  }
}