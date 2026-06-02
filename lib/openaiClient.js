// lib/openaiClient.js
// ==========================================================================
// Central OpenAI connection and model choices for the AI layer.
//
// WHY THIS FILE:
//   Both AI jobs (ranking and analysis) share one connection and one
//   agreed place where the model names live. Keeping the model ids here,
//   read from environment variables with sensible defaults, means a
//   model can be swapped in one line, either here or in your Vercel
//   environment settings, without editing any service logic.
//
//   This is what "pinning the model" should mean in a year where new
//   versions ship monthly: the value is fixed for a given deployment,
//   so rankings stay reproducible, but it is trivial to change when you
//   choose to move.
//
// THE TWO MODELS:
//   Ranking  = gpt-5.4. The weekly judgment call. A strong reasoning
//              model, used where thinking actually happens.
//   Analysis = gpt-5.4. The brand writeup is the product's signature
//              output, so it runs on a frontier reasoning model too, not
//              a budget writer. Reasoning models reject temperature, so
//              the analysis service controls them with reasoning effort.
// ==========================================================================

import OpenAI from 'openai';

// The client reads OPENAI_API_KEY from the environment automatically.
export const openai = new OpenAI();

// Ranking job: strong reasoning model. Override with OPENAI_RANKING_MODEL.
export const RANKING_MODEL = process.env.OPENAI_RANKING_MODEL || 'gpt-5.4';

// Analysis job: frontier reasoning model. Override with OPENAI_ANALYSIS_MODEL.
export const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-5.4';