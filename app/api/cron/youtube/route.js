// app/api/cron/youtube/route.js
// Daily cron endpoint for YouTube Social Velocity.
// Called automatically by Vercel Cron Jobs once per day (weekdays).
// Processes 10 terms per run, cycling through all tracked terms.
// Staggered 2 hours after Google Trends cron to spread API load.
//
// Security: Verifies the CRON_SECRET to prevent unauthorized access.

import { updateYoutubeTrendsBatch } from '../../../../lib/youtubeService.js';

export async function GET(request) {
  // Verify the request is from Vercel cron
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Daily YouTube Social Velocity cron triggered...');
    const result = await updateYoutubeTrendsBatch();

    return Response.json({
      message: 'YouTube Social Velocity batch completed',
      ...result,
    });
  } catch (error) {
    console.error('YouTube cron error:', error.message);
    return Response.json(
      { error: 'YouTube batch failed', details: error.message },
      { status: 500 }
    );
  }
}