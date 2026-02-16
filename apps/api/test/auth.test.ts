import { describe, it, expect, afterEach } from "vitest";
import { createSession, getSession, destroySession } from "../src/auth/session.js";
import { buildApp } from "../src/server.js";

describe("session store", () => {
  it("createSession returns a UUID and getSession retrieves it", () => {
    const sessionId = createSession(42);
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
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
