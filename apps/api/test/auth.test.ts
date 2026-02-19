import { describe, it, expect, afterEach, beforeAll, beforeEach } from "vitest";
import { createSession, getSession, destroySession } from "../src/auth/session.js";
import { buildApp } from "../src/server.js";
import { sqlite } from "../src/db/index.js";

beforeAll(() => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    )
  `);
});

let emailCounter = 0;
const runId = Date.now();

function uniqueEmail(prefix: string): string {
  emailCounter += 1;
  return `${prefix}-${runId}-${emailCounter}@test.com`;
}

function extractSessionCookie(res: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("No set-cookie header found");
  return raw.split(";")[0];
}

async function registerUser(
  app: ReturnType<typeof buildApp>,
  email: string,
  password = "password123",
) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password },
  });
}

describe("session store", () => {
  it("createSession returns a UUID and getSession retrieves it", () => {
    const sessionId = createSession(42);
    expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const session = getSession(sessionId);
    expect(session).toEqual({ userId: 42 });
  });

  it("getSession returns undefined for unknown session", () => {
    expect(getSession("nonexistent")).toBeUndefined();
  });

  it("destroySession removes the session", () => {
    const sessionId = createSession(99);
    destroySession(sessionId);
    expect(getSession(sessionId)).toBeUndefined();
  });
});

describe("auth plugin", () => {
  let app: ReturnType<typeof buildApp>;

  afterEach(async () => {
    await app.close();
  });

  it("request.userId is null when no cookie is sent", async () => {
    app = buildApp();
    app.get("/test-auth", async (request) => {
      return { userId: request.userId };
    });

    const res = await app.inject({ method: "GET", url: "/test-auth" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: null });
  });

  it("request.userId is populated when a valid signed session cookie is sent", async () => {
    app = buildApp();
    const sessionId = createSession(7);

    app.get("/test-auth", async (request) => {
      return { userId: request.userId };
    });

    await app.ready();
    const cookieValue = app.signCookie(sessionId);

    const res = await app.inject({
      method: "GET",
      url: "/test-auth",
      cookies: { sessionId: cookieValue },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 7 });
  });

  it("request.userId is null when cookie signature is invalid", async () => {
    app = buildApp();
    app.get("/test-auth", async (request) => {
      return { userId: request.userId };
    });

    const res = await app.inject({
      method: "GET",
      url: "/test-auth",
      cookies: { sessionId: "tampered-value" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: null });
  });

  it("requireAuth returns 401 when not authenticated", async () => {
    app = buildApp();
    const { requireAuth } = await import("../src/auth/plugin.js");
    app.get("/protected", { preHandler: requireAuth }, async (request) => {
      return { userId: request.userId };
    });

    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("requireAuth passes when authenticated", async () => {
    app = buildApp();
    const { requireAuth } = await import("../src/auth/plugin.js");
    const sessionId = createSession(15);

    app.get("/protected", { preHandler: requireAuth }, async (request) => {
      return { userId: request.userId };
    });

    await app.ready();
    const cookieValue = app.signCookie(sessionId);

    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { sessionId: cookieValue },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 15 });
  });
});

describe("POST /api/auth/register", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 201 with user data and sets session cookie", async () => {
    const email = uniqueEmail("register-success");
    const res = await registerUser(app, email);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      user: { id: expect.any(Number), email },
    });

    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("sessionId=");
  });

  it("returns 409 when email is already registered", async () => {
    const email = uniqueEmail("register-dup");
    await registerUser(app, email);
    const res = await registerUser(app, email);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Email already taken" });
  });

  it("returns 400 when email is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { password: "password123" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: uniqueEmail("register-nopw") },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when password is shorter than 8 characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: uniqueEmail("register-short"), password: "short" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with user data and sets session cookie", async () => {
    const email = uniqueEmail("login-success");
    await registerUser(app, email, "password123");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: { id: expect.any(Number), email },
    });

    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("sessionId=");
  });

  it("returns 401 with generic error for wrong password", async () => {
    const email = uniqueEmail("login-wrongpw");
    await registerUser(app, email, "password123");

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "wrongpassword" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid email or password" });
  });

  it("returns 401 with generic error for unknown email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: uniqueEmail("login-unknown"), password: "password123" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Invalid email or password" });
  });
});

describe("POST /api/auth/logout", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("destroys session so /api/auth/me returns 401", async () => {
    const registerRes = await registerUser(app, uniqueEmail("logout-success"));
    const cookie = extractSessionCookie(registerRes);

    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(200);

    const meRes = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(401);
  });

  it("returns 200 even without a cookie (idempotent)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/auth/me", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with user data when authenticated", async () => {
    const email = uniqueEmail("me-authed");
    const registerRes = await registerUser(app, email);
    const cookie = extractSessionCookie(registerRes);

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: { id: expect.any(Number), email },
    });
  });

  it("returns 401 when no cookie is sent", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when cookie is bogus", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: "sessionId=bogus-not-a-real-cookie" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });
});
