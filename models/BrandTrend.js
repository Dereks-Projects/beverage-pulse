// models/BrandTrend.js
// MongoDB schema for brand trend data.
//
// Stores Reddit engagement, Google News coverage, YouTube Social
// Velocity, PowerWeb intelligence (legacy, no longer written but
// fields preserved), Wikipedia pageview velocity (WikiTrend), the
// AI intelligence layer, and rolling history arrays for trend
// direction tracking.
//
// HISTORY ARRAYS (one per signal):
//   scoreHistory      - Reddit upvote-weighted score over time
//   newsHistory       - Google News article count velocity over time
//   youtubeHistory    - YouTube Social Velocity over time
//   wikipediaHistory  - Wikipedia pageview velocity over time
//   powerWebHistory   - LEGACY: combined PowerWeb score (preserved)
//   editorialHistory  - LEGACY: editorial sub-signal (preserved)
//   retailHistory     - LEGACY: retail sub-signal (preserved)
//   googleHistory     - LEGACY: Google Trends search interest (preserved)
//
//   Each entry is { value, weekOf }. Arrays are trimmed to the
//   most recent 8 entries by their respective services. The AI
//   analysis layer reads these arrays to detect acceleration,
//   deceleration, and breakout patterns.
//
// AI INTELLIGENCE LAYER FIELDS (active):
//   Two separate cron runs write these, in order.
//
//   Ranking run (runs first, reasoning model):
//     aiRank         - the defensible weekly rank, replaces the old
//                      placeholder composite as the sort driver
//     previousAiRank - last run's aiRank, snapshotted before the new
//                      rank overwrites it, so the card can show
//                      movement (up, down, same, or NEW)
//     aiRationale    - the ranking agent's short reason for the rank.
//                      Fed to the analysis agent as an extra input.
//                      Stored for the member-only tier later. Not
//                      shown on the free card.
//     aiRankDate     - when the ranking run wrote the rank
//     aiRuleVersion  - which version of the ranking rule produced it
//
//   Analysis run (runs second, GPT-4o, temperature zero):
//     aiHeadline    - the hook sentence for the card
//     aiAnalysis    - the three-sentence analytical core
//     aiClosing     - the closing risk sentence
//     aiAnalysisDate- when the analysis run wrote the synopsis
//
//   All AI fields default to null. A brand that has not yet been
//   ranked or analyzed reads cleanly as "no data," so the dashboard
//   degrades gracefully instead of breaking on a missing value.
//
// SIGNAL CHANGE LOG:
//   2026-04-28: Replaced Google Trends with Google News RSS for
//               the consumer-search slot.
//   2026-05-04: Replaced PowerWeb (web scraping intelligence) with
//               WikiTrend (Wikipedia pageview velocity) as the
//               fourth signal. PowerWeb fields preserved for
//               possible future revival.
//   2026-05-21: Added the AI intelligence layer fields. The legacy
//               composite is condemned and will stop driving the
//               sort once the ranking service writes aiRank.
//   2026-06-03: Added previousAiRank so the ranking run can record
//               trend direction. Additive only.
//
// LEGACY FIELDS:
//   googleInterest, searchVelocity, googleHistory, lastGoogleUpdate,
//   powerWebScore, lastPowerWebUpdate, powerWebBreakdown,
//   powerWebHistory, editorialScore, lastEditorialUpdate,
//   editorialBreakdown, editorialHistory, retailScore,
//   lastRetailUpdate, retailBreakdown, retailHistory
//
//   These remain in the schema so historical records do not lose
//   data. Frontend reads the active fields. Future schema cleanup
//   can remove these once we are certain we will not return to
//   either approach.

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
  // Saturation flag (2026-06-11): true when both News windows sat at the feed
  // cap, so the stored velocity is a flat 0 we cannot refine rather than the
  // ceiling artifact. The UI and analysis can read this later; no display
  // logic lives here.
  newsSaturated: {
    type: Boolean,
    default: false,
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

  // --- AI intelligence layer fields (active) ---
  // Written by the ranking run (first):
  aiRank: {
    type: Number,
    default: null,
  },
  previousAiRank: {
    type: Number,
    default: null,
  },
  aiRationale: {
    type: String,
    default: null,
  },
  aiRankDate: {
    type: Date,
    default: null,
  },
  aiRuleVersion: {
    type: String,
    default: null,
  },
  // Written by the analysis run (second):
  aiHeadline: {
    type: String,
    default: null,
  },
  aiAnalysis: {
    type: String,
    default: null,
  },
  aiInsight: {
    type: String,
    default: null,
  },
  aiClosing: {
    type: String,
    default: null,
  },
  aiAnalysisDate: {
    type: Date,
    default: null,
  },

  // --- Legacy Google Trends fields (preserved, no longer written) ---
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

  // --- Legacy PowerWeb fields (preserved, no longer written) ---
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

  // --- Legacy Editorial sub-signal fields (preserved, no longer written) ---
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

  // --- Legacy Retail sub-signal fields (preserved, no longer written) ---
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

// Existing index supports the legacy rank sort and is left in place.
brandTrendSchema.index({ weekOf: -1, rank: 1 });

// New index supports the AI rank sort, which the dashboard will use
// once the ranking service writes aiRank. Keeps that query fast as
// the data set grows.
brandTrendSchema.index({ weekOf: -1, aiRank: 1 });

const BrandTrend =
  mongoose.models.BrandTrend || mongoose.model('BrandTrend', brandTrendSchema);

export default BrandTrend;