// app/api/debug/rank-preview/route.js
// ==========================================================================
// TEMPORARY DEBUG ROUTE. Not for production.
//
// Runs the ranking engine in DRY-RUN mode and returns the result so you
// can audit it in the browser. Writes nothing to the database.
//
// How to use:
//   With the dev server running, open:
//     http://localhost:3000/api/debug/rank-preview
//   Read the rankings and rationales and check them against the rule.
//
// IMPORTANT:
//   Remove this file or protect it before production. It exists only to
//   audit the ranking before we wire the real cron and allow writes.
// ==========================================================================

import { rankBrands } from '../../../../lib/aiRanking.js';

export const dynamic = 'force-dynamic';

// gpt-5.4 reasoning over the pool can take a while; give it headroom.
export const maxDuration = 300;

export async function GET() {
  try {
    const result = await rankBrands({ dryRun: true });
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}