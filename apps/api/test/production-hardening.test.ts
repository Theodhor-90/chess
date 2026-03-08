import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/server.js";
import { sqlite } from "../src/db/index.js";

// Ensure tables exist for test DB
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  )
`);

let emailCounter = 0;
const runId = Date.now();

function uniqueEmail(prefix: string): string {
  emailCounter += 1;
  return `${prefix}-${runId}-${emailCounter}@test.com`;
}

function extractSetCookieHeader(res: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const setCookie = res.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error("No set-cookie header found");
  return raw;
}

function extractSessionCookie(res: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  return extractSetCookieHeader(res).split(";")[0];
}

describe("production hardening", () => {
  let app: ReturnType<typeof buildApp>["app"];
  let savedNodeEnv: string | undefined;
  let savedCorsOrigin: string | undefined;
  let savedSessionSecret: string | undefined;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    savedCorsOrigin = process.env.CORS_ORIGIN;
    savedSessionSecret = process.env.SESSION_SECRET;
  });

  afterEach(async () => {
    // Restore environment
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    if (savedCorsOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = savedCorsOrigin;
    }
    if (savedSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = savedSessionSecret;
    }
    await app.close();
  });

  describe("secure cookies", () => {
    it("cookies include Secure flag when NODE_ENV=production", async () => {
      process.env.NODE_ENV = "production";
      process.env.SESSION_SECRET = "test-secret-for-production-hardening-tests";
      ({ app } = buildApp());

      const email = uniqueEmail("secure-cookie");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email, password: "password123" },
      });

      expect(res.statusCode).toBe(201);
      const setCookieHeader = extractSetCookieHeader(res);
      expect(setCookieHeader.toLowerCase()).toContain("secure");
    });

    it("cookies do not include Secure flag when NODE_ENV is not production", async () => {
      delete process.env.NODE_ENV;
      ({ app } = buildApp());

      const email = uniqueEmail("no-secure-cookie");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email, password: "password123" },
      });

      expect(res.statusCode).toBe(201);
      const setCookieHeader = extractSetCookieHeader(res);
      expect(setCookieHeader.toLowerCase()).not.toContain("secure");
    });

    it("logout clearCookie uses matching options (includes Secure in production)", async () => {
      process.env.NODE_ENV = "production";
      process.env.SESSION_SECRET = "test-secret-for-production-hardening-tests";
      ({ app } = buildApp());

      const email = uniqueEmail("logout-secure");
      const registerRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email, password: "password123" },
      });
      const cookie = extractSessionCookie(registerRes);

      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { cookie },
      });

      expect(logoutRes.statusCode).toBe(200);
      const setCookieHeader = extractSetCookieHeader(logoutRes);
      expect(setCookieHeader.toLowerCase()).toContain("secure");
    });
  });

  describe("CORS", () => {
    it("allows any origin when CORS_ORIGIN is not set", async () => {
      delete process.env.CORS_ORIGIN;
      ({ app } = buildApp());

      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "http://localhost:5173" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("restricts to CORS_ORIGIN when set", async () => {
      process.env.CORS_ORIGIN = "https://chess-platform.fly.dev";
      ({ app } = buildApp());

      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://chess-platform.fly.dev" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe("https://chess-platform.fly.dev");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("rejects different origin when CORS_ORIGIN is set", async () => {
      process.env.CORS_ORIGIN = "https://chess-platform.fly.dev";
      ({ app } = buildApp());

      const res = await app.inject({
        method: "GET",
        url: "/health",
        headers: { origin: "https://evil.com" },
      });

      expect(res.statusCode).toBe(200);
      // When CORS_ORIGIN is set to a specific string and the request origin doesn't match,
      // @fastify/cors will not include the access-control-allow-origin header
      expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.com");
    });
  });
});
