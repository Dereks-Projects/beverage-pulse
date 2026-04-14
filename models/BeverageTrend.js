// models/BeverageTrend.js
// MongoDB schema for beverage trend data.
// Stores Reddit engagement, Google Search Velocity,
// YouTube Social Velocity, PowerWeb retailer intelligence,
// and rolling history arrays for trend direction tracking.

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
  // Retailer homepage intelligence score (0-100).
  // Measures how prominently this term appears across
  // major beverage retailer websites.
  powerWebScore: {
    type: Number,
    default: null,
  },
  lastPowerWebUpdate: {
    type: Date,
    default: null,
  },
  // Per-retailer breakdown: { "totalwine": 85, "bevmo": 72 }
  powerWebBreakdown: {
    type: Map,
    of: Number,
    default: {},
  },
});

beverageTrendSchema.index({ weekOf: -1, rank: 1 });

const BeverageTrend =
  mongoose.models.BeverageTrend || mongoose.model('BeverageTrend', beverageTrendSchema);

export default BeverageTrend;