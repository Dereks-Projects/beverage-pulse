// app/api/debug/analysis-commit/route.js
// ==========================================================================
// TEMPORARY ADMIN ROUTE. Not for production.
//
// Runs the analysis service in COMMIT mode, which writes aiHeadline,
// aiAnalysis, aiClosing, and aiAnalysisDate to every brand that succeeded.
// Non-destructive: only the analysis fields are touched, and a brand that
// failed simply keeps no writeup this cycle.
//
// The confirm guard prevents an accidental write.
//
// How to run (dev server up):
//   http://localhost:3000/api/debug/analysis-commit?confirm=commit
//
// Remove or protect this file before production. The weekly cron handles
// writes from then on.
// ==========================================================================

import { analyzeBrands } from '../../../../lib/aiAnalysis.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get('confirm') !== 'commit') {
    return Response.json(
      { message: 'Commit not run. Add ?confirm=commit to the URL to write the analysis.' },
      { status: 400 }
    );
  }

  try {
    const result = await analyzeBrands({ dryRun: false });
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}