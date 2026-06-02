// app/api/debug/analysis-preview/route.js
// ==========================================================================
// TEMPORARY DEBUG ROUTE. Not for production.
//
// Runs the analysis service in DRY-RUN mode. It generates the writeups for
// every ranked brand and returns them, but writes NOTHING to the database.
// Use this to read the voice and check quality before committing.
//
// How to run (dev server up):
//   http://localhost:3000/api/debug/analysis-preview
//
// Remove or protect this file before production.
// ==========================================================================

import { analyzeBrands } from '../../../../lib/aiAnalysis.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  try {
    const result = await analyzeBrands({ dryRun: true });
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}