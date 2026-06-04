// scripts/diagnose-coverage.mjs
// ==========================================================================
// READ-ONLY coverage diagnostic.
//
// PURPOSE:
//   For a short list of tail brands, show whether each of the four signals
//   has real data, and if not, whether the collector ran and found nothing
//   (a true null) or never reached the brand (a coverage gap). This tells
//   us whether Phase 3 is a collection-expansion job or a collector-bug job.
//
// HOW IT READS EACH SIGNAL (documented, because the read is the point):
//   A signal has three observable parts: the current value, its own history
//   array, and its own last-update timestamp.
//     value is a number (including 0) -> HAS DATA. 0 is a real reading, not
//       absence, so it is never treated as missing.
//     value is null AND history has entries -> STOPPED. The collector wrote
//       before but the latest value is gone. A genuine no-data period or a
//       recent failure. Worth a look.
//     value is null AND history empty AND timestamp set -> COLLECTED, EMPTY.
//       The collector ran but never found data. Most likely a true null.
//     value is null AND history empty AND timestamp null -> NEVER COLLECTED.
//       No evidence the collector ever reached this brand. A coverage gap.
//
// CAVEAT (pressure-test, do not skip):
//   The split between COLLECTED-EMPTY and NEVER-COLLECTED assumes each
//   collector stamps its timestamp even when it finds nothing. That is NOT
//   verified. If a collector only stamps on success, a brand it ran but
//   found nothing for will look like NEVER COLLECTED. So every verdict is
//   printed next to its raw evidence and is a read, not a fact. If the five
//   brands disagree in a confusing way, open one collector service next and
//   confirm its write-on-empty behavior before concluding.
//
// SAFETY:
//   Strictly read-only. Uses find().lean(). No write, update, or delete.
//
// RUN (from C:\Dev\new-beverage-trends-app\beverage-pulse):
//   node --env-file=.env.local scripts/diagnose-coverage.mjs
// ==========================================================================

import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.js';
import BrandTrend from '../models/BrandTrend.js';
import { getBrandCategory } from '../lib/taxonomy.js';

// Exact stored name keys (lowercase), matching the ranking output.
const BRANDS = ['reyka', 'hangar1', 'modelo', 'antinori', 'spindrift'];

const now = Date.now();

function fmtDate(d) {
  if (!d) return 'null';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return 'invalid';
  const days = Math.round((now - t.getTime()) / 86400000);
  return `${t.toISOString()} (${days}d ago)`;
}

function histInfo(history) {
  if (!Array.isArray(history) || history.length === 0) return { len: 0, last: null };
  return { len: history.length, last: history[history.length - 1] };
}

function lastVal(last) {
  if (!last) return '';
  return `  last: ${last.value} @ ${fmtDate(last.weekOf)}`;
}

function show(v) {
  return v === null || v === undefined ? 'null' : v;
}

// Verdict for a signal whose value can be null.
function readSignal(value, history, timestamp) {
  const h = histInfo(history);
  if (typeof value === 'number') return { verdict: 'HAS DATA', h };
  if (h.len > 0) return { verdict: 'STOPPED (had history, now null)', h };
  if (timestamp) return { verdict: 'COLLECTED, EMPTY (likely true null)', h };
  return { verdict: 'NEVER COLLECTED (coverage gap?)', h };
}

// Buzz is special: score is required and defaults to 0, so it is never null.
function readBuzz(score, history) {
  const h = histInfo(history);
  if (typeof score === 'number' && score > 0) return { verdict: 'HAS DATA', h };
  if (h.len > 0) return { verdict: 'ZERO THIS RUN (had history)', h };
  return { verdict: 'NO BUZZ HISTORY (never collected or always zero)', h };
}

async function main() {
  await connectToDatabase();
  console.log('Connected. READ-ONLY coverage diagnostic.\n');

  const records = await BrandTrend.find({ name: { $in: BRANDS } }).lean();
  const byName = new Map(records.map((r) => [r.name, r]));

  for (const name of BRANDS) {
    const r = byName.get(name);
    console.log('='.repeat(64));

    if (!r) {
      console.log(`${name}: NOT FOUND in collection\n`);
      continue;
    }

    const cat = getBrandCategory(name);
    console.log(`${name}  [${cat ? cat.label : 'no category'}]`);
    console.log(`  weekOf: ${fmtDate(r.weekOf)}\n`);

    const buzz = readBuzz(r.score, r.scoreHistory);
    console.log(`  BUZZ (Reddit)     value: score=${show(r.score)}, mentions=${show(r.mentions)}`);
    console.log(`                    history: ${buzz.h.len} entries${lastVal(buzz.h.last)}`);
    console.log(`                    lastUpdated: ${fmtDate(r.lastUpdated)}`);
    console.log(`                    READ: ${buzz.verdict}\n`);

    const news = readSignal(r.newsVelocity, r.newsHistory, r.lastNewsUpdate);
    console.log(`  NEWS (Google)     value: ${show(r.newsVelocity)}`);
    console.log(`                    history: ${news.h.len} entries${lastVal(news.h.last)}`);
    console.log(`                    lastNewsUpdate: ${fmtDate(r.lastNewsUpdate)}`);
    console.log(`                    READ: ${news.verdict}\n`);

    const social = readSignal(r.socialVelocity, r.youtubeHistory, r.lastYoutubeUpdate);
    console.log(`  SOCIAL (YouTube)  value: ${show(r.socialVelocity)}, youtubeScore: ${show(r.youtubeScore)}`);
    console.log(`                    history: ${social.h.len} entries${lastVal(social.h.last)}`);
    console.log(`                    lastYoutubeUpdate: ${fmtDate(r.lastYoutubeUpdate)}`);
    console.log(`                    READ: ${social.verdict}\n`);

    const wiki = readSignal(r.wikipediaVelocity, r.wikipediaHistory, r.lastWikipediaUpdate);
    console.log(`  WIKITREND         value: ${show(r.wikipediaVelocity)}, pageviews: ${show(r.wikipediaPageviews)}`);
    console.log(`                    history: ${wiki.h.len} entries${lastVal(wiki.h.last)}`);
    console.log(`                    lastWikipediaUpdate: ${fmtDate(r.lastWikipediaUpdate)}`);
    console.log(`                    READ: ${wiki.verdict}\n`);
  }

  console.log('='.repeat(64));
  console.log('Done. No writes performed.');
}

main()
  .catch((err) => {
    console.error('Diagnostic failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore close errors on a read-only script
    }
    process.exit(process.exitCode || 0);
  });
