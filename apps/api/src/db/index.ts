import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

const DB_PATH = process.env.DATABASE_URL ?? "./data/chess.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite: DatabaseType = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { sqlite };

export type DrizzleDb = typeof db;

export function createDb(path: string): { db: DrizzleDb; sqlite: DatabaseType } {
  mkdirSync(dirname(path), { recursive: true });
  const sqliteInstance = new Database(path);
  sqliteInstance.pragma("journal_mode = WAL");
  return { db: drizzle(sqliteInstance, { schema }), sqlite: sqliteInstance };
}

function bootstrapSchema(sqliteDb: DatabaseType): void {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    )
  `);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invite_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      white_player_id INTEGER REFERENCES users(id),
      black_player_id INTEGER REFERENCES users(id),
      fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      pgn TEXT NOT NULL DEFAULT '',
      current_turn TEXT NOT NULL DEFAULT 'white',
      clock_initial_time INTEGER NOT NULL DEFAULT 600,
      clock_increment INTEGER NOT NULL DEFAULT 0,
      draw_offer TEXT,
      result_winner TEXT,
      result_reason TEXT,
      clock_white_remaining INTEGER,
      clock_black_remaining INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  sqliteDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS games_invite_token_idx ON games(invite_token)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS games_white_player_id_idx ON games(white_player_id)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS games_black_player_id_idx ON games(black_player_id)");
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      move_number INTEGER NOT NULL,
      san TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  sqliteDb.exec(
    "CREATE INDEX IF NOT EXISTS moves_game_id_move_number_idx ON moves(game_id, move_number)",
  );
}

// Ensure tables exist on startup (safe on existing DB due to IF NOT EXISTS)
bootstrapSchema(sqlite);
