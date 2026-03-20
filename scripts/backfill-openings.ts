import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// Set DATABASE_URL before any imports that use it
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? resolve(PROJECT_ROOT, "apps", "api", "data", "chess.db");

// Dynamic import after setting env var
const { tagGameOpening, aggregatePlatformGame } =
  await import("../apps/api/src/explorer/service.js");
const { sqlite } = await import("../apps/api/src/db/index.js");

// --- Find all completed games with no opening tag ---

const TERMINAL_STATUSES = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

interface GameRow {
  id: number;
  status: string;
  opening_eco: string | null;
}

const gamesToProcess = sqlite
  .prepare(
    `SELECT id, status, opening_eco FROM games
     WHERE status IN (${TERMINAL_STATUSES.map(() => "?").join(", ")})
     AND opening_eco IS NULL`,
  )
  .all(...TERMINAL_STATUSES) as GameRow[];

console.log(`Found ${gamesToProcess.length} completed games to backfill.`);

let processed = 0;
let tagged = 0;
let aggregated = 0;
let errors = 0;
const startTime = performance.now();

for (const game of gamesToProcess) {
  try {
    tagGameOpening(game.id);
    tagged++;
  } catch (err) {
    console.error(`Failed to tag game ${game.id}:`, err);
    errors++;
  }

  try {
    aggregatePlatformGame(game.id);
    aggregated++;
  } catch (err) {
    console.error(`Failed to aggregate game ${game.id}:`, err);
    errors++;
  }

  processed++;
  if (processed % 100 === 0) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`[${processed}/${gamesToProcess.length}] ${elapsed}s`);
  }
}

const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
console.log(`\nBackfill complete.`);
console.log(`  Games processed: ${processed}`);
console.log(`  Games tagged: ${tagged}`);
console.log(`  Games aggregated: ${aggregated}`);
console.log(`  Errors: ${errors}`);
console.log(`  Time: ${elapsed}s`);
