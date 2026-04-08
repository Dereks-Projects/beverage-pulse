// models/BeverageTrend.js
// MongoDB schema for beverage trend data.
// Stores Reddit engagement, Google Trends search interest,
// and a rolling history of Google values for trend direction.

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
  googleInterest: {
    type: Number,
    default: null,
  },
  lastGoogleUpdate: {
    type: Date,
    default: null,
  },
  // Rolling history of weekly Google interest values.
  // Most recent value is last in the array. Capped at 8 entries.
  // Each entry: { value: Number, weekOf: Date }
  googleHistory: {
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