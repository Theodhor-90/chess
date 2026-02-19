import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema.js";
import { buildApp } from "../src/server.js";
import type { DrizzleDb } from "../src/db/index.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, unlinkSync } from "node:fs";

let emailCounter = 0;
const runId = Date.now();

export function uniqueEmail(prefix: string): string {
  emailCounter += 1;
  return `${prefix}-${runId}-${emailCounter}@test.com`;
}

export function extractSessionCookie(res: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("No set-cookie header found");
  return raw.split(";")[0];
}

/**
 * Run DDL to create all tables on the given sqlite handle.
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to call multiple times.
 */
export function bootstrapSchema(sqliteHandle: DatabaseType): void {
  sqliteHandle.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    )
  `);
  sqliteHandle.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      invite_token TEXT NOT NULL,
      status TEXT DEFAULT 'waiting' NOT NULL,
      white_player_id INTEGER REFERENCES users(id),
      black_player_id INTEGER REFERENCES users(id),
      fen TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' NOT NULL,
      pgn TEXT DEFAULT '' NOT NULL,
      current_turn TEXT DEFAULT 'white' NOT NULL,
      clock_initial_time INTEGER DEFAULT 600 NOT NULL,
      clock_increment INTEGER DEFAULT 0 NOT NULL,
      draw_offer TEXT,
      result_winner TEXT,
      result_reason TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )
  `);
  sqliteHandle.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS games_invite_token_idx ON games(invite_token)
  `);
  sqliteHandle.exec(`
    CREATE INDEX IF NOT EXISTS games_white_player_id_idx ON games(white_player_id)
  `);
  sqliteHandle.exec(`
    CREATE INDEX IF NOT EXISTS games_black_player_id_idx ON games(black_player_id)
  `);
  sqliteHandle.exec(`
    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      game_id INTEGER NOT NULL REFERENCES games(id),
      move_number INTEGER NOT NULL,
      san TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )
  `);
  sqliteHandle.exec(`
    CREATE INDEX IF NOT EXISTS moves_game_id_move_number_idx ON moves(game_id, move_number)
  `);
}

/**
 * Delete all rows from games and moves tables on the given sqlite handle.
 * Deletes moves first to respect FK ordering.
 */
export function cleanTables(sqliteHandle: DatabaseType): void {
  sqliteHandle.exec(`DELETE FROM moves`);
  sqliteHandle.exec(`DELETE FROM games`);
}

/**
 * Create a fresh in-memory SQLite database with the full schema bootstrapped.
 * Returns a Drizzle db instance, the raw sqlite handle, and a close function.
 * Use this for test isolation - each test file gets its own in-memory DB.
 */
export function createInMemoryDb(): {
  db: DrizzleDb;
  sqlite: DatabaseType;
  close: () => void;
} {
  const sqliteConn = new Database(":memory:");
  sqliteConn.pragma("foreign_keys = OFF");
  const drizzleDb = drizzle(sqliteConn, { schema }) as unknown as DrizzleDb;
  bootstrapSchema(sqliteConn);
  return { db: drizzleDb, sqlite: sqliteConn, close: () => sqliteConn.close() };
}

let tempFileCounter = 0;

/**
 * Create an on-disk SQLite database in a temp directory with the full schema bootstrapped.
 * Returns the db, sqlite handle, file path, and a cleanup function that closes the
 * connection and deletes the file.
 *
 * Use this for persistence tests that need to open a second independent connection
 * to the same file, proving data survives across connections.
 */
export function createTestDbOnDisk(): {
  db: DrizzleDb;
  sqlite: DatabaseType;
  filePath: string;
  cleanup: () => void;
} {
  const dir = join(tmpdir(), "chess-test");
  mkdirSync(dir, { recursive: true });
  tempFileCounter += 1;
  const filePath = join(dir, `test-${runId}-${tempFileCounter}.db`);
  const sqliteConn = new Database(filePath);
  sqliteConn.pragma("journal_mode = WAL");
  sqliteConn.pragma("foreign_keys = OFF");
  const drizzleDb = drizzle(sqliteConn, { schema }) as unknown as DrizzleDb;
  bootstrapSchema(sqliteConn);
  return {
    db: drizzleDb,
    sqlite: sqliteConn,
    filePath,
    cleanup: () => {
      sqliteConn.close();
      try {
        unlinkSync(filePath);
        unlinkSync(filePath + "-wal");
        unlinkSync(filePath + "-shm");
      } catch {
        // Files may not exist - ignore
      }
    },
  };
}

export async function registerAndLogin(
  app: ReturnType<typeof buildApp>,
  email: string,
  password = "password123",
): Promise<{ cookie: string; userId: number }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Registration failed: ${res.statusCode} ${res.body}`);
  }
  const cookie = extractSessionCookie(res);
  const userId = res.json().user.id as number;
  return { cookie, userId };
}

export async function createAndJoinGame(
  app: ReturnType<typeof buildApp>,
  creatorCookie: string,
  joinerCookie: string,
): Promise<{ gameId: number; inviteToken: string; creatorColor: string }> {
  const createRes = await app.inject({
    method: "POST",
    url: "/api/games",
    headers: { cookie: creatorCookie },
    payload: {},
  });
  if (createRes.statusCode !== 201) {
    throw new Error(`Create game failed: ${createRes.statusCode} ${createRes.body}`);
  }
  const { gameId, inviteToken, color: creatorColor } = createRes.json();

  const joinRes = await app.inject({
    method: "POST",
    url: `/api/games/${gameId}/join`,
    headers: { cookie: joinerCookie },
    payload: { inviteToken },
  });
  if (joinRes.statusCode !== 200) {
    throw new Error(`Join game failed: ${joinRes.statusCode} ${joinRes.body}`);
  }

  return { gameId, inviteToken, creatorColor };
}
