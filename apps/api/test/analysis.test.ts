import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/server.js";
import { ensureSchema, uniqueEmail, registerAndLogin, createAndJoinGame } from "./helpers.js";
import type { SerializedAnalysisNode } from "@chess/shared";

function makeAnalysisTree(): SerializedAnalysisNode {
  return {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    san: null,
    evaluation: null,
    classification: null,
    children: [
      {
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        san: "e4",
        evaluation: { score: { type: "cp", value: 30 }, bestLine: ["e5"], depth: 18 },
        classification: "best",
        children: [],
      },
    ],
  };
}

function makeAnalysisPayload() {
  return {
    analysisTree: makeAnalysisTree(),
    whiteAccuracy: 85.5,
    blackAccuracy: 72.3,
    engineDepth: 18,
  };
}

beforeAll(() => {
  ensureSchema();
});

describe("POST /api/games/:id/analysis", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with SaveAnalysisResponse for valid request", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analysis-post-ok-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analysis-post-ok-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
      payload: makeAnalysisPayload(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gameId).toBe(gameId);
    expect(typeof body.createdAt).toBe("number");
  });

  it("returns 401 without session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/games/1/analysis",
      payload: makeAnalysisPayload(),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user is not a participant", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analysis-post-403-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analysis-post-403-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("analysis-post-403-o"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c3 },
      payload: makeAnalysisPayload(),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBeDefined();
  });

  it("returns 404 when game does not exist", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("analysis-post-404"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/999999/analysis",
      headers: { cookie },
      payload: makeAnalysisPayload(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });
});

describe("GET /api/games/:id/analysis", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with GetAnalysisResponse after analysis is saved", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analysis-get-ok-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analysis-get-ok-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
      payload: makeAnalysisPayload(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.gameId).toBe(gameId);
    expect(body.analysisTree).toEqual(makeAnalysisTree());
    expect(body.whiteAccuracy).toBe(85.5);
    expect(body.blackAccuracy).toBe(72.3);
    expect(body.engineDepth).toBe(18);
    expect(typeof body.createdAt).toBe("number");
  });

  it("returns 404 when no analysis exists for the game", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analysis-get-404-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analysis-get-404-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const res = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });

  it("returns 404 when game does not exist", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("analysis-get-nogame"));

    const res = await app.inject({
      method: "GET",
      url: "/api/games/999999/analysis",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });

  it("returns 401 without session cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/games/1/analysis",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user is not a participant", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analysis-get-403-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analysis-get-403-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("analysis-get-403-o"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const res = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c3 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBeDefined();
  });
});

describe("Upsert behavior", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("second POST overwrites first — GET returns updated data", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analysis-upsert-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analysis-upsert-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
      payload: makeAnalysisPayload(),
    });

    const updatedTree = makeAnalysisTree();
    updatedTree.children.push({
      fen: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
      san: "d4",
      evaluation: { score: { type: "cp", value: 25 }, bestLine: ["d5"], depth: 18 },
      classification: "good",
      children: [],
    });

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
      payload: {
        analysisTree: updatedTree,
        whiteAccuracy: 92.0,
        blackAccuracy: 68.1,
        engineDepth: 20,
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.whiteAccuracy).toBe(92.0);
    expect(body.blackAccuracy).toBe(68.1);
    expect(body.engineDepth).toBe(20);
    expect(body.analysisTree).toEqual(updatedTree);
  });
});
