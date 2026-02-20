import { buildApp } from "../src/server.js";
import { sqlite } from "../src/db/index.js";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@chess/shared";

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

export function ensureUsersTable(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    )
  `);
}

export function ensureGamesTables(): void {
  sqlite.exec(`
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
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS games_invite_token_idx ON games(invite_token)
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS games_white_player_id_idx ON games(white_player_id)
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS games_black_player_id_idx ON games(black_player_id)
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      move_number INTEGER NOT NULL,
      san TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS moves_game_id_move_number_idx ON moves(game_id, move_number)
  `);
}

export function ensureSchema(): void {
  ensureUsersTable();
  ensureGamesTables();
}

export function cleanGamesTables(): void {
  sqlite.exec("DELETE FROM moves");
  sqlite.exec("DELETE FROM games");
}

/**
 * Insert a user row directly into the DB so that FK constraints on
 * games.white_player_id / black_player_id are satisfied in unit tests
 * that bypass the HTTP registration flow.
 * Uses INSERT OR IGNORE so it's safe to call multiple times with the same id.
 */
export function seedTestUser(id: number): void {
  sqlite.exec(
    `INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (${id}, 'test-user-${id}@seed.local', 'no-password')`,
  );
}

export async function registerAndLogin(
  app: ReturnType<typeof buildApp>["app"],
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
  app: ReturnType<typeof buildApp>["app"],
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

export type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export function createSocketClient(port: number, cookie: string): TypedClientSocket {
  return ioc(`http://127.0.0.1:${port}`, {
    extraHeaders: { cookie },
    transports: ["websocket"],
    autoConnect: true,
  });
}
