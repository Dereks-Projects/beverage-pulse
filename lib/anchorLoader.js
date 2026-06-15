// lib/anchorLoader.js
// ==========================================================================
// The board loader (deterministic, no model).
//
// WHAT IT DOES:
//   1. Reads the two monthly anchor files and the locked name-to-key map.
//   2. Orders the roster: the Top 100 first, in anchor order, then any
//      category-only brands (in a Top 15 but not the Top 100) after them.
//   3. Writes aiRank as that anchor position. The order is established by the
//      anchor, never by signals. Signals and analysis populate each brand
//      separately and never reorder the board.
//   4. Upserts a stub record for any roster brand not yet in the database, so
//      it appears on the board immediately in a collecting state and fills in
//      as the crons lap.
//   5. Clears aiRank on any brand no longer in the roster, so the board equals
//      the anchor exactly with no leftover ranks from earlier approaches.
//
// TREND DIRECTION (previousAiRank):
//   previousAiRank is snapshotted from the current aiRank ONLY when the prior
//   run was itself an anchor run (aiRuleVersion begins with "anchor"). On the
//   first anchor load every brand reads NEW, and real month-over-month
//   movement appears on the next monthly load. This avoids showing meaningless
//   movement from a retired ranking method. Additive, never deletes.
//
// SAFETY:
//   - Defaults to dry-run. Cannot write unless called with { dryRun: false }.
//   - If any anchor name fails to resolve through the map, it writes NOTHING
//     and returns a diagnostic. The board is never built from a partial map.
//   - Writes are non-destructive: signals, history, and analysis are never
//     touched. Stub creation fills only the schema-required fields.
// ==========================================================================

import { readFileSync } from 'node:fs';
import connectToDatabase from './db.js';
import BrandTrend from '../models/BrandTrend.js';

const fileUrl = (name) => new URL(name, import.meta.url);
const TOP100 = JSON.parse(readFileSync(fileUrl('./anchor-top100.json')));
const CATS = JSON.parse(readFileSync(fileUrl('./anchor-categories.json')));
const ANCHOR_MAP = JSON.parse(readFileSync(fileUrl('./anchor-map.json')));

// Provenance stamp written to every ranked brand, e.g. "anchor-2026-06".
const RULE_VERSION = `anchor-${(TOP100.meta && TOP100.meta.asOf) || 'unknown'}`;

// --------------------------------------------------------------------------
// Build the ordered roster: Top 100 first, then category-only brands.
// Returns [{ anchorName, source }] in board order, de-duplicated.
// --------------------------------------------------------------------------
function buildOrderedRoster() {
  const ordered = [];
  const seen = new Set();

  for (const name of TOP100.brands) {
    if (!seen.has(name)) {
      ordered.push({ anchorName: name, source: 'top100' });
      seen.add(name);
    }
  }
  for (const [catKey, cat] of Object.entries(CATS.categories)) {
    for (const name of cat.brands) {
      if (!seen.has(name)) {
        ordered.push({ anchorName: name, source: catKey });
        seen.add(name);
      }
    }
  }
  return ordered;
}

// --------------------------------------------------------------------------
// Main entry point.
//
// Options:
//   dryRun (default true): when true, resolves and orders the roster and
//     returns a summary without writing. When false, writes aiRank and the
//     anchor fields, upserts stubs, and clears stale ranks.
//
// Never throws to the caller; failures come back as { ok: false, ... }.
// --------------------------------------------------------------------------
export async function loadAnchorBoard({ dryRun = true } = {}) {
  try {
    await connectToDatabase();

    const map = ANCHOR_MAP.map || ANCHOR_MAP;
    const ordered = buildOrderedRoster();

    // Resolve every anchor name to its taxonomy key. A single miss aborts the
    // build, because a partial board is worse than no change.
    const resolved = [];
    const unresolved = [];
    for (const item of ordered) {
      const key = map[item.anchorName];
      if (!key) {
        unresolved.push(item.anchorName);
        continue;
      }
      resolved.push({ key, anchorName: item.anchorName, source: item.source });
    }

    if (unresolved.length > 0) {
      return {
        ok: false,
        error: `${unresolved.length} anchor name(s) did not resolve through the map; wrote nothing`,
        unresolved,
      };
    }

    resolved.forEach((r, i) => {
      r.aiRank = i + 1;
    });
    const rosterKeys = new Set(resolved.map((r) => r.key));

    // Current state, for the previous-rank snapshot and stale detection.
    const existing = await BrandTrend.find(
      {},
      { name: 1, aiRank: 1, aiRuleVersion: 1 }
    ).lean();
    const current = new Map(existing.map((e) => [e.name, e]));
    const stale = existing.filter(
      (e) => typeof e.aiRank === 'number' && !rosterKeys.has(e.name)
    );

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        version: RULE_VERSION,
        rosterSize: resolved.length,
        top100Count: resolved.filter((r) => r.source === 'top100').length,
        categoryOnlyCount: resolved.filter((r) => r.source !== 'top100').length,
        willClearStale: stale.length,
        firstFive: resolved.slice(0, 5).map((r) => ({ rank: r.aiRank, brand: r.anchorName, key: r.key })),
        firstCategoryOnly: resolved
          .filter((r) => r.source !== 'top100')
          .slice(0, 3)
          .map((r) => ({ rank: r.aiRank, brand: r.anchorName, from: r.source })),
      };
    }

    const now = new Date();
    let written = 0;
    for (const r of resolved) {
      const prev = current.get(r.key);
      const priorWasAnchor =
        prev &&
        typeof prev.aiRank === 'number' &&
        String(prev.aiRuleVersion || '').startsWith('anchor');
      const previousAiRank = priorWasAnchor ? prev.aiRank : null;

      await BrandTrend.findOneAndUpdate(
        { name: r.key },
        {
          $set: {
            aiRank: r.aiRank,
            previousAiRank,
            aiRationale: null,
            aiRankDate: now,
            aiRuleVersion: RULE_VERSION,
          },
          // Only used when the brand has no record yet. Fills the
          // schema-required fields so the stub validates; signals stay empty
          // until the collectors reach it.
          $setOnInsert: { rank: r.aiRank, weekOf: now },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      written += 1;
    }

    // Drop brands no longer in the roster off the board. Keep the record and
    // all its data; only the board rank is cleared.
    let cleared = 0;
    for (const e of stale) {
      await BrandTrend.findOneAndUpdate(
        { name: e.name },
        { $set: { aiRank: null } },
        { upsert: false }
      );
      cleared += 1;
    }

    return {
      ok: true,
      dryRun: false,
      version: RULE_VERSION,
      rosterSize: resolved.length,
      written,
      cleared,
    };
  } catch (error) {
    return { ok: false, error: `Unexpected error: ${error.message}` };
  }
}