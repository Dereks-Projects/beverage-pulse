// models/BeverageTrend.js
// MongoDB schema for beverage trend data.
// Stores Reddit engagement, Google Trends search velocity,
// YouTube culture signal, and rolling history arrays for
// trend direction tracking.

import mongoose from 'mongoose';

const beverageTrendSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  mentions: {
    type: Number,
    required: true,
    default: 0,
  },
  score: {
    type: Number,
    required: true,
    default: 0,
  },
  rank: {
    type: Number,
    required: true,
  },
  change: {
    type: String,
    enum: ['up', 'down', 'same', 'new'],
    default: 'new',
  },
  previousRank: {
    type: Number,
    default: null,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  weekOf: {
    type: Date,
    required: true,
  },
  subredditBreakdown: {
    type: Map,
    of: Number,
    default: {},
  },

  // --- Google Trends fields ---
  // Current snapshot value (most recent week, 0-100 relative scale)
  googleInterest: {
    type: Number,
    default: null,
  },
  // Search Velocity: percentage change in search interest.
  // Compares last 30 days to prior 60 days.
  // Positive = accelerating, negative = decelerating.
  // Example: +37 means searches are up 37% vs. baseline.
  searchVelocity: {
    type: Number,
    default: null,
  },
  lastGoogleUpdate: {
    type: Date,
    default: null,
  },
  // Rolling history of weekly Google interest values from 90-day fetch.
  // Populated directly from the API response, not built manually.
  googleHistory: {
    type: [
      {
        value: { type: Number, required: true },
        weekOf: { type: Date, required: true },
      },
    ],
    default: [],
  },

  // --- YouTube fields ---
  youtubeScore: {
    type: Number,
    default: null,
  },
  lastYoutubeUpdate: {
    type: Date,
    default: null,
  },
  youtubeHistory: {
    type: [
      {
        value: { type: Number, required: true },
        weekOf: { type: Date, required: true },
      },
    ],
    default: [],
  },
});

beverageTrendSchema.index({ weekOf: -1, rank: 1 });

const BeverageTrend =
  mongoose.models.BeverageTrend || mongoose.model('BeverageTrend', beverageTrendSchema);

export default BeverageTrend;