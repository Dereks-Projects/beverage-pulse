// models/BrandTrend.js
// MongoDB schema for brand trend data.
// Stores Reddit engagement, Google Search Velocity,
// YouTube Social Velocity, PowerWeb retailer intelligence,
// and rolling history arrays for trend direction tracking.
//
// HISTORY ARRAYS (one per signal):
//   scoreHistory      - Reddit upvote-weighted score over time
//   googleHistory     - Google Search Velocity over time
//   youtubeHistory    - YouTube Social Velocity over time
//   powerWebHistory   - PowerWeb retail positioning score over time
//
//   Each entry is { value, weekOf }. Arrays are trimmed to the
//   most recent 8 entries by their respective services. The AI
//   analysis layer reads these arrays to detect acceleration,
//   deceleration, and breakout patterns.

import mongoose from 'mongoose';

const brandTrendSchema = new mongoose.Schema({
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
  scoreHistory: {
    type: [
      {
        value: { type: Number, required: true },
        weekOf: { type: Date, required: true },
      },
    ],
    default: [],
  },

  // --- Google Trends fields ---
  googleInterest: {
    type: Number,
    default: null,
  },
  searchVelocity: {
    type: Number,
    default: null,
  },
  lastGoogleUpdate: {
    type: Date,
    default: null,
  },
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
  socialVelocity: {
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

  // --- PowerWeb fields ---
  powerWebScore: {
    type: Number,
    default: null,
  },
  lastPowerWebUpdate: {
    type: Date,
    default: null,
  },
  powerWebBreakdown: {
    type: Map,
    of: Number,
    default: {},
  },
  powerWebHistory: {
    type: [
      {
        value: { type: Number, required: true },
        weekOf: { type: Date, required: true },
      },
    ],
    default: [],
  },
});

brandTrendSchema.index({ weekOf: -1, rank: 1 });

const BrandTrend =
  mongoose.models.BrandTrend || mongoose.model('BrandTrend', brandTrendSchema);

export default BrandTrend;