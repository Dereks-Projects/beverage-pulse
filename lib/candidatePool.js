// lib/candidatePool.js
// ==========================================================================
// Candidate shortlist builder for the AI ranking layer.
//
// WHY THIS FILE EXISTS:
//   The brand universe is 469 today and will only grow. The reasoning
//   model that ranks brands must never see the whole universe, because
//   that would cost more and run slower every time the list grows, and
//   most of the universe is dormant in any given week anyway.
//
//   This file is the cheap, deterministic gate that runs first. Plain
//   code, no AI. It gives every brand a "liveness" score from the four
//   stored signals, then hands back a bounded shortlist of the liveliest
//   brands. The reasoning model only ever ranks that shortlist, so its
//   workload stays roughly constant no matter how large the universe
//   becomes.
//
// IMPORTANT, READ THIS:
//   Liveness is NOT a ranking. It only answers one question: is
//   something happening with this brand this week, yes or no, and how
//   much. A brand can score high on liveness and still be ranked low by
//   the AI rule. For example, a brand spiking hard on a single signal
//   scores high here (something is clearly happening) but the ranking
//   rule deliberately holds single spikes back. That separation is
//   intended. This gate decides who is in the room. The AI decides who
//   sits where.
//
// HOW LIVENESS IS SCORED (three simple signs of life):
//   1. Presence: how many of the three momentum signals (News, Social,
//      WikiTrend) actually have data this week. More present signals
//      means more of a real picture.
//   2. Buzz floor: is there real community conversation above a small
//      floor, so we know it is an actual conversation and not a
//      measurement ghost.
//   3. Movement: how much the present momentum signals are moving, up
//      or down. Each signal's movement is capped so one extreme reading
//      cannot dominate the gate.
//
// CATEGORY PROTECTION:
//   We first guarantee each category a minimum number of seats (its own
//   liveliest brands), then fill the rest of the pool by liveness across
//   everyone. This keeps small categories like THC from being squeezed
//   out as larger categories grow, so every category can always fill its
//   own Top 5 later.
//
// TUNING:
//   The constants below are a starting point. The right floors and
//   weights reveal themselves once we see a week of real scores, so
//   they are all named and gathered here for easy adjustment. Changing
//   them changes only who is in the pool, never how the AI ranks.
// ==========================================================================

import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getBrandCategory, CATEGORIES } from './taxonomy.js';

// --------------------------------------------------------------------------
// Tunable configuration
// --------------------------------------------------------------------------

// Maximum brands handed to the reasoning model. Holds steady as the
// universe grows. The pool will be the smaller of this number and the
// total number of brands that exist.
const POOL_SIZE = 150;

// Minimum seats guaranteed to each category, so none goes empty.
const MIN_PER_CATEGORY = 8;

// Community conversation must clear this floor to earn buzz points.
// Below it, we treat the buzz as noise rather than a real conversation.
const MIN_BUZZ_FLOOR = 5;

// Each momentum signal's movement is capped at this absolute value for
// scoring, so a single extreme reading (for example +237%) cannot
// dominate the gate. The brand still gets in; it just does not crowd
// out everyone else on the strength of one number.
const VELOCITY_CAP = 100;

// Point values for each sign of life. Plain and transparent on purpose.
const PRESENCE_POINTS = 10;   // per present momentum signal (max 30)
const BUZZ_POINTS = 15;       // flat, if buzz clears the floor
const MOVEMENT_FACTOR = 0.2;  // capped movement total is scaled by this

// --------------------------------------------------------------------------
// Score one brand record for liveness.
// Reads only stored signal fields. Returns a single number.
// --------------------------------------------------------------------------
function scoreLiveness(record) {
  // The three momentum signals. Any may be null (missing data).
  const momentum = [
    record.newsVelocity,
    record.socialVelocity,
    record.wikipediaVelocity,
  ];

  // Presence: count the momentum signals that actually have a value.
  const presentSignals = momentum.filter(
    (v) => v !== null && v !== undefined
  );
  const presencePoints = presentSignals.length * PRESENCE_POINTS;

  // Buzz floor: Reddit score is the community conversation level. It is
  // always a number on the record (defaults to 0), so we test the floor.
  const buzz = typeof record.score === 'number' ? record.score : 0;
  const buzzPoints = buzz >= MIN_BUZZ_FLOOR ? BUZZ_POINTS : 0;

  // Movement: sum of each present signal's movement, capped per signal.
  const cappedMovement = presentSignals.reduce((total, v) => {
    return total + Math.min(Math.abs(v), VELOCITY_CAP);
  }, 0);
  const movementPoints = cappedMovement * MOVEMENT_FACTOR;

  return presencePoints + buzzPoints + movementPoints;
}

// --------------------------------------------------------------------------
// Build the candidate shortlist.
//
// Returns { pool, summary }:
//   pool    - array of brand records (lean objects), the shortlist the
//             reasoning model will rank. Includes all signal fields and
//             history arrays.
//   summary - counts and per-category breakdown, for auditing the gate.
// --------------------------------------------------------------------------
export async function buildCandidatePool() {
  await connectToDatabase();

  // Load every brand. Lean objects are plain data, which is all we need
  // for scoring and for handing to the reasoning model.
  const allBrands = await BrandTrend.find().lean();

  // Score each brand and attach its category id.
  const scored = allBrands.map((record) => {
    const category = getBrandCategory(record.name);
    return {
      record,
      liveness: scoreLiveness(record),
      categoryId: category ? category.id : null,
    };
  });

  // Eligibility gate: a brand must show at least one real sign of life to
  // be ranked at all. Liveness is zero only when a brand has no buzz above
  // the floor and no momentum signals present, which describes a freshly
  // seeded slot with no data yet. Those are excluded entirely, so we never
  // pay the model to rank empty placeholders. They qualify on their own
  // once the collectors fill them.
  const eligible = scored.filter((item) => item.liveness > 0);

  // Group the eligible brands by category, each group sorted liveliest
  // first. Brands with no known category go in their own bucket and are
  // eligible for the general fill but not for category guarantees.
  const byCategory = {};
  for (const item of eligible) {
    const key = item.categoryId || 'uncategorized';
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(item);
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key].sort((a, b) => b.liveness - a.liveness);
  }

  // Track which brands are already selected, by name, to avoid
  // double-counting between the guarantee pass and the fill pass.
  const selectedNames = new Set();
  const selected = [];

  // Pass 1, category guarantee: take the top MIN_PER_CATEGORY from each
  // known category (or fewer if the category has fewer brands).
  for (const categoryId of Object.keys(CATEGORIES)) {
    const group = byCategory[categoryId] || [];
    const take = group.slice(0, MIN_PER_CATEGORY);
    for (const item of take) {
      if (!selectedNames.has(item.record.name)) {
        selectedNames.add(item.record.name);
        selected.push(item);
      }
    }
  }

  // Pass 2, general fill: from the eligible brands sorted by liveness, add
  // those not already selected until the pool reaches POOL_SIZE.
  const allSorted = [...eligible].sort((a, b) => b.liveness - a.liveness);
  for (const item of allSorted) {
    if (selected.length >= POOL_SIZE) break;
    if (!selectedNames.has(item.record.name)) {
      selectedNames.add(item.record.name);
      selected.push(item);
    }
  }

  // Final pool, sorted liveliest first for readability.
  selected.sort((a, b) => b.liveness - a.liveness);

  // Build a per-category count for the audit summary.
  const categoryCounts = {};
  for (const item of selected) {
    const key = item.categoryId || 'uncategorized';
    categoryCounts[key] = (categoryCounts[key] || 0) + 1;
  }

  const summary = {
    universeSize: allBrands.length,
    eligibleCount: eligible.length,
    poolSize: selected.length,
    poolCap: POOL_SIZE,
    minPerCategory: MIN_PER_CATEGORY,
    categoryCounts,
    timestamp: new Date().toISOString(),
  };

  const pool = selected.map((item) => item.record);

  return { pool, summary, scored: selected };
}