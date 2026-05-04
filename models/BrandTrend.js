// models/BrandTrend.js
// MongoDB schema for brand trend data.
//
// Stores Reddit engagement, Google News coverage, YouTube Social
// Velocity, PowerWeb intelligence (split into editorial and retail
// sub-signals), and rolling history arrays for trend direction
// tracking.
//
// HISTORY ARRAYS (one per signal):
//   scoreHistory      - Reddit upvote-weighted score over time
//   googleHistory     - LEGACY: Google Trends search interest
//                       (preserved for one cycle, no longer written)
//   newsHistory       - Google News article count velocity over time
//   youtubeHistory    - YouTube Social Velocity over time
//   powerWebHistory   - Combined PowerWeb score (display value)
//   editorialHistory  - Editorial Pulse sub-signal over time
//   retailHistory     - Retail Position sub-signal over time
//
//   Each entry is { value, weekOf }. Arrays are trimmed to the
//   most recent 8 entries by their respective services. The AI
//   analysis layer reads these arrays to detect acceleration,
//   deceleration, and breakout patterns.
//
// GOOGLE SIGNAL CHANGE (2026-04-28):
//   The Google slot was previously fed by the unofficial Google
//   Trends API, which fails approximately 80% of the time from
//   Vercel's datacenter IP ranges. The signal has been replaced
//   with Google News RSS, which is free, public, and reliable.
//
//   New fields: newsVelocity, newsHistory, lastNewsUpdate.
//   Legacy fields (searchVelocity, googleInterest, googleHistory,
//   lastGoogleUpdate) remain in the schema so existing records do
//   not lose data. They are no longer written to.
//
// POWERWEB DESIGN (2026-04-28 rebuild):
//   PowerWeb is split internally into two sub-signals:
//     - Editorial Pulse: trade publication archive coverage
//     - Retail Position: retailer category page placement
//
//   Both are stored separately so the AI can read each on its
//   own and write specific predictive analysis (e.g. "editorial
//   coverage is rising while retail hasn't caught up yet").
//
//   The combined powerWebScore (60% editorial + 40% retail) is
//   what displays on the dashboard card. One number for the
//   user, two numbers for the AI.

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

  // --- Legacy Google Trends fields (preserved, no longer written) ---
  // Kept in the schema so historical records do not lose their
  // last successful Google Trends pull. Frontend now reads
  // newsVelocity instead. These fields can be removed in a future
  // schema cleanup once we are confident in the news pipeline.
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

  // --- PowerWeb combined display fields ---
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

  // --- Editorial Pulse sub-signal (trade publication archives) ---
  editorialScore: {
    type: Number,
    default: null,
  },
  lastEditorialUpdate: {
    type: Date,
    default: null,
  },
  editorialBreakdown: {
    type: Map,
    of: Number,
    default: {},
  },
  editorialHistory: {
    type: [
      {
        value: { type: Number, required: true },
        weekOf: { type: Date, required: true },
      },
    ],
    default: [],
  },

  // --- Retail Position sub-signal (retailer category pages) ---
  retailScore: {
    type: Number,
    default: null,
  },
  lastRetailUpdate: {
    type: Date,
    default: null,
  },
  retailBreakdown: {
    type: Map,
    of: Number,
    default: {},
  },
  retailHistory: {
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