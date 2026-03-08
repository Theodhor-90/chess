import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/server.js";

describe("static file serving", () => {
  let tmpDir: string;
  let app: ReturnType<typeof buildApp>["app"];
  const indexContent = "<!doctype html><html><body>Mock SPA</body></html>";

  beforeAll(() => {
    tmpDir = join(tmpdir(), `chess-static-test-${randomUUID()}`);
    mkdirSync(join(tmpDir, "assets"), { recursive: true });
    writeFileSync(join(tmpDir, "index.html"), indexContent, "utf-8");
    writeFileSync(join(tmpDir, "assets", "test.js"), "console.log('test');", "utf-8");
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET / returns index.html", async () => {
    ({ app } = buildApp({ staticDir: tmpDir }));
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(indexContent);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("GET /assets/test.js returns the static asset", async () => {
    ({ app } = buildApp({ staticDir: tmpDir }));
    const res = await app.inject({ method: "GET", url: "/assets/test.js" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("console.log('test');");
  });

  it("GET /game/123 (SPA route) returns index.html", async () => {
    ({ app } = buildApp({ staticDir: tmpDir }));
    const res = await app.inject({ method: "GET", url: "/game/123" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(indexContent);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("GET /login (SPA route) returns index.html", async () => {
    ({ app } = buildApp({ staticDir: tmpDir }));
    const res = await app.inject({ method: "GET", url: "/login" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(indexContent);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("GET /api/nonexistent returns 404 JSON error", async () => {
    ({ app } = buildApp({ staticDir: tmpDir }));
    const res = await app.inject({ method: "GET", url: "/api/nonexistent" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not found" });
  });

  it("GET /socket.io/nonexistent returns 404 JSON error", async () => {
    ({ app } = buildApp({ staticDir: tmpDir }));
    const res = await app.inject({ method: "GET", url: "/socket.io/nonexistent" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not found" });
  });

  it("GET /health still returns { status: 'ok' }", async () => {
    ({ app } = buildApp({ staticDir: tmpDir }));
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
