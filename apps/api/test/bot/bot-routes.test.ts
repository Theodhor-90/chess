import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../../src/server.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type { BotGameResponse } from "@chess/shared";
import { BOT_PROFILES } from "@chess/shared";
import type { EnginePool } from "../../src/engine/engine-pool.js";

beforeAll(() => {
  ensureSchema();
});

function createMockEnginePool(): EnginePool {
  return {
    evaluate: vi.fn().mockResolvedValue({
      score: { type: "cp", value: 30 },
      bestLine: ["e4", "e5"],
      depth: 10,
      engineLines: [{ score: { type: "cp", value: 30 }, moves: ["e4", "e5"], depth: 10 }],
    }),
    evaluateWithProgress: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
    size: 2,
    pendingRequests: 0,
  } as unknown as EnginePool;
}

function mockEngine(app: ReturnType<typeof buildApp>["app"]): void {
  app.decorate("engine", createMockEnginePool());
}

describe("POST /api/games/bot — Bot game creation", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      payload: { level: 1 },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 503 when engine is unavailable", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-no-engine"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 1 },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "Engine is unavailable" });
  });

  it("returns 400 for invalid level (0)", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-invalid-0"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid level (6)", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-invalid-6"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 6 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for non-integer level", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-float"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 2.5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for missing level", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-missing"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a bot game with level 1 and returns 201", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-create-1"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 1 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as BotGameResponse;
    expect(body.gameId).toBeTypeOf("number");
    expect(["white", "black"]).toContain(body.color);
    expect(body.botProfile.level).toBe(1);
    expect(body.botProfile.name).toBe("Patzer Pete");
  });

  it("creates a bot game with level 5 and returns correct profile", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-create-5"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 5 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as BotGameResponse;
    expect(body.botProfile.level).toBe(5);
    expect(body.botProfile.name).toBe("Master Max");
    expect(body.botProfile.estimatedElo).toBe(2000);
  });

  it("game status is active immediately", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-active"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 3 },
    });
    const { gameId } = createRes.json() as BotGameResponse;

    const getRes = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const game = getRes.json();
    expect(game.status).toBe("active");
    expect(game.botLevel).toBe(3);
  });

  it("uses custom clock config when provided", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-clock"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 2, clock: { initialTime: 300, increment: 5 } },
    });
    expect(res.statusCode).toBe(201);
    const { gameId } = res.json() as BotGameResponse;

    const getRes = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie },
    });
    const game = getRes.json();
    expect(game.clock.initialTime).toBe(300);
    expect(game.clock.increment).toBe(5);
  });

  it("bot game has one player slot empty (bot side)", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-slot"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 1 },
    });
    const { gameId, color: humanColor } = res.json() as BotGameResponse;

    const getRes = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie },
    });
    const game = getRes.json();
    const botColor = humanColor === "white" ? "black" : "white";

    // Human side has player info
    expect(game.players[humanColor]).toBeTruthy();
    expect(game.players[humanColor].userId).toBeTypeOf("number");

    // Bot side is empty (null/undefined)
    expect(game.players[botColor]).toBeUndefined();
  });

  it("bot game appears in game list", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-list"));

    const res = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 2 },
    });
    const { gameId } = res.json() as BotGameResponse;

    const listRes = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const gameList = listRes.json();
    const botGame = gameList.find((g: { id: number }) => g.id === gameId);
    expect(botGame).toBeTruthy();
    expect(botGame.botLevel).toBe(2);
  });

  it("each bot level 1-5 creates successfully", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-levels"));

    for (let level = 1; level <= 5; level++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/games/bot",
        headers: { cookie },
        payload: { level },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as BotGameResponse;
      expect(body.botProfile.level).toBe(level);
      expect(body.botProfile.name).toBe(BOT_PROFILES[level - 1].name);
    }
  });
});

describe("Bot game history integration", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("bot game in history shows bot name as opponent", async () => {
    mockEngine(app);
    const { cookie } = await registerAndLogin(app, uniqueEmail("bot-hist"));

    // Create bot game
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 1 },
    });
    const { gameId } = createRes.json() as BotGameResponse;

    // Resign to end the game (so it appears in history)
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie },
    });

    // Check history
    const histRes = await app.inject({
      method: "GET",
      url: "/api/games/history",
      headers: { cookie },
    });
    expect(histRes.statusCode).toBe(200);
    const history = histRes.json();
    const botItem = history.items.find((item: { id: number }) => item.id === gameId);
    expect(botItem).toBeTruthy();
    expect(botItem.opponentUsername).toBe("Patzer Pete");
    expect(botItem.botLevel).toBe(1);
    expect(botItem.result).toBe("loss"); // resigned = loss for the resigner
  });

  it("bot game in player stats shows bot name as opponent", async () => {
    mockEngine(app);
    const { cookie, userId } = await registerAndLogin(app, uniqueEmail("bot-stats"));

    // Create and resign bot game
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games/bot",
      headers: { cookie },
      payload: { level: 3 },
    });
    const { gameId } = createRes.json() as BotGameResponse;

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie },
    });

    // Check stats
    const statsRes = await app.inject({
      method: "GET",
      url: `/api/users/${userId}/stats`,
      headers: { cookie },
    });
    expect(statsRes.statusCode).toBe(200);
    const stats = statsRes.json();
    expect(stats.totalGames).toBeGreaterThanOrEqual(1);
    const recentBotGame = stats.recentGames.find((g: { gameId: number }) => g.gameId === gameId);
    expect(recentBotGame).toBeTruthy();
    expect(recentBotGame.opponentUsername).toBe("Club Charlie");
  });
});
