import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { buildApp } from "../src/server.js";
import { sqlite } from "../src/db/index.js";

beforeAll(() => {
  sqlite.exec(`
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
    sqlite.exec(`ALTER TABLE users ADD COLUMN preferences TEXT`);
  } catch {
    // Column already exists
  }
});

let counter = 0;
const shortId = randomBytes(3).toString("hex");

function uniqueEmail(): string {
  counter += 1;
  return `pref-${shortId}-${counter}@test.com`;
}

function uniqueUsername(): string {
  counter += 1;
  return `pref_${shortId}_${counter}`;
}

function extractSessionCookie(res: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("No set-cookie header found");
  return raw.split(";")[0];
}

async function registerAndGetCookie(app: ReturnType<typeof buildApp>["app"]): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: uniqueEmail(),
      username: uniqueUsername(),
      password: "password123",
    },
  });
  expect(res.statusCode).toBe(201);
  return extractSessionCookie(res);
}

describe("User Preferences API", () => {
  it("GET /api/users/me/preferences returns defaults when no preferences saved", async () => {
    const { app } = buildApp();
    await app.ready();
    const cookie = await registerAndGetCookie(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/users/me/preferences",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { preferences: Record<string, string> };
    expect(body.preferences).toEqual({
      theme: "light",
      boardTheme: "brown",
      pieceTheme: "cburnett",
    });

    await app.close();
  });

  it("PUT /api/users/me/preferences saves and returns preferences", async () => {
    const { app } = buildApp();
    await app.ready();
    const cookie = await registerAndGetCookie(app);

    const res = await app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: { cookie },
      payload: {
        preferences: {
          theme: "dark",
          boardTheme: "blue",
          pieceTheme: "merida",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { preferences: Record<string, string> };
    expect(body.preferences).toEqual({
      theme: "dark",
      boardTheme: "blue",
      pieceTheme: "merida",
    });

    await app.close();
  });

  it("GET returns saved preferences after PUT", async () => {
    const { app } = buildApp();
    await app.ready();
    const cookie = await registerAndGetCookie(app);

    await app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: { cookie },
      payload: {
        preferences: {
          theme: "system",
          boardTheme: "green",
          pieceTheme: "california",
        },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/users/me/preferences",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { preferences: Record<string, string> };
    expect(body.preferences).toEqual({
      theme: "system",
      boardTheme: "green",
      pieceTheme: "california",
    });

    await app.close();
  });

  it("PUT overwrites previous preferences", async () => {
    const { app } = buildApp();
    await app.ready();
    const cookie = await registerAndGetCookie(app);

    await app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: { cookie },
      payload: {
        preferences: {
          theme: "dark",
          boardTheme: "blue",
          pieceTheme: "merida",
        },
      },
    });

    await app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: { cookie },
      payload: {
        preferences: {
          theme: "light",
          boardTheme: "ic",
          pieceTheme: "alpha",
        },
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/users/me/preferences",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { preferences: Record<string, string> };
    expect(body.preferences).toEqual({
      theme: "light",
      boardTheme: "ic",
      pieceTheme: "alpha",
    });

    await app.close();
  });

  it("PUT rejects invalid theme values", async () => {
    const { app } = buildApp();
    await app.ready();
    const cookie = await registerAndGetCookie(app);

    const res = await app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: { cookie },
      payload: {
        preferences: {
          theme: "invalid",
          boardTheme: "blue",
          pieceTheme: "merida",
        },
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("PUT rejects missing fields", async () => {
    const { app } = buildApp();
    await app.ready();
    const cookie = await registerAndGetCookie(app);

    const res = await app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      headers: { cookie },
      payload: {
        preferences: {
          theme: "dark",
        },
      },
    });

    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("GET requires authentication", async () => {
    const { app } = buildApp();
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/users/me/preferences",
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("PUT requires authentication", async () => {
    const { app } = buildApp();
    await app.ready();

    const res = await app.inject({
      method: "PUT",
      url: "/api/users/me/preferences",
      payload: {
        preferences: {
          theme: "dark",
          boardTheme: "blue",
          pieceTheme: "merida",
        },
      },
    });

    expect(res.statusCode).toBe(401);

    await app.close();
  });
});
