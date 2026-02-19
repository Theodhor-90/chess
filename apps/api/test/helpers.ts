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
