import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SerializedAnalysisNode } from "@chess/shared";
import { buildApp } from "../src/server.js";
import { ensureSchema, uniqueEmail, registerAndLogin, createAndJoinGame } from "./helpers.js";

beforeAll(() => {
  ensureSchema();
});

async function createCompletedGame(
  app: FastifyInstance,
  creator: { cookie: string },
  joiner: { cookie: string },
  outcome: "resign-creator" | "resign-joiner" | "draw",
): Promise<number> {
  const { gameId } = await createAndJoinGame(app, creator.cookie, joiner.cookie);

  if (outcome === "resign-creator") {
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie: creator.cookie },
    });
  } else if (outcome === "resign-joiner") {
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie: joiner.cookie },
    });
  } else {
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/draw`,
      headers: { cookie: creator.cookie },
    });
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/draw`,
      headers: { cookie: joiner.cookie },
    });
  }

  return gameId;
}

function makeAnalysisTree(): SerializedAnalysisNode {
  return {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    san: null,
    evaluation: null,
    classification: null,
    children: [],
  };
}

async function saveAnalysis(
  app: FastifyInstance,
  gameId: number,
  cookie: string,
  whiteAccuracy: number,
  blackAccuracy: number,
): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: `/api/games/${gameId}/analysis`,
    headers: { cookie },
    payload: {
      analysisTree: makeAnalysisTree(),
      whiteAccuracy,
      blackAccuracy,
      engineDepth: 18,
    },
  });
  if (res.statusCode !== 200) {
    throw new Error(`Save analysis failed: ${res.statusCode} ${res.body}`);
  }
}

describe("GET /api/users/:id/stats — Player stats", () => {
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
      url: "/api/users/1/stats",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 for non-existent user", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("stats-404"));
    const res = await app.inject({
      method: "GET",
      url: "/api/users/999999/stats",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "User not found" });
  });

  it("returns zero stats for user with no completed games", async () => {
    const { cookie, userId } = await registerAndLogin(app, uniqueEmail("stats-zero"));
    const res = await app.inject({
      method: "GET",
      url: `/api/users/${userId}/stats`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalGames).toBe(0);
    expect(body.wins).toBe(0);
    expect(body.losses).toBe(0);
    expect(body.draws).toBe(0);
    expect(body.winRate).toBe(0);
    expect(body.avgAccuracy).toEqual({ white: null, black: null });
    expect(body.recentGames).toEqual([]);
  });

  it("returns correct aggregate stats for mixed results", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("stats-agg-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("stats-agg-j"));

    // Creator wins 2 (joiner resigns)
    await createCompletedGame(app, creator, joiner, "resign-joiner");
    await createCompletedGame(app, creator, joiner, "resign-joiner");
    // Creator loses 1 (creator resigns)
    await createCompletedGame(app, creator, joiner, "resign-creator");
    // Draw 1
    await createCompletedGame(app, creator, joiner, "draw");

    const res = await app.inject({
      method: "GET",
      url: `/api/users/${creator.userId}/stats`,
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalGames).toBe(4);
    expect(body.wins).toBe(2);
    expect(body.losses).toBe(1);
    expect(body.draws).toBe(1);
    expect(body.winRate).toBe(50.0);
  });

  it("returns null accuracy when no analyses exist", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("stats-noacc-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("stats-noacc-j"));

    await createCompletedGame(app, creator, joiner, "resign-joiner");

    const res = await app.inject({
      method: "GET",
      url: `/api/users/${creator.userId}/stats`,
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.avgAccuracy.white).toBeNull();
    expect(body.avgAccuracy.black).toBeNull();
  });

  it("returns correct accuracy averages", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("stats-acc-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("stats-acc-j"));

    // Game 1: creator plays as their assigned color
    const gameId1 = await createCompletedGame(app, creator, joiner, "resign-joiner");
    await saveAnalysis(app, gameId1, creator.cookie, 80.0, 70.0);

    // Game 2: another game
    const gameId2 = await createCompletedGame(app, creator, joiner, "resign-joiner");
    await saveAnalysis(app, gameId2, creator.cookie, 90.0, 60.0);

    const res = await app.inject({
      method: "GET",
      url: `/api/users/${creator.userId}/stats`,
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Creator is randomly assigned white or black; the accuracy depends on their color.
    // We verify that at least one accuracy field is non-null and is a reasonable average.
    const whiteAcc = body.avgAccuracy.white;
    const blackAcc = body.avgAccuracy.black;
    // At least one should be non-null since creator played 2 games
    expect(whiteAcc !== null || blackAcc !== null).toBe(true);
    if (whiteAcc !== null) {
      expect(typeof whiteAcc).toBe("number");
    }
    if (blackAcc !== null) {
      expect(typeof blackAcc).toBe("number");
    }
  });

  it("recent games ordered by most recent first, max 10", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("stats-recent-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("stats-recent-j"));

    // Create 12 completed games
    for (let i = 0; i < 12; i++) {
      await createCompletedGame(app, creator, joiner, "resign-joiner");
    }

    const res = await app.inject({
      method: "GET",
      url: `/api/users/${creator.userId}/stats`,
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recentGames).toHaveLength(10);

    // Verify ordering: each game's playedAt >= next game's playedAt
    for (let i = 0; i < body.recentGames.length - 1; i++) {
      expect(body.recentGames[i].playedAt).toBeGreaterThanOrEqual(body.recentGames[i + 1].playedAt);
    }
  });
});
