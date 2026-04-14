// app/api/cron/powerweb/route.js
// Daily cron endpoint for PowerWeb retailer intelligence.
// Called automatically by Vercel Cron Jobs once per day (weekdays).
// Processes 10 retailers per run, cycling through all 20 over 2 days.
// Runs at 10 AM UTC (6 AM Eastern), staggered after Google and YouTube.
//
// Security: Verifies the CRON_SECRET to prevent unauthorized access.

import { updatePowerWebBatch } from '../../../../lib/powerWebService.js';

export async function GET(request) {
  // Verify the request is from Vercel cron
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Daily PowerWeb cron triggered...');
    const result = await updatePowerWebBatch();

    return Response.json({
      message: 'PowerWeb batch completed',
      ...result,
    });
  } catch (error) {
    console.error('PowerWeb cron error:', error.message);
    return Response.json(
      { error: 'PowerWeb batch failed', details: error.message },
      { status: 500 }
    );
  }
}