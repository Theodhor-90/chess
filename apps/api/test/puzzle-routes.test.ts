import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/server.js";
import { db, sqlite } from "../src/db/index.js";
import { puzzles } from "../src/db/schema.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "./helpers.js";
import type { PuzzleNextResponse, PuzzleAttemptResponse } from "@chess/shared";

beforeAll(() => {
  ensureSchema();
  sqlite.exec("DELETE FROM puzzles WHERE puzzle_id LIKE 'test_pz_%'");
  db.insert(puzzles)
    .values([
      {
        puzzleId: "test_pz_001",
        fen: "r2qkb1r/pp2pppp/2p2n2/3p1b2/3P4/2N2N2/PPP1PPPP/R1BQKB1R w KQkq - 0 1",
        moves: "d1b3 b7b5 e2e4 d5e4",
        rating: 1500,
        ratingDeviation: 75,
        popularity: 95,
        nbPlays: 12345,
        themes: "middlegame short",
        gameUrl: "https://lichess.org/abc123#31",
        openingTags: null,
      },
      {
        puzzleId: "test_pz_002",
        fen: "r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
        moves: "d2d4 d7d5 e4d5",
        rating: 1400,
        ratingDeviation: 80,
        popularity: 90,
        nbPlays: 5000,
        themes: "opening",
        gameUrl: "https://lichess.org/def456#10",
        openingTags: "Kings_Pawn",
      },
      {
        puzzleId: "test_pz_003",
        fen: "8/8/8/8/8/8/8/4K2R w K - 0 1",
        moves: "e1g1 h8f8",
        rating: 800,
        ratingDeviation: 100,
        popularity: 50,
        nbPlays: 100,
        themes: "endgame",
        gameUrl: "https://lichess.org/ghi789#5",
        openingTags: null,
      },
    ])
    .run();
});

describe("GET /api/puzzles/next", () => {
  let app: ReturnType<typeof buildApp>["app"];
  beforeEach(() => {
    ({ app } = buildApp());
  });
  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/puzzles/next",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns a puzzle matching user rating", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-next"));
    // New user has default rating 1500. test_pz_001 (1500) and test_pz_002 (1400) are within ±200.
    const res = await app.inject({
      method: "GET",
      url: "/api/puzzles/next",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PuzzleNextResponse;
    expect(body.puzzle).toBeDefined();
    expect(body.puzzle.puzzleId).toMatch(/^test_pz_00[12]$/);
    expect(body.puzzle.fen).toBeDefined();
    expect(Array.isArray(body.puzzle.moves)).toBe(true);
    expect(body.puzzle.moves.length).toBeGreaterThan(0);
    expect(Array.isArray(body.puzzle.themes)).toBe(true);
    expect(body.puzzle.rating).toBeGreaterThanOrEqual(1300);
    expect(body.puzzle.rating).toBeLessThanOrEqual(1700);
  });

  it("puzzle moves are returned as arrays, themes as arrays", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-arrays"));
    const res = await app.inject({
      method: "GET",
      url: "/api/puzzles/next",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PuzzleNextResponse;
    expect(Array.isArray(body.puzzle.moves)).toBe(true);
    body.puzzle.moves.forEach((m: string) => {
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThanOrEqual(4);
    });
    expect(Array.isArray(body.puzzle.themes)).toBe(true);
    body.puzzle.themes.forEach((t: string) => {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    });
  });
});

describe("POST /api/puzzles/:puzzleId/attempt", () => {
  let app: ReturnType<typeof buildApp>["app"];
  beforeEach(() => {
    ({ app } = buildApp());
  });
  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth on attempt", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/test_pz_001/attempt",
      payload: { moves: ["b7b5", "d5e4"] },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 for non-existent puzzle", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-404"));
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/nonexistent_puzzle/attempt",
      headers: { cookie },
      payload: { moves: ["e2e4"] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Puzzle not found" });
  });

  it("correct solution returns correct: true", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-correct"));
    // test_pz_001: moves = "d1b3 b7b5 e2e4 d5e4"
    // setup = d1b3, user expected = [b7b5, d5e4]
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/test_pz_001/attempt",
      headers: { cookie },
      payload: { moves: ["b7b5", "d5e4"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PuzzleAttemptResponse;
    expect(body.correct).toBe(true);
    expect(body.solution).toEqual(["b7b5", "e2e4", "d5e4"]);
  });

  it("incorrect solution returns correct: false with full solution", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-wrong"));
    // test_pz_001: expected user moves = [b7b5, d5e4], we send wrong second move
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/test_pz_001/attempt",
      headers: { cookie },
      payload: { moves: ["b7b5", "a7a6"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PuzzleAttemptResponse;
    expect(body.correct).toBe(false);
    expect(body.solution).toEqual(["b7b5", "e2e4", "d5e4"]);
  });

  it("wrong number of moves returns correct: false", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-count"));
    // test_pz_001 expects 2 user moves, we send only 1
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/test_pz_001/attempt",
      headers: { cookie },
      payload: { moves: ["b7b5"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PuzzleAttemptResponse;
    expect(body.correct).toBe(false);
  });

  it("single-move puzzle validates correctly", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-single"));
    // test_pz_002: moves = "d2d4 d7d5 e4d5"
    // setup = d2d4, user expected = [d7d5], opponent = [e4d5]
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/test_pz_002/attempt",
      headers: { cookie },
      payload: { moves: ["d7d5"] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PuzzleAttemptResponse;
    expect(body.correct).toBe(true);
    expect(body.solution).toEqual(["d7d5", "e4d5"]);
  });

  it("returns 400 when moves array is empty", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-empty"));
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/test_pz_001/attempt",
      headers: { cookie },
      payload: { moves: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when body is missing moves field", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pz-nobody"));
    const res = await app.inject({
      method: "POST",
      url: "/api/puzzles/test_pz_001/attempt",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
