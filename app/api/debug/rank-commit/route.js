// app/api/debug/rank-commit/route.js
// ==========================================================================
// TEMPORARY ADMIN ROUTE. Not for production.
//
// Runs the ranking engine in COMMIT mode, which actually writes aiRank,
// aiRationale, aiRankDate, and aiRuleVersion to each ranked brand. This
// is the manual first real write, so you can run it once and confirm the
// ranks land before the weekly schedule takes over.
//
// Non-destructive: the engine only writes the AI fields and leaves every
// signal and history value untouched. It also refuses to write if the
// model returns a bad or incomplete result, so a failed run never
// corrupts the board.
//
// How to run:
//   With the dev server running, open:
//     http://localhost:3000/api/debug/rank-commit?confirm=commit
//   The confirm guard prevents an accidental write. The response reports
//   how many brands were written.
//
// IMPORTANT:
//   Remove this file or protect it before production. The weekly cron
//   handles writes from then on.
// ==========================================================================

import { rankBrands } from '../../../../lib/aiRanking.js';

export const dynamic = 'force-dynamic';

// gpt-5.4 reasoning over the pool can take a few minutes; give headroom.
export const maxDuration = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get('confirm') !== 'commit') {
    return Response.json(
      {
        message:
          'Commit not run. Add ?confirm=commit to the URL to write the ranking.',
      },
      { status: 400 }
    );
  }

  try {
    const result = await rankBrands({ dryRun: false });
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}