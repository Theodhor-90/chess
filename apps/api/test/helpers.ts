import { buildApp } from "../src/server.js";
import { sqlite } from "../src/db/index.js";

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
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      game_id INTEGER NOT NULL REFERENCES games(id),
      move_number INTEGER NOT NULL,
      san TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS moves_game_id_move_number_idx ON moves(game_id, move_number)
  `);
}

export function ensureAllTables(): void {
  ensureUsersTable();
  ensureGamesTables();
}

export function cleanGamesTables(): void {
  sqlite.exec(`DELETE FROM moves`);
  sqlite.exec(`DELETE FROM games`);
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
