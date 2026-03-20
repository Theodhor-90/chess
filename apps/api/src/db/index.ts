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
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      preferences TEXT
    )
  `);
  try {
    sqliteDb.exec(`ALTER TABLE users ADD COLUMN preferences TEXT`);
  } catch {
    // Column already exists — ignore
  }
  try {
    sqliteDb.exec(`ALTER TABLE users ADD COLUMN puzzle_rating INTEGER NOT NULL DEFAULT 1500`);
  } catch {
    // Column already exists — ignore
  }
  try {
    sqliteDb.exec(
      `ALTER TABLE users ADD COLUMN puzzle_rating_deviation INTEGER NOT NULL DEFAULT 350`,
    );
  } catch {
    // Column already exists — ignore
  }
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
      bot_level INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  sqliteDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS games_invite_token_idx ON games(invite_token)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS games_white_player_id_idx ON games(white_player_id)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS games_black_player_id_idx ON games(black_player_id)");
  try {
    sqliteDb.exec(`ALTER TABLE games ADD COLUMN bot_level INTEGER`);
  } catch {
    // Column already exists — ignore
  }
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
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS game_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      analysis_tree TEXT NOT NULL,
      white_accuracy REAL NOT NULL,
      black_accuracy REAL NOT NULL,
      engine_depth INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  sqliteDb.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS game_analyses_game_id_idx ON game_analyses(game_id)",
  );
  sqliteDb.exec(`
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
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS puzzles_rating_idx ON puzzles(rating)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS puzzles_popularity_idx ON puzzles(popularity)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS puzzles_themes_idx ON puzzles(themes)");
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS puzzle_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      puzzle_id TEXT NOT NULL,
      solved INTEGER NOT NULL,
      user_rating_before INTEGER NOT NULL,
      user_rating_after INTEGER NOT NULL,
      puzzle_rating INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  sqliteDb.exec(
    "CREATE INDEX IF NOT EXISTS puzzle_attempts_user_id_idx ON puzzle_attempts(user_id)",
  );
  sqliteDb.exec(
    "CREATE INDEX IF NOT EXISTS puzzle_attempts_user_id_created_at_idx ON puzzle_attempts(user_id, created_at)",
  );
  try {
    sqliteDb.exec(`ALTER TABLE games ADD COLUMN opening_eco TEXT`);
  } catch {
    // Column already exists — ignore
  }
  try {
    sqliteDb.exec(`ALTER TABLE games ADD COLUMN opening_name TEXT`);
  } catch {
    // Column already exists — ignore
  }
  sqliteDb.exec(`
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
  sqliteDb.exec(`
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
  sqliteDb.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS opening_position_moves_fen_san_idx ON opening_position_moves(position_fen, move_san)",
  );
  sqliteDb.exec(
    "CREATE INDEX IF NOT EXISTS opening_position_moves_fen_idx ON opening_position_moves(position_fen)",
  );
}

// Ensure tables exist on startup (safe on existing DB due to IF NOT EXISTS)
bootstrapSchema(sqlite);
