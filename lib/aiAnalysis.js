// lib/aiAnalysis.js
// ==========================================================================
// The analysis service.
//
// Runs AFTER ranking. For each ranked brand it writes four fields:
//   aiHeadline - the lead sentence (sits by the rank, frames the read)
//   aiAnalysis - the body, two sentences. The first says what the brand is
//                and its strongest move; the second gives the rest of the
//                picture and, in the same breath, what it means.
//   aiClosing  - one sentence, a forward read, no prescription
//
//   aiInsight is no longer written as its own line. Its read folds into the
//   body's second sentence, so the card is four sentences: lead, two body
//   sentences, closing. The schema field is set to null on commit so no
//   stale insight text lingers.
//
// PROMPT (how the brief steers it):
//   The system prompt is written as a spec, not a pep talk. It states the
//   role, the exact inputs and how to read them, one concrete job per output
//   field, the writing rules once each, the firewall, and the output shape.
//   The said/done read (what people do versus what is said) is the method
//   for telling real demand from visibility. The identity descriptor is used
//   only when a brand may be unfamiliar, never as its own sentence, so we do
//   not print a flat line like "Corona is a beer". The body is two sentences,
//   the second folding the read into the data; the closing forecasts the
//   driving signal's own trajectory. No separate insight line on this card.
//
//   The comparison fuel still comes from lib/signalContext.js, unchanged.
//   This file only reframes how that fuel is described to the writer.
//
// MODEL: gpt-5.4 (frontier reasoning). Reasoning models reject temperature,
//   so depth is controlled with reasoning effort, and the token budget is
//   generous so thinking does not starve the written answer.
//
// SAFETY AND SCALE:
//   - Defaults to dry-run. Cannot write unless called with { dryRun:false }.
//   - Each brand is analyzed independently; a failure is recorded and
//     skipped, the others are unaffected. Partial success is correct.
//   - The writer receives no raw numbers, only directions and standings.
//   - Non-destructive writes (only the AI analysis fields are touched).
// ==========================================================================

import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';
import { openai, ANALYSIS_MODEL } from './openaiClient.js';
import { getBrandCategory, getDisplayName } from './taxonomy.js';
import { buildSignalContext } from './signalContext.js';

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

// Reasoning models reject temperature; reasoning effort is the lever.
const REASONING_EFFORT = 'medium';

// Headroom so the model's thinking does not starve the written answer.
const MAX_COMPLETION_TOKENS = 8000;

// Brands analyzed at the same time. Tune down if rate-limited.
const CONCURRENCY = 5;

// Guard against runaway output.
const MAX_FIELD_CHARS = 1200;

// --------------------------------------------------------------------------
// Payload: a data-only package for one brand, built from its context block.
//
// Carries no raw numbers. The keys are plain activity words on purpose, so
// that if the model echoes a key it echoes the reader's language, not ours.
// The internal word "field" never appears; the across-everything standing
// is named "overall".
// --------------------------------------------------------------------------

function signalView(signal) {
  if (!signal || !signal.present) {
    return { present: false };
  }
  return {
    present: true,
    direction: signal.direction, // rising | falling | flat, or null for trade talk
    pace: signal.trajectory, // internal shape word, never to be printed
    standingInCategory: signal.category ? `${signal.category.rank} of ${signal.category.of}` : null,
    standingOverall: signal.field ? `${signal.field.rank} of ${signal.field.of}` : null,
    overallPercentile: signal.field ? signal.field.percentile : null,
    leadsCategory: signal.leadsCategory,
    nearTopOverall: signal.topOfField,
  };
}

function buildAnalysisPayload(brand, ctx) {
  const context = ctx || {};
  const signals = context.signals || {};
  const concordance = context.concordance || {};
  const fallbackCategory = getBrandCategory(brand.name);

  return {
    rank: brand.aiRank,
    name: context.displayName || getDisplayName(brand.name, 'brand'),
    identity: context.identity || null,
    category: context.category && context.category.label
      ? context.category.label
      : fallbackCategory
        ? fallbackCategory.label
        : null,
    forcesRising: typeof concordance.momentumRising === 'number' ? concordance.momentumRising : null,
    forcesPresent: typeof concordance.momentumPresent === 'number' ? concordance.momentumPresent : null,
    signals: {
      tradeTalk: signalView(signals.buzz), // what is being said
      press: signalView(signals.news), // what is being said
      video: signalView(signals.social), // what people do
      search: signalView(signals.wikitrend), // what people do
    },
    rankingRationale: brand.aiRationale || null,
  };
}

// --------------------------------------------------------------------------
// System prompt: role, the inputs and how to read them, one concrete job per
// field, the writing rules once each, the firewall, and the output shape.
// --------------------------------------------------------------------------

function buildSystemPrompt() {
  return [
    'ROLE',
    'You are the analyst for BeveragePulse. You write the weekly read on one',
    'beverage brand for industry professionals: beverage and wine directors,',
    'distributor sales leads, GMs, and marketing heads. Write in plain trade',
    'language, the way one pro briefs another.',
    '',
    'INPUTS (the only information you may use):',
    '- rank: the rank assigned to this brand this week. rationale: the reasoning',
    '  behind that rank.',
    '- identity: a short descriptor of what the brand is, or null.',
    '- category: the category the brand belongs to.',
    '- Four signals. tradeTalk and press are people talking about the brand;',
    '  video and search are people watching it and looking it up on their own.',
    '  Each signal carries:',
    '    direction: rising, falling, or flat (tradeTalk has none; read its pace).',
    '    pace: rising, falling, steady, choppy (it comes in bursts), or',
    '      insufficient (too little history, so claim no trend).',
    '    standing: where the brand places within its category and across all',
    '      brands we track (overall), plus the flags leadsCategory and',
    '      nearTopOverall.',
    '- You are NOT given raw numbers. Never state a number, a percentage, or a',
    '  magnitude such as "doubled".',
    '',
    'HOW TO READ THE SIGNALS (your reasoning, never your wording):',
    'video and search are people acting on the brand on their own time.',
    'tradeTalk and press are people talking about it. When people are watching',
    'and searching for a brand harder than the trade and press are talking about',
    'it, real demand is usually showing up before the market notices, and that',
    'is the most valuable thing you can flag. When the talk is loud but people',
    'are not watching or searching, the brand has visibility without much demand',
    'behind it yet. Pace tells you whether a move is early, steady, or fading.',
    'Write what actually happened in plain words: people are watching, people',
    'are looking it up, the press went quiet, the trade is talking.',
    '',
    'OUTPUT FIELDS (one job each):',
    'lead (the finding): ONE sentence. State the main reason this brand holds',
    '  the position it holds this week. Name which of the four signals is doing',
    '  the most to put it there and, in plain terms, what that signal is showing',
    '  right now: people watching it, people looking it up, the press writing',
    '  about it, or the trade talking about it. Write it the way an analyst',
    '  states a headline finding, plainly and with weight, not as a catchy hook',
    '  and not as a question. It must be specific enough that it could only be',
    '  about this brand. Do not restate the rank number, which is already on the',
    '  card, and do not spend the sentence on detail that belongs in the body.',
    'body: TWO sentences.',
    '  Sentence one: name the brand (add the identity descriptor only if the',
    '    brand is not a household name) and give its strongest signal with where',
    '    that signal ranks in its category or overall.',
    '  Sentence two: fill in the other signals and say what they add up to now,',
    '    whether people are acting on the brand faster than the talk around it is',
    '    building, or the reverse, and what that means for the brand.',
    'action (the expectation): ONE sentence. Tell the reader how strong this',
    '  brand looks going forward, and base that strength on how many of the four',
    '  signals are pointing the same way. When most or all four are moving',
    '  together, say so plainly: this is a well corroborated, high conviction',
    '  read, and state where it leans (strengthening, holding, or cooling). When',
    '  a single signal is carrying the brand and the rest are flat, thin, or',
    '  missing, say that just as plainly: this is a one signal flag worth',
    '  watching, not a confirmed trend yet. Lead with the weight of the evidence,',
    '  how much the signals agree, not with a bold prediction. Do not promise the',
    '  future and do not name a time horizon you cannot support. If the data is',
    '  too thin to give a real read, return an empty string here rather than',
    '  padding it with filler.',
    '',
    'WRITING RULES:',
    '- Use trade words, not internal ones: the trade is talking, the press went',
    '  quiet, people are watching, people are looking it up. Do not name the',
    '  signals as tradeTalk, buzz, video, or search, do not call the data "the',
    '  read", "the signal", or "the picture", and do not describe a brand as',
    '  holding a position in a field.',
    '- Claim a category lead only when leadsCategory is true; claim an overall',
    '  standout only when nearTopOverall is true.',
    '- Make at most one comparison per sentence, the most telling one.',
    '- Every sentence states a distinct fact or judgment; no sentence restates',
    '  another.',
    '- If another brand could replace this one in a sentence unnoticed, rewrite',
    '  it.',
    '',
    'FIREWALL (never crossed):',
    '- Use only the inputs above. Never use outside knowledge of the brand, and',
    '  never invent an event, launch, product, person, price, award, or news',
    '  item.',
    '- If a signal is missing, say the read is one-sided and lean on what',
    '  exists. Never fabricate the missing side.',
    '- Never recommend a business action (stock, buy, list, drop, promote).',
    '',
    'OUTPUT FORMAT:',
    'Return one JSON object and nothing else, exactly this shape:',
    '{',
    '  "lead": "<one sentence>",',
    '  "body": "<two sentences>",',
    '  "action": "<one sentence, or an empty string if the data is too thin>"',
    '}',
  ].join('\n');
}

// --------------------------------------------------------------------------
// Analyze a single brand. Never throws; returns a result object.
// --------------------------------------------------------------------------
async function analyzeBrand(brand, ctx) {
  const payload = buildAnalysisPayload(brand, ctx);

  let response;
  try {
    response = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      reasoning_effort: REASONING_EFFORT,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    });
  } catch (apiError) {
    return { name: brand.name, ok: false, error: `call failed: ${apiError.message}` };
  }

  const choice = response?.choices?.[0];
  const raw = choice?.message?.content;

  if (!raw) {
    const reason = choice?.finish_reason || 'unknown';
    return {
      name: brand.name,
      ok: false,
      error:
        reason === 'length'
          ? 'empty response: thinking used the whole token budget'
          : `empty response (${reason})`,
    };
  }

  let parsed;
  try {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { name: brand.name, ok: false, error: 'unparseable JSON' };
  }

  const lead = typeof parsed?.lead === 'string' ? parsed.lead.trim() : '';
  const body = typeof parsed?.body === 'string' ? parsed.body.trim() : '';
  const action = typeof parsed?.action === 'string' ? parsed.action.trim() : '';

  if (!lead || !body || !action) {
    return { name: brand.name, ok: false, error: 'missing one or more fields' };
  }
  if (
    lead.length > MAX_FIELD_CHARS ||
    body.length > MAX_FIELD_CHARS ||
    action.length > MAX_FIELD_CHARS
  ) {
    return { name: brand.name, ok: false, error: 'a field exceeded the length guard' };
  }

  return {
    name: brand.name,
    ok: true,
    fields: {
      aiHeadline: lead,
      aiAnalysis: body,
      aiClosing: action,
    },
  };
}

// --------------------------------------------------------------------------
// Bounded concurrency pool. Runs `worker` over `items`, at most
// `concurrency` at a time, preserving input order in the results.
// --------------------------------------------------------------------------
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;

  async function runner() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }

  const lanes = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runner()
  );
  await Promise.all(lanes);
  return results;
}

// --------------------------------------------------------------------------
// Main entry point.
//
// Options:
//   dryRun (default true): when true, returns the writeups without writing.
//     When false, writes the four analysis fields plus aiAnalysisDate for
//     every brand that succeeded.
//
// Never throws to the caller; failures come back in the result.
// --------------------------------------------------------------------------
export async function analyzeBrands({ dryRun = true } = {}) {
  try {
    await connectToDatabase();

    const brands = await BrandTrend.find({ aiRank: { $ne: null } })
      .sort({ aiRank: 1 })
      .lean();

    if (!brands || brands.length === 0) {
      return { ok: false, error: 'No ranked brands found. Run the ranking first.' };
    }

    // Compute the comparison context once for the whole ranked field.
    const context = buildSignalContext(brands);

    console.log(
      `AI analysis: writing for ${brands.length} ranked brands with ` +
      `${ANALYSIS_MODEL} (dryRun: ${dryRun}, effort: ${REASONING_EFFORT}, ` +
      `concurrency: ${CONCURRENCY})`
    );

    const results = await runPool(
      brands,
      (brand) => analyzeBrand(brand, context.get(brand.name)),
      CONCURRENCY
    );

    const succeeded = results.filter((r) => r && r.ok);
    const failed = results.filter((r) => !r || !r.ok);

    if (failed.length > 0) {
      console.warn(
        `AI analysis: ${failed.length} brand(s) failed: ` +
        failed.map((f) => `${f?.name || '?'} (${f?.error || 'unknown'})`).join(', ')
      );
    }

    const summary = {
      ok: true,
      dryRun,
      model: ANALYSIS_MODEL,
      total: brands.length,
      analyzed: succeeded.length,
      failedCount: failed.length,
      failed: failed.map((f) => ({ name: f?.name || null, error: f?.error || 'unknown' })),
    };

    if (dryRun) {
      console.log(`AI analysis (dry-run): ${succeeded.length}/${brands.length} written`);
      return {
        ...summary,
        previews: succeeded.map((r) => ({
          name: r.name,
          headline: r.fields.aiHeadline,
          analysis: r.fields.aiAnalysis,
          closing: r.fields.aiClosing,
        })),
      };
    }

    // Commit: write every brand that succeeded. Partial success is correct.
    const now = new Date();
    let written = 0;
    for (const r of succeeded) {
      await BrandTrend.findOneAndUpdate(
        { name: r.name },
        {
          $set: {
            aiHeadline: r.fields.aiHeadline,
            aiAnalysis: r.fields.aiAnalysis,
            aiInsight: null,
            aiClosing: r.fields.aiClosing,
            aiAnalysisDate: now,
          },
        },
        { upsert: false }
      );
      written += 1;
    }

    console.log(`AI analysis: committed ${written} writeups with ${ANALYSIS_MODEL}`);
    return { ...summary, written };
  } catch (error) {
    console.error('AI analysis: unexpected error:', error.message);
    return { ok: false, error: `Unexpected error: ${error.message}` };
  }
}