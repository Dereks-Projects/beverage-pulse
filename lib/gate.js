// lib/gate.js
// ==========================================================================
// The Gate: which brands are worth spending the rate-limited signals on.
//
// THE CORRECTED PIPELINE:
//   1. Reddit and Wikipedia sweep every brand cheaply (their crons do this).
//   2. THE GATE (this file): from those two full-coverage signals, decide
//      which brands clear the floor and survive.
//   3. News and YouTube collect ONLY the survivors (wired in later steps).
//   4. The AI ranks the survivors on all four signals.
//
// WHY ONLY REDDIT AND WIKIPEDIA:
//   The gate runs BEFORE News and YouTube collect, so those two signals do
//   not exist yet for most brands at gate time. The gate therefore uses the
//   two signals that already cover every brand: Reddit conversation and
//   Wikipedia lookups.
//
// PRESENCE, NOT MOMENTUM:
//   The gate is a presence test. A brand survives if enough people are
//   talking about it (Reddit) or looking it up (Wikipedia). Whether it is
//   rising or falling is the ranker's job, on the survivors, using all four
//   signals. The gate decides who is in the room; the rank decides where
//   they sit. Keeping those separate keeps both honest.
//
// THE DIAL:
//   A brand survives if it clears the floor on EITHER cheap signal. The
//   floors live together in GATE_CONFIG below and nowhere else. They are
//   the single tuning surface for the whole product: raise them to rank
//   fewer, sharper brands; lower them to widen the net.
//
// PURE AND READ-ONLY:
//   buildGate() reads the stored signals and returns the survivor set. It
//   writes nothing. Collectors and the ranker call it to get their work
//   list, so there is one definition of "who is in," recomputed cheaply
//   rather than stored and risking staleness.
// ==========================================================================

import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getBrandCategory } from './taxonomy.js';

// --------------------------------------------------------------------------
// GATE_CONFIG — the dial. The only place the floor is defined.
//
// These are starting values, meant to be tuned once we see a real cut from
// the dry run. Two numbers because the signals are different units, but they
// are one decision: how much presence a brand needs to be worth examining.
// --------------------------------------------------------------------------
export const GATE_CONFIG = {
  // Minimum Reddit Buzz score to survive on conversation alone. The score is
  // mention-weighted, so a few real mentions clear a low single-digit floor
  // while pure noise does not.
  minRedditScore: 3,

  // Minimum Wikipedia weekly pageviews to survive on lookups alone. Absolute
  // attention: are people actively looking this brand up.
  minWikipediaPageviews: 500,
};

// --------------------------------------------------------------------------
// Does one brand record clear the gate?
// Survives on EITHER signal. Returns a small reason object for auditing.
// --------------------------------------------------------------------------
export function passesGate(record, config = GATE_CONFIG) {
  const redditScore = typeof record.score === 'number' ? record.score : 0;
  const wikiPageviews =
    typeof record.wikipediaPageviews === 'number' ? record.wikipediaPageviews : 0;

  const passesReddit = redditScore >= config.minRedditScore;
  const passesWiki = wikiPageviews >= config.minWikipediaPageviews;

  return {
    survives: passesReddit || passesWiki,
    passesReddit,
    passesWiki,
    redditScore,
    wikiPageviews,
  };
}

// --------------------------------------------------------------------------
// Build the survivor set from the two full-coverage signals.
//
// Returns { survivors, survivorNames, summary }:
//   survivors     - brand records that cleared the gate (lean objects)
//   survivorNames - just the names, the work list collectors will query by
//   summary       - counts, per-category breakdown, and the config used
//
// Reads the database. Writes nothing.
// --------------------------------------------------------------------------
export async function buildGate(config = GATE_CONFIG) {
  await connectToDatabase();

  const allBrands = await BrandTrend.find().lean();

  const survivors = [];
  const categoryCounts = {};
  let passedRedditOnly = 0;
  let passedWikiOnly = 0;
  let passedBoth = 0;

  for (const record of allBrands) {
    const result = passesGate(record, config);
    if (!result.survives) continue;

    survivors.push(record);

    if (result.passesReddit && result.passesWiki) passedBoth++;
    else if (result.passesReddit) passedRedditOnly++;
    else passedWikiOnly++;

    const category = getBrandCategory(record.name);
    const key = category ? category.id : 'uncategorized';
    categoryCounts[key] = (categoryCounts[key] || 0) + 1;
  }

  const summary = {
    universeSize: allBrands.length,
    survivorCount: survivors.length,
    passedRedditOnly,
    passedWikiOnly,
    passedBoth,
    categoryCounts,
    config: { ...config },
    timestamp: new Date().toISOString(),
  };

  const survivorNames = survivors.map((r) => r.name);

  return { survivors, survivorNames, summary };
}