import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { parsePuzzleCsvStream } from "../services/csv-puzzle-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");

const csvPath = process.argv[2];

if (!csvPath) {
  console.error("Usage: import-puzzles <path-to-csv-file>");
  process.exit(1);
}

const resolvedCsvPath = resolve(PROJECT_ROOT, csvPath);

if (!existsSync(resolvedCsvPath)) {
  console.error(`Error: file not found: ${resolvedCsvPath}`);
  process.exit(1);
}

const dbPath = process.env.DATABASE_URL ?? resolve(PROJECT_ROOT, "apps", "api", "data", "chess.db");
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

function bootstrapPuzzlesSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      puzzle_id TEXT NOT NULL UNIQUE,
      fen TEXT NOT NULL,
      moves TEXT NOT NULL,
      rating INTEGER NOT NULL,
      rating_deviation INTEGER NOT NULL,
      popularity INTEGER NOT NULL,
      nb_plays INTEGER NOT NULL,
      themes TEXT NOT NULL,
      game_url TEXT NOT NULL,
      opening_tags TEXT
    )
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS puzzles_rating_idx ON puzzles(rating)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS puzzles_popularity_idx ON puzzles(popularity)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS puzzles_themes_idx ON puzzles(themes)");
}

bootstrapPuzzlesSchema();

const insertStmt = sqlite.prepare(`
  INSERT OR IGNORE INTO puzzles
    (puzzle_id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, game_url, opening_tags)
  VALUES
    (@puzzleId, @fen, @moves, @rating, @ratingDeviation, @popularity, @nbPlays, @themes, @gameUrl, @openingTags)
`);

interface PuzzleRow {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string;
  gameUrl: string;
  openingTags: string | null;
}

const BATCH_SIZE = 1000;
const PROGRESS_INTERVAL = 100000;

let totalInserted = 0;
let totalDuplicates = 0;
let batch: PuzzleRow[] = [];
let puzzlesSeen = 0;
const startTime = performance.now();

function flushBatch(): void {
  if (batch.length === 0) return;
  const currentBatch = batch;
  batch = [];

  try {
    let batchInserted = 0;
    sqlite.transaction(() => {
      for (const row of currentBatch) {
        const result = insertStmt.run(row);
        batchInserted += result.changes;
      }
    })();
    totalInserted += batchInserted;
    totalDuplicates += currentBatch.length - batchInserted;
  } catch (err) {
    console.error(`Batch insert error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

await parsePuzzleCsvStream(resolvedCsvPath, (puzzle) => {
  puzzlesSeen++;

  batch.push(puzzle);

  if (batch.length >= BATCH_SIZE) {
    flushBatch();
  }

  if (puzzlesSeen % PROGRESS_INTERVAL === 0) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`Processed ${puzzlesSeen} puzzles (elapsed: ${elapsed}s)`);
  }
});

flushBatch();

const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
console.log(
  `Done. Imported ${totalInserted} puzzles in ${elapsed}s (${totalDuplicates} duplicates skipped)`,
);

sqlite.close();
