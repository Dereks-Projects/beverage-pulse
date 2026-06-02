// lib/aiRanking.js
// ==========================================================================
// The ranking engine (single correct call).
//
// WHAT IT DOES:
//   1. Pulls the candidate shortlist (cheap, deterministic gate).
//   2. Packages each brand's four signals and short history compactly.
//   3. Sends the whole pool plus the ranking rule to the reasoning model
//      in ONE call, so the model sees every brand at once and produces a
//      correct global order.
//   4. Validates everything, then either returns it (dry-run) or writes
//      aiRank / aiRationale / aiRankDate / aiRuleVersion to each brand.
//
// WHY A SINGLE CALL (and why not tiers, yet):
//   We tested splitting the pool into tiers that run in parallel. It was
//   fast, but it broke the order: tiers were cut by how much activity a
//   brand has, and a brand crashing hard has lots of activity, so it
//   landed in the top tier and outranked genuine risers in lower tiers.
//   Activity is not the same as favorability. A single call avoids that
//   entirely because the model compares every brand against every other.
//
//   The single call is correct and fine at the current pool size. It is
//   slower (a few minutes, occasionally more), which we cover by raising
//   the cron's time limit. When the pool grows past what one call can
//   handle on time or tokens (roughly the high tens of brands), the scale
//   fix is tiering WITH a final merge round that re-orders across tiers
//   so the activity-not-favorability trap cannot happen. We build that
//   when the data forces it, not before.
//
// SAFETY (the definition of done, not just "it produced ranks"):
//   - Defaults to dry-run. It cannot write unless called with
//     { dryRun: false }.
//   - Validates every item. Hallucinated names, bad ranks, and empty
//     rationales are dropped.
//   - If the model returns unparseable or empty output, or coverage is
//     too low, it writes NOTHING and returns a diagnostic. Existing data
//     is left untouched. The dashboard never breaks on a bad response.
//   - Writes are non-destructive: only the AI fields are touched.
// ==========================================================================

import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { buildCandidatePool } from './candidatePool.js';
import { openai, RANKING_MODEL } from './openaiClient.js';
import { RANKING_RULE, RULE_VERSION } from './rankingRule.js';
import { getBrandCategory } from './taxonomy.js';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

// How many recent history points to include per signal.
const MAX_HISTORY_POINTS = 6;

// Token ceiling for the response. Shared between the model's thinking and
// its written answer. Sized for the current pool; when the pool grows
// large this is one of the triggers to switch to tiering.
const MAX_COMPLETION_TOKENS = 32000;

// Reasoning models do not accept temperature. Effort is the lever.
// Medium keeps the judgment sharp. Low was faster but misjudged the hard
// cases (over-rated single spikes, under-rated clean risers).
const REASONING_EFFORT = 'medium';

// Minimum fraction of the pool that must come back validly ranked for a
// commit to proceed.
const MIN_COVERAGE = 0.9;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function recentValues(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  return history.slice(-MAX_HISTORY_POINTS).map((h) => h.value);
}

function buildBrandPayload(records) {
  return records.map((b) => {
    const category = getBrandCategory(b.name);
    return {
      name: b.name,
      category: category ? category.id : null,
      buzz: typeof b.score === 'number' ? Math.round(b.score) : null,
      news: b.newsVelocity ?? null,
      social: b.socialVelocity ?? null,
      wikitrend: b.wikipediaVelocity ?? null,
      history: {
        buzz: recentValues(b.scoreHistory),
        news: recentValues(b.newsHistory),
        social: recentValues(b.youtubeHistory),
        wikitrend: recentValues(b.wikipediaHistory),
      },
    };
  });
}

function buildSystemPrompt() {
  return (
    'You are the ranking engine for BeveragePulse. Apply the rule below ' +
    'exactly. Use ONLY the data provided in the user message. Do not use ' +
    'any outside knowledge or prior familiarity with any brand.\n\n' +
    RANKING_RULE +
    '\n\nOUTPUT FORMAT:\n' +
    'Return a single JSON object and nothing else, in this exact shape:\n' +
    '{ "rankings": [ { "name": "<exact brand name from the input>", ' +
    '"rank": <integer, 1 is strongest>, "rationale": "<one or two ' +
    'sentences citing only the four signals and history; name any ' +
    'deviation condition by its number> " } ] }\n' +
    'Rank every brand in the input. Use the exact name strings given. ' +
    'Ranks should start at 1 and not repeat.'
  );
}

// --------------------------------------------------------------------------
// Main entry point.
//
// Options:
//   dryRun (default true): when true, returns the ranking without
//     writing. When false, writes the AI fields to each ranked brand.
//
// Never throws to the caller; failures come back as { ok: false, ... }.
// --------------------------------------------------------------------------
export async function rankBrands({ dryRun = true } = {}) {
  try {
    await connectToDatabase();

    const { pool, summary } = await buildCandidatePool();
    if (!pool || pool.length === 0) {
      return { ok: false, error: 'Candidate pool is empty', poolSummary: summary };
    }

    const brands = buildBrandPayload(pool);
    const poolNames = new Set(brands.map((b) => b.name));

    console.log(
      `AI ranking: sending ${brands.length} brands to ${RANKING_MODEL} ` +
      `(dryRun: ${dryRun})`
    );

    let response;
    try {
      response = await openai.chat.completions.create({
        model: RANKING_MODEL,
        reasoning_effort: REASONING_EFFORT,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: JSON.stringify({ brands }) },
        ],
      });
    } catch (apiError) {
      console.error('AI ranking: model call failed:', apiError.message);
      return { ok: false, error: `Model call failed: ${apiError.message}` };
    }

    const choice = response?.choices?.[0];
    const raw = choice?.message?.content;
    const finishReason = choice?.finish_reason;
    const usage = response?.usage || {};

    console.log(
      `AI ranking: finish_reason=${finishReason}, usage=${JSON.stringify(usage)}`
    );

    if (!raw) {
      return {
        ok: false,
        error:
          finishReason === 'length'
            ? 'Model used its whole token budget before writing output. Raise max tokens or switch to tiering.'
            : 'Model returned an empty response',
        finishReason,
        usage,
      };
    }

    let parsed;
    try {
      const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: 'Model returned unparseable JSON', rawPreview: raw.slice(0, 500) };
    }

    if (!parsed || !Array.isArray(parsed.rankings)) {
      return { ok: false, error: 'Response did not contain a rankings array', rawPreview: raw.slice(0, 500) };
    }

    const seen = new Set();
    const valid = [];
    for (const item of parsed.rankings) {
      if (!item || typeof item.name !== 'string') continue;
      if (!poolNames.has(item.name)) continue;
      if (seen.has(item.name)) continue;
      if (typeof item.rank !== 'number' || !Number.isFinite(item.rank)) continue;
      if (typeof item.rationale !== 'string' || item.rationale.trim() === '') continue;
      seen.add(item.name);
      valid.push({ name: item.name, modelRank: item.rank, rationale: item.rationale.trim() });
    }

    // Normalize to clean consecutive ranks based on the model's order.
    valid.sort((a, b) => a.modelRank - b.modelRank);
    valid.forEach((v, i) => { v.aiRank = i + 1; });

    const coverage = valid.length / pool.length;
    const missing = brands.map((b) => b.name).filter((n) => !seen.has(n));

    const result = {
      ok: true,
      dryRun,
      model: RANKING_MODEL,
      ruleVersion: RULE_VERSION,
      poolSize: pool.length,
      rankedCount: valid.length,
      coverage: Math.round(coverage * 100) / 100,
      missing,
      rankings: valid.map((v) => ({ rank: v.aiRank, name: v.name, rationale: v.rationale })),
    };

    if (dryRun) {
      console.log(`AI ranking (dry-run): ${valid.length}/${pool.length} ranked, coverage ${result.coverage}`);
      return result;
    }

    if (coverage < MIN_COVERAGE) {
      return {
        ...result,
        ok: false,
        error: `Coverage ${result.coverage} below minimum ${MIN_COVERAGE}; wrote nothing to protect existing data`,
      };
    }

    const now = new Date();
    let written = 0;
    for (const v of valid) {
      await BrandTrend.findOneAndUpdate(
        { name: v.name },
        {
          $set: {
            aiRank: v.aiRank,
            aiRationale: v.rationale,
            aiRankDate: now,
            aiRuleVersion: RULE_VERSION,
          },
        },
        { upsert: false }
      );
      written++;
    }

    console.log(`AI ranking: committed ${written} ranks with ${RANKING_MODEL}`);
    return { ...result, written };
  } catch (error) {
    console.error('AI ranking: unexpected error:', error.message);
    return { ok: false, error: `Unexpected error: ${error.message}` };
  }
}