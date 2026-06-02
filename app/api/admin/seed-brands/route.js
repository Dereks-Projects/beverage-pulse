// app/api/admin/seed-brands/route.js
// ==========================================================================
// ONE-TIME BRAND SEED (temporary admin utility).
//
// WHY THIS EXISTS:
//   Until now, the only thing that created brand records was the
//   Reddit cron, which saves only its weekly top 20 by buzz. That
//   capped the database at about 48 brands and left the other 400-plus
//   taxonomy brands with no record at all, so News, YouTube, and
//   Wikipedia had nothing to fill.
//
//   This route creates an empty record for every brand in the
//   taxonomy, giving each one a slot. It removes Reddit as the
//   gatekeeper. After this runs, the collectors can reach the whole
//   list and the universe fills in over the following weekly cycles.
//
// NON-DESTRUCTIVE, SAFE TO RERUN:
//   Each brand is written with $setOnInsert, which applies ONLY when a
//   brand new document is created. Any brand that already has a record
//   is left completely untouched, including every signal value and
//   every history entry it has accumulated. Running this twice creates
//   nothing the second time.
//
// HOW TO RUN:
//   With the dev server running, open this in your browser:
//     http://localhost:3000/api/admin/seed-brands?confirm=seed
//   The confirm guard prevents an accidental trigger. The response
//   reports how many records were created and how many already existed.
//
// IMPORTANT:
//   This is an admin tool, not a public endpoint, and it only needs to
//   run once. Remove this file or put it behind authentication before
//   production.
// ==========================================================================

import connectToDatabase from '../../../../lib/db.js';
import BrandTrend from '../../../../models/BrandTrend.js';
import { BRAND_TAXONOMY } from '../../../../lib/taxonomy.js';

export const dynamic = 'force-dynamic';

// Seeding hundreds of records is quick, but we give generous headroom.
export const maxDuration = 300;

// Placeholder rank for a brand that has never been ranked by Reddit.
// A high number so freshly seeded brands sort after genuinely ranked
// brands in the legacy rank sort. The AI rank supersedes this later.
const PLACEHOLDER_RANK = 9999;

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // Guard against accidental triggers. The seed only runs when the
  // confirm flag is present.
  if (searchParams.get('confirm') !== 'seed') {
    return Response.json(
      {
        message:
          'Seed not run. Add ?confirm=seed to the URL to create missing brand records.',
      },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const weekOf = new Date();
    weekOf.setHours(0, 0, 0, 0);

    const brandKeys = Object.keys(BRAND_TAXONOMY);

    // Count records before, so we can report exactly how many new ones
    // this run created. This is more reliable across database driver
    // versions than inspecting each write result.
    const beforeCount = await BrandTrend.countDocuments();

    for (const name of brandKeys) {
      await BrandTrend.findOneAndUpdate(
        { name },
        {
          // Applies ONLY on insert. Existing records keep all of their
          // data. New records get the minimum required fields so they
          // satisfy the schema, with all signal fields left at their
          // null defaults, waiting to be filled by the collectors.
          $setOnInsert: {
            name,
            score: 0,
            mentions: 0,
            rank: PLACEHOLDER_RANK,
            change: 'new',
            previousRank: null,
            weekOf,
            lastUpdated: new Date(),
          },
        },
        { upsert: true }
      );
    }

    const afterCount = await BrandTrend.countDocuments();
    const created = afterCount - beforeCount;

    return Response.json({
      message: 'Brand seed completed',
      totalBrandsInTaxonomy: brandKeys.length,
      recordsBefore: beforeCount,
      recordsAfter: afterCount,
      created,
      alreadyExisted: brandKeys.length - created,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Seed error:', error.message);
    return Response.json(
      { error: 'Seed failed', details: error.message },
      { status: 500 }
    );
  }
}