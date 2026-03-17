import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { parsePgnStream } from "../services/pgn-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");

const pgnPath = process.argv[2];

if (!pgnPath) {
  console.error("Usage: import-pgn <path-to-pgn-file>");
  process.exit(1);
}

const resolvedPgnPath = resolve(PROJECT_ROOT, pgnPath);

if (!existsSync(resolvedPgnPath)) {
  console.error(`Error: file not found: ${resolvedPgnPath}`);
  process.exit(1);
}

const dbPath = process.env.GAMES_DB_PATH ?? resolve(PROJECT_ROOT, "databases", "games.db");
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// DDL must stay in sync with apps/api/src/db/games-db-schema.ts
function bootstrapGamesSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS database_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      white TEXT NOT NULL,
      black TEXT NOT NULL,
      white_elo INTEGER NOT NULL,
      black_elo INTEGER NOT NULL,
      result TEXT NOT NULL,
      eco TEXT,
      opening TEXT,
      date TEXT,
      time_control TEXT,
      termination TEXT,
      lichess_url TEXT NOT NULL UNIQUE,
      pgn TEXT NOT NULL
    )
  `);
  sqlite.exec("CREATE INDEX IF NOT EXISTS database_games_white_idx ON database_games(white)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS database_games_black_idx ON database_games(black)");
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS database_games_white_elo_idx ON database_games(white_elo)",
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS database_games_black_elo_idx ON database_games(black_elo)",
  );
  sqlite.exec("CREATE INDEX IF NOT EXISTS database_games_result_idx ON database_games(result)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS database_games_eco_idx ON database_games(eco)");
  sqlite.exec("CREATE INDEX IF NOT EXISTS database_games_date_idx ON database_games(date)");
}

bootstrapGamesSchema();

const insertStmt = sqlite.prepare(`
  INSERT OR IGNORE INTO database_games
    (white, black, white_elo, black_elo, result, eco, opening, date, time_control, termination, lichess_url, pgn)
  VALUES
    (@white, @black, @whiteElo, @blackElo, @result, @eco, @opening, @date, @timeControl, @termination, @lichessUrl, @pgn)
`);

interface GameRow {
  white: string;
  black: string;
  whiteElo: number;
  blackElo: number;
  result: string;
  eco: string | null;
  opening: string | null;
  date: string | null;
  timeControl: string | null;
  termination: string | null;
  lichessUrl: string;
  pgn: string;
}

const BATCH_SIZE = 1000;
const PROGRESS_INTERVAL = 10000;

let totalInserted = 0;
let totalDuplicates = 0;
let batch: GameRow[] = [];
let gamesSeen = 0;
const startTime = performance.now();

function parseElo(value: string | undefined): number {
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

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

await parsePgnStream(resolvedPgnPath, (game) => {
  gamesSeen++;

  const lichessUrl = game.headers["LichessURL"] ?? game.headers["Site"] ?? "";
  if (!lichessUrl) return;

  batch.push({
    white: game.headers["White"] ?? "Unknown",
    black: game.headers["Black"] ?? "Unknown",
    whiteElo: parseElo(game.headers["WhiteElo"]),
    blackElo: parseElo(game.headers["BlackElo"]),
    result: game.headers["Result"] ?? "*",
    eco: game.headers["ECO"] ?? null,
    opening: game.headers["Opening"] ?? null,
    date: game.headers["Date"] ?? null,
    timeControl: game.headers["TimeControl"] ?? null,
    termination: game.headers["Termination"] ?? null,
    lichessUrl,
    pgn: game.rawPgn,
  });

  if (batch.length >= BATCH_SIZE) {
    flushBatch();
  }

  if (gamesSeen % PROGRESS_INTERVAL === 0) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`Processed ${gamesSeen} games (elapsed: ${elapsed}s)`);
  }
});

flushBatch();

const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
console.log(
  `Done. Imported ${totalInserted} games in ${elapsed}s (${totalDuplicates} duplicates skipped)`,
);

sqlite.close();
