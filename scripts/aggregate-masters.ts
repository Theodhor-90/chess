import Database, { type Database as DatabaseType } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOpenings, classifyPosition } from "@chess/shared";
import {
  aggregateMastersGame,
  upsertMastersPositionStats,
  upsertMastersMoveStats,
} from "../apps/api/src/explorer/aggregation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// --- Database connections ---

const gamesDbPath = process.env.GAMES_DB_PATH ?? resolve(PROJECT_ROOT, "databases", "games.db");
const mainDbPath =
  process.env.DATABASE_URL ?? resolve(PROJECT_ROOT, "apps", "api", "data", "chess.db");

const gamesDbSqlite: DatabaseType = new Database(gamesDbPath, { readonly: true });
gamesDbSqlite.pragma("journal_mode = WAL");

mkdirSync(dirname(mainDbPath), { recursive: true });
const mainDbSqlite: DatabaseType = new Database(mainDbPath);
mainDbSqlite.pragma("journal_mode = WAL");

// --- Bootstrap opening_positions and opening_position_moves tables ---

function bootstrapExplorerSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opening_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_fen TEXT NOT NULL UNIQUE,
      eco TEXT,
      opening_name TEXT,
      master_white INTEGER NOT NULL DEFAULT 0,
      master_draws INTEGER NOT NULL DEFAULT 0,
      master_black INTEGER NOT NULL DEFAULT 0,
      master_total_games INTEGER NOT NULL DEFAULT 0,
      master_avg_rating INTEGER NOT NULL DEFAULT 0,
      platform_stats TEXT NOT NULL DEFAULT '{}'
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS opening_position_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_fen TEXT NOT NULL,
      move_san TEXT NOT NULL,
      move_uci TEXT NOT NULL,
      result_fen TEXT NOT NULL,
      master_white INTEGER NOT NULL DEFAULT 0,
      master_draws INTEGER NOT NULL DEFAULT 0,
      master_black INTEGER NOT NULL DEFAULT 0,
      master_total_games INTEGER NOT NULL DEFAULT 0,
      master_avg_rating INTEGER NOT NULL DEFAULT 0,
      platform_stats TEXT NOT NULL DEFAULT '{}'
    )
  `);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS opening_position_moves_fen_san_idx ON opening_position_moves(position_fen, move_san)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS opening_position_moves_fen_idx ON opening_position_moves(position_fen)",
  );
}

bootstrapExplorerSchema(mainDbSqlite);

// --- Load openings map ---

const openingsMap = loadOpenings();
console.log(`Loaded ${openingsMap.size} openings for classification.`);

// --- Read all games from the games database ---

interface DatabaseGameRow {
  id: number;
  pgn: string;
  white_elo: number;
  black_elo: number;
  result: string;
}

// Check if the database_games table exists
const tableExists = gamesDbSqlite
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'database_games'")
  .get();

if (!tableExists) {
  console.error("Error: database_games table not found in the games database.");
  console.error(`Checked path: ${gamesDbPath}`);
  gamesDbSqlite.close();
  mainDbSqlite.close();
  process.exit(1);
}

const countResult = gamesDbSqlite.prepare("SELECT COUNT(*) as count FROM database_games").get() as {
  count: number;
};
const totalGames = countResult.count;
console.log(`Found ${totalGames} games to process.`);

const BATCH_SIZE = 1000;
const PROGRESS_INTERVAL = 5000;
let gamesProcessed = 0;
let positionsIndexed = 0;
let movesIndexed = 0;
let gamesSkipped = 0;
const startTime = performance.now();

// Process games in batches using LIMIT/OFFSET
let offset = 0;
const selectGamesStmt = gamesDbSqlite.prepare(
  "SELECT id, pgn, white_elo, black_elo, result FROM database_games LIMIT ? OFFSET ?",
);

while (offset < totalGames) {
  const rows = selectGamesStmt.all(BATCH_SIZE, offset) as DatabaseGameRow[];
  if (rows.length === 0) break;

  // Execute all upserts for this batch in a single transaction
  mainDbSqlite.transaction(() => {
    for (const row of rows) {
      const pairs = aggregateMastersGame(row.pgn, row.white_elo, row.black_elo, row.result);

      if (pairs.length === 0) {
        gamesSkipped++;
        gamesProcessed++;
        continue;
      }

      const avgElo = Math.round((row.white_elo + row.black_elo) / 2);

      // Collect unique positions from this game to avoid double-counting
      const seenPositions = new Set<string>();

      for (const pair of pairs) {
        // Upsert position (only once per unique position per game)
        if (!seenPositions.has(pair.positionFen)) {
          seenPositions.add(pair.positionFen);
          const opening = classifyPosition(pair.positionFen, openingsMap);
          upsertMastersPositionStats(mainDbSqlite, pair.positionFen, opening, row.result, avgElo);
          positionsIndexed++;
        }

        // Also index the result position (the last FEN in the sequence)
        if (!seenPositions.has(pair.resultFen)) {
          seenPositions.add(pair.resultFen);
          const opening = classifyPosition(pair.resultFen, openingsMap);
          upsertMastersPositionStats(mainDbSqlite, pair.resultFen, opening, row.result, avgElo);
          positionsIndexed++;
        }

        // Upsert move
        upsertMastersMoveStats(
          mainDbSqlite,
          pair.positionFen,
          pair.moveSan,
          pair.moveUci,
          pair.resultFen,
          row.result,
          avgElo,
        );
        movesIndexed++;
      }

      gamesProcessed++;

      if (gamesProcessed % PROGRESS_INTERVAL === 0) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        const pct = ((gamesProcessed / totalGames) * 100).toFixed(1);
        console.log(
          `[${pct}%] ${gamesProcessed}/${totalGames} games | ${positionsIndexed} positions | ${movesIndexed} moves | ${elapsed}s`,
        );
      }
    }
  })();

  offset += rows.length;
}

// --- Summary ---

const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

const positionCount = (
  mainDbSqlite.prepare("SELECT COUNT(*) as count FROM opening_positions").get() as {
    count: number;
  }
).count;

const moveCount = (
  mainDbSqlite.prepare("SELECT COUNT(*) as count FROM opening_position_moves").get() as {
    count: number;
  }
).count;

console.log(`\nAggregation complete.`);
console.log(`  Games processed: ${gamesProcessed}`);
console.log(`  Games skipped (invalid PGN): ${gamesSkipped}`);
console.log(`  Unique positions in DB: ${positionCount}`);
console.log(`  Unique moves in DB: ${moveCount}`);
console.log(`  Time: ${elapsed}s`);

gamesDbSqlite.close();
mainDbSqlite.close();
