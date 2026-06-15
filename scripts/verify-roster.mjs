// scripts/verify-roster.mjs
// ==========================================================================
// ROSTER COVERAGE REPORT. Read-only. No writes.
//
// PURPOSE:
//   Show the true state of the board. For every brand on it (aiRank set, the
//   roster), it reports which of the four signals and the analysis are in and
//   which are still pending, so you can watch the roster fill as the crons lap
//   and spot any brand whose data is not attaching.
//
// WHAT "PRESENT" MEANS PER COLUMN:
//   R  Reddit      a real score, mentions, or history exists
//   N  News        the News cron has stamped this brand
//   Y  YouTube     the YouTube cron has stamped this brand
//   W  Wikipedia   the Wikipedia cron has stamped this brand
//   A  Analysis    a written headline exists
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/verify-roster.mjs
// ==========================================================================

import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getDisplayName, getBrandCategory, CATEGORIES } from '../lib/taxonomy.js';

const CATEGORY_ORDER = ['spirits', 'wine', 'beer', 'rtd', 'non-alc', 'energy', 'thc', 'uncategorized'];

function catId(name) {
  const c = getBrandCategory(name);
  return c ? c.id : 'uncategorized';
}
function catLabel(id) {
  return (CATEGORIES[id] && CATEGORIES[id].label) || id;
}

function presence(b) {
  return {
    reddit:
      (typeof b.score === 'number' && b.score > 0) ||
      (typeof b.mentions === 'number' && b.mentions > 0) ||
      (Array.isArray(b.scoreHistory) && b.scoreHistory.length > 0),
    news: b.lastNewsUpdate != null,
    youtube: b.lastYoutubeUpdate != null,
    wiki: b.lastWikipediaUpdate != null,
    analysis: b.aiHeadline != null && b.aiHeadline !== '',
  };
}

function bar(t) {
  console.log('\n' + '='.repeat(70));
  console.log(t);
  console.log('='.repeat(70));
}

async function main() {
  await connectToDatabase();

  const roster = await BrandTrend.find({ aiRank: { $ne: null } }).sort({ aiRank: 1 }).lean();

  let R = 0, N = 0, Y = 0, W = 0, A = 0, allFour = 0, empty = 0;
  const rows = roster.map((b) => {
    const p = presence(b);
    if (p.reddit) R += 1;
    if (p.news) N += 1;
    if (p.youtube) Y += 1;
    if (p.wiki) W += 1;
    if (p.analysis) A += 1;
    const signals = [p.reddit, p.news, p.youtube, p.wiki].filter(Boolean).length;
    if (signals === 4) allFour += 1;
    if (signals === 0) empty += 1;
    return { name: b.name, rank: b.aiRank, cat: catId(b.name), p, signals };
  });

  const total = roster.length;
  const pct = (n) => `${Math.round((n / total) * 100)}%`;

  bar(`ROSTER COVERAGE  (${total} brands on the board)`);
  console.log(`  Reddit:    ${R}/${total}  (${pct(R)})`);
  console.log(`  News:      ${N}/${total}  (${pct(N)})`);
  console.log(`  YouTube:   ${Y}/${total}  (${pct(Y)})`);
  console.log(`  Wikipedia: ${W}/${total}  (${pct(W)})`);
  console.log(`  Analysis:  ${A}/${total}  (${pct(A)})`);
  console.log('');
  console.log(`  All 4 signals: ${allFour}/${total}  (${pct(allFour)})`);
  console.log(`  Fully empty:   ${empty}/${total}  (${pct(empty)})  <- waiting on collection`);

  bar('BY CATEGORY   total / R / N / Y / W / A');
  for (const id of CATEGORY_ORDER) {
    const inCat = rows.filter((r) => r.cat === id);
    if (inCat.length === 0) continue;
    const c = (sel) => inCat.filter(sel).length;
    console.log(
      `  ${catLabel(id).padEnd(12)} ${String(inCat.length).padStart(3)}` +
      ` / ${String(c((r) => r.p.reddit)).padStart(3)}` +
      ` / ${String(c((r) => r.p.news)).padStart(3)}` +
      ` / ${String(c((r) => r.p.youtube)).padStart(3)}` +
      ` / ${String(c((r) => r.p.wiki)).padStart(3)}` +
      ` / ${String(c((r) => r.p.analysis)).padStart(3)}`
    );
  }

  const emptyRows = rows.filter((r) => r.signals === 0).sort((a, b) => a.rank - b.rank);
  bar(`STILL EMPTY  (${emptyRows.length})  no signals yet`);
  emptyRows.forEach((r) =>
    console.log(`  #${String(r.rank).padStart(3)}  ${getDisplayName(r.name, 'brand').padEnd(28)} ${catLabel(r.cat)}`)
  );

  bar('END  (read-only, no writes)');
}

main()
  .catch((err) => {
    console.error('Verify failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore
    }
    process.exit(process.exitCode || 0);
  });
