import { describe, it, expect, afterEach } from "vitest";
import { buildApp } from "../src/server.js";

describe("GET /health", () => {
  let app: ReturnType<typeof buildApp>["app"];

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with { status: ok }", async () => {
    ({ app } = buildApp());
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
