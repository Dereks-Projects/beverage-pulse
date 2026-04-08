// app/api/beverage-trends/route.js
// GET endpoint that returns the top 20 beverage trends from MongoDB.
// Replaces the Express endpoint: app.get('/api/beverage-trends')

import connectToDatabase from '../../../lib/db';
import BeverageTrend from '../../../models/BeverageTrend';

export async function GET() {
  try {
    await connectToDatabase();

    const trends = await BeverageTrend.find()
      .sort({ weekOf: -1, rank: 1 })
      .limit(20);

    return Response.json(trends);
  } catch (error) {
    console.error('Error fetching beverage trends:', error);
    return Response.json(
      { error: 'Failed to fetch beverage trends' },
      { status: 500 }
    );
  }
}