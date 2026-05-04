// models/BeverageTrend.js
// MongoDB schema for beverage category trend data.
//
// Beverage categories track subcategory-level signals (e.g.
// "bourbon", "natural wine", "kombucha"). The categories list
// is on the roadmap but not yet built into the dashboard. The
// data is collected anyway so the categories list will have
// historical depth from day one when it ships.
//
// SIGNAL FIELDS:
//   Reddit            - score, mentions, subredditBreakdown
//   Google News       - newsVelocity, newsHistory (added 2026-04-28)
//   YouTube           - socialVelocity, youtubeHistory
//   Wikipedia         - wikipediaVelocity, wikipediaHistory (added 2026-05-04)
//   Legacy PowerWeb   - preserved (no longer written)
//   Legacy Google     - preserved (no longer written)

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

  // --- Google News fields (active) ---
  newsVelocity: {
    type: Number,
    default: null,
  },
  lastNewsUpdate: {
    type: Date,
    default: null,
  },
  newsHistory: {
    type: [
      {
        value: { type: Number, required: true },
        weekOf: { type: Date, required: true },
      },
    ],
    default: [],
  },

  // --- YouTube fields (active) ---
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

  // --- WikiTrend fields (active) ---
  wikipediaVelocity: {
    type: Number,
    default: null,
  },
  wikipediaPageviews: {
    type: Number,
    default: null,
  },
  lastWikipediaUpdate: {
    type: Date,
    default: null,
  },
  wikipediaHistory: {
    type: [
      {
        value: { type: Number, required: true },
        weekOf: { type: Date, required: true },
      },
    ],
    default: [],
  },

  // --- Legacy Google Trends fields (preserved) ---
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

  // --- Legacy PowerWeb fields (preserved) ---
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
});

beverageTrendSchema.index({ weekOf: -1, rank: 1 });

const BeverageTrend =
  mongoose.models.BeverageTrend || mongoose.model('BeverageTrend', beverageTrendSchema);

export default BeverageTrend;