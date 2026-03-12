import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import type { EvaluationResult } from "@chess/shared";
import { ensureSchema, uniqueEmail, registerAndLogin, createAndJoinGame } from "./helpers.js";

const mockEvaluate = vi.fn<(fen: string, depth?: number) => Promise<EvaluationResult>>();

vi.mock("../src/engine/uci-engine.js", () => ({
  UciEngine: vi.fn(),
}));

vi.mock("../src/engine/engine-pool.js", () => {
  return {
    EnginePool: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      evaluate: mockEvaluate,
      shutdown: vi.fn(),
      get size() {
        return 1;
      },
      get pendingRequests() {
        return 0;
      },
    })),
  };
});

import { buildApp } from "../src/server.js";

function makeEvalResult(cpValue: number): EvaluationResult {
  return {
    score: { type: "cp", value: cpValue },
    bestLine: ["e4"],
    depth: 20,
    engineLines: [{ score: { type: "cp", value: cpValue }, moves: ["e4"], depth: 20 }],
  };
}

async function createCompletedGameWithMoves(
  app: ReturnType<typeof buildApp>["app"],
  creatorCookie: string,
  joinerCookie: string,
): Promise<{ gameId: number; creatorColor: string }> {
  const { gameId, creatorColor } = await createAndJoinGame(app, creatorCookie, joinerCookie);

  const creatorIsWhite = creatorColor === "white";
  const whiteCookie = creatorIsWhite ? creatorCookie : joinerCookie;
  const blackCookie = creatorIsWhite ? joinerCookie : creatorCookie;

  await app.inject({
    method: "POST",
    url: `/api/games/${gameId}/moves`,
    headers: { cookie: whiteCookie },
    payload: { from: "e2", to: "e4" },
  });

  await app.inject({
    method: "POST",
    url: `/api/games/${gameId}/moves`,
    headers: { cookie: blackCookie },
    payload: { from: "e7", to: "e5" },
  });

  await app.inject({
    method: "POST",
    url: `/api/games/${gameId}/resign`,
    headers: { cookie: whiteCookie },
  });

  return { gameId, creatorColor };
}

beforeAll(() => {
  ensureSchema();
});

let app: ReturnType<typeof buildApp>["app"];

beforeEach(async () => {
  ({ app } = buildApp());
  await app.ready();
  mockEvaluate.mockReset();
  mockEvaluate.mockResolvedValue(makeEvalResult(30));
});

afterEach(async () => {
  await app.close();
});

describe("POST /api/engine/evaluate", () => {
  it("returns 401 without session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/engine/evaluate",
      payload: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 200 with EvaluationResult for valid FEN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("eval-ok"));
    mockEvaluate.mockResolvedValue(makeEvalResult(35));

    const res = await app.inject({
      method: "POST",
      url: "/api/engine/evaluate",
      headers: { cookie },
      payload: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.score).toEqual({ type: "cp", value: 35 });
    expect(body.depth).toBe(20);
    expect(Array.isArray(body.bestLine)).toBe(true);
    expect(Array.isArray(body.engineLines)).toBe(true);
    expect(mockEvaluate).toHaveBeenCalledWith(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      undefined,
    );
  });

  it("passes depth parameter to engine pool", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("eval-depth"));
    mockEvaluate.mockResolvedValue(makeEvalResult(30));

    const res = await app.inject({
      method: "POST",
      url: "/api/engine/evaluate",
      headers: { cookie },
      payload: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", depth: 15 },
    });

    expect(res.statusCode).toBe(200);
    expect(mockEvaluate).toHaveBeenCalledWith(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      15,
    );
  });

  it("returns 400 for invalid FEN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("eval-bad-fen"));

    const res = await app.inject({
      method: "POST",
      url: "/api/engine/evaluate",
      headers: { cookie },
      payload: { fen: "not-a-valid-fen" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid FEN" });
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it("returns 400 when depth exceeds maximum", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("eval-bad-depth"));

    const res = await app.inject({
      method: "POST",
      url: "/api/engine/evaluate",
      headers: { cookie },
      payload: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", depth: 30 },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/games/:id/server-analyze", () => {
  it("returns 401 without session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/games/1/server-analyze",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when game does not exist", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("analyze-404"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/999999/server-analyze",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Game not found" });
  });

  it("returns 403 when user is not a participant", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analyze-403-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analyze-403-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("analyze-403-o"));
    const { gameId } = await createCompletedGameWithMoves(app, c1, c2);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/server-analyze`,
      headers: { cookie: c3 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "You are not a player in this game" });
  });

  it("returns 400 when game is not in terminal state", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analyze-notterminal-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analyze-notterminal-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/server-analyze`,
      headers: { cookie: c1 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Game is not completed" });
  });

  it("returns 403 when user has an active game", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analyze-active-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analyze-active-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("analyze-active-j2"));

    const { gameId } = await createCompletedGameWithMoves(app, c1, c2);

    await createAndJoinGame(app, c1, c3);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/server-analyze`,
      headers: { cookie: c1 },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Cannot analyze while in an active game" });
  });

  it("returns 200 with analysis result for a completed game", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analyze-ok-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analyze-ok-j"));
    const { gameId } = await createCompletedGameWithMoves(app, c1, c2);

    let callCount = 0;
    mockEvaluate.mockImplementation(async () => {
      callCount++;
      return makeEvalResult(30 - callCount * 5);
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/server-analyze`,
      headers: { cookie: c1 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.positions)).toBe(true);
    expect(body.positions.length).toBe(3);
    expect(typeof body.whiteAccuracy).toBe("number");
    expect(typeof body.blackAccuracy).toBe("number");
    expect(body.positions[0].classification).toBeNull();
    expect(body.positions[0].centipawnLoss).toBeNull();
    expect(body.positions[1].classification).toBeDefined();
    expect(typeof body.positions[1].centipawnLoss).toBe("number");
    expect(mockEvaluate).toHaveBeenCalledTimes(3);
  });

  it("auto-saves analysis to game_analyses table", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("analyze-save-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("analyze-save-j"));
    const { gameId } = await createCompletedGameWithMoves(app, c1, c2);

    mockEvaluate.mockResolvedValue(makeEvalResult(25));

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/server-analyze`,
      headers: { cookie: c1 },
    });

    const getRes = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}/analysis`,
      headers: { cookie: c1 },
    });

    expect(getRes.statusCode).toBe(200);
    const savedAnalysis = getRes.json();
    expect(savedAnalysis.gameId).toBe(gameId);
    expect(typeof savedAnalysis.whiteAccuracy).toBe("number");
    expect(typeof savedAnalysis.blackAccuracy).toBe("number");
    expect(savedAnalysis.analysisTree.children).toHaveLength(1);
    expect(savedAnalysis.analysisTree.children[0].san).toBe("e4");
    expect(savedAnalysis.analysisTree.children[0].children).toHaveLength(1);
    expect(savedAnalysis.analysisTree.children[0].children[0].san).toBe("e5");
    expect(savedAnalysis.analysisTree.children[0].children[0].children).toHaveLength(0);
  });
});

describe("engine unavailable", () => {
  it("evaluate returns 503 when engine pool is unavailable", async () => {
    const { EnginePool } = await import("../src/engine/engine-pool.js");
    vi.mocked(EnginePool).mockImplementationOnce(
      () =>
        ({
          init: vi.fn().mockRejectedValue(new Error("binary not found")),
          evaluate: mockEvaluate,
          shutdown: vi.fn(),
          get size() {
            return 0;
          },
          get pendingRequests() {
            return 0;
          },
        }) as InstanceType<typeof EnginePool>,
    );

    const { app: noEngineApp } = buildApp();
    await noEngineApp.ready();

    const { cookie } = await registerAndLogin(noEngineApp, uniqueEmail("eval-503"));

    const res = await noEngineApp.inject({
      method: "POST",
      url: "/api/engine/evaluate",
      headers: { cookie },
      payload: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "Engine not available" });

    await noEngineApp.close();
  });

  it("server-analyze returns 503 when engine pool is unavailable", async () => {
    const { EnginePool } = await import("../src/engine/engine-pool.js");
    vi.mocked(EnginePool).mockImplementationOnce(
      () =>
        ({
          init: vi.fn().mockRejectedValue(new Error("binary not found")),
          evaluate: mockEvaluate,
          shutdown: vi.fn(),
          get size() {
            return 0;
          },
          get pendingRequests() {
            return 0;
          },
        }) as InstanceType<typeof EnginePool>,
    );

    const { app: noEngineApp } = buildApp();
    await noEngineApp.ready();

    const { cookie: c1 } = await registerAndLogin(noEngineApp, uniqueEmail("analyze-503-c"));
    const { cookie: c2 } = await registerAndLogin(noEngineApp, uniqueEmail("analyze-503-j"));
    const { gameId } = await createCompletedGameWithMoves(noEngineApp, c1, c2);

    const res = await noEngineApp.inject({
      method: "POST",
      url: `/api/games/${gameId}/server-analyze`,
      headers: { cookie: c1 },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "Engine not available" });

    await noEngineApp.close();
  });
});
