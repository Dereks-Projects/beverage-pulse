// app/api/brand-trends/route.js
// GET endpoint that returns the top 20 brand trends from MongoDB.
// Replaces the Express endpoint: app.get('/api/brand-trends')

import connectToDatabase from '../../../lib/db';
import BrandTrend from '../../../models/BrandTrend';

export async function GET() {
  try {
    await connectToDatabase();

    const trends = await BrandTrend.find()
      .sort({ weekOf: -1, rank: 1 })
      .limit(20);

    return Response.json(trends);
  } catch (error) {
    console.error('Error fetching brand trends:', error);
    return Response.json(
      { error: 'Failed to fetch brand trends' },
      { status: 500 }
    );
  }
}