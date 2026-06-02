// app/api/debug/candidate-pool/route.js
// ==========================================================================
// TEMPORARY DEBUG ROUTE. Not for production.
//
// Purpose:
//   Lets you open the candidate shortlist in your browser and audit it
//   before we build the AI ranking call on top. It runs the cheap,
//   deterministic gate in lib/candidatePool.js and returns what it
//   selected, with each brand's liveness score and four signals visible.
//
// How to use:
//   With the dev server running, open:
//     http://localhost:3000/api/debug/candidate-pool
//   Read the summary (universe size, pool size, per-category counts),
//   then scan the brands to confirm the gate is letting the right ones
//   in and keeping dormant ones out.
//
// IMPORTANT:
//   This route exposes internal data and must not ship live. Before
//   production we either delete this file or put it behind an auth
//   check. It exists only so we can validate step one of Phase 3.
// ==========================================================================

import { buildCandidatePool } from '../../../../lib/candidatePool.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { summary, scored } = await buildCandidatePool();

    // Trim each entry to just what is useful for auditing the gate.
    const brands = scored.map((item) => ({
      name: item.record.name,
      category: item.categoryId,
      liveness: Math.round(item.liveness * 10) / 10,
      buzz: item.record.score ?? null,
      news: item.record.newsVelocity ?? null,
      social: item.record.socialVelocity ?? null,
      wikitrend: item.record.wikipediaVelocity ?? null,
    }));

    return Response.json({ summary, brands });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}