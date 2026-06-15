// scripts/run-loader.mjs
// ==========================================================================
// Runs the anchor board loader from the terminal.
//
//   Dry-run (default), writes nothing:
//     node --env-file=.env.local scripts/run-loader.mjs
//
//   Commit, writes the board:
//     node --env-file=.env.local scripts/run-loader.mjs --commit
//
// Run it once now to stand the board up, then again on the first of each
// month after uploading the new anchor files and regenerating the map.
// ==========================================================================

import mongoose from 'mongoose';
import { loadAnchorBoard } from '../lib/anchorLoader.js';

const commit = process.argv.includes('--commit');

const result = await loadAnchorBoard({ dryRun: !commit });
console.log(JSON.stringify(result, null, 2));

try {
  await mongoose.connection.close();
} catch {
  // ignore close errors
}
process.exit(result.ok ? 0 : 1);
