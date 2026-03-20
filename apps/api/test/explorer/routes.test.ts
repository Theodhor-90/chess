import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type { ExplorerResponse } from "@chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -";
const AFTER_E4_E5_FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -";
const AFTER_E4_C5_FEN = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -";

const TEST_PREFIX = `expl_rt_${Date.now()}`;

beforeAll(() => {
  ensureSchema();

  // Clean any pre-existing data for these positions to ensure test isolation
  sqlite.exec(`DELETE FROM opening_position_moves WHERE position_fen = '${STARTING_FEN}'`);
  sqlite.exec(`DELETE FROM opening_position_moves WHERE position_fen = '${AFTER_E4_FEN}'`);
  sqlite.exec(`DELETE FROM opening_positions WHERE position_fen = '${STARTING_FEN}'`);
  sqlite.exec(`DELETE FROM opening_positions WHERE position_fen = '${AFTER_E4_FEN}'`);

  // Seed opening_positions
  sqlite.exec(`
    INSERT INTO opening_positions (position_fen, eco, opening_name, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${STARTING_FEN}', NULL, NULL, 50000, 30000, 45000, 125000, 2450, '{}')
  `);
  sqlite.exec(`
    INSERT INTO opening_positions (position_fen, eco, opening_name, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${AFTER_E4_FEN}', 'B00', 'Kings Pawn', 30000, 15000, 25000, 70000, 2430, '{}')
  `);

  // Seed opening_position_moves
  sqlite.exec(`
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${STARTING_FEN}', 'e4', 'e2e4', '${AFTER_E4_FEN}', 30000, 15000, 25000, 70000, 2430,
      '{"1400-1600":{"blitz":{"white":10,"draws":5,"black":8,"totalGames":23,"avgRating":1500},"rapid":{"white":3,"draws":2,"black":4,"totalGames":9,"avgRating":1520}},"1600-1800":{"blitz":{"white":15,"draws":8,"black":12,"totalGames":35,"avgRating":1700}}}')
  `);
  sqlite.exec(`
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${STARTING_FEN}', 'd4', 'd2d4', 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 28000, 16000, 24000, 68000, 2440,
      '{"1400-1600":{"blitz":{"white":7,"draws":3,"black":5,"totalGames":15,"avgRating":1480}}}')
  `);
  sqlite.exec(`
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${STARTING_FEN}', 'c4', 'c2c4', 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -', 12000, 8000, 10000, 30000, 2460, '{}')
  `);
  sqlite.exec(`
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${STARTING_FEN}', 'b3', 'b2b3', 'rnbqkbnr/pppppppp/8/8/8/1P6/P1PPPPPP/RNBQKBNR b KQkq -', 0, 0, 0, 0, 0,
      '{"1400-1600":{"blitz":{"white":2,"draws":1,"black":3,"totalGames":6,"avgRating":1490}}}')
  `);
  sqlite.exec(`
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${AFTER_E4_FEN}', 'e5', 'e7e5', '${AFTER_E4_E5_FEN}', 15000, 8000, 12000, 35000, 2420, '{}')
  `);
  sqlite.exec(`
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, master_white, master_draws, master_black, master_total_games, master_avg_rating, platform_stats)
    VALUES ('${AFTER_E4_FEN}', 'c5', 'c7c5', '${AFTER_E4_C5_FEN}', 14000, 7000, 14000, 35000, 2450, '{}')
  `);
});

afterAll(() => {
  sqlite.exec(`DELETE FROM opening_position_moves WHERE position_fen = '${STARTING_FEN}'`);
  sqlite.exec(`DELETE FROM opening_position_moves WHERE position_fen = '${AFTER_E4_FEN}'`);
  sqlite.exec(`DELETE FROM opening_positions WHERE position_fen = '${STARTING_FEN}'`);
  sqlite.exec(`DELETE FROM opening_positions WHERE position_fen = '${AFTER_E4_FEN}'`);
});

describe("GET /api/explorer/masters", () => {
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
      url: "/api/explorer/masters?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when fen param is missing", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-masters-nofen`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/masters",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid FEN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-masters-badfen`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/masters?fen=not-a-valid-fen",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid FEN" });
  });

  it("returns master moves for the starting position (full FEN)", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-masters-start`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/masters?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(3);

    expect(body.moves[0].san).toBe("e4");
    expect(body.moves[0].totalGames).toBe(70000);
    expect(body.moves[0].white).toBe(30000);
    expect(body.moves[0].draws).toBe(15000);
    expect(body.moves[0].black).toBe(25000);
    expect(body.moves[0].avgRating).toBe(2430);
    expect(body.moves[0].uci).toBe("e2e4");

    expect(body.moves[1].san).toBe("d4");
    expect(body.moves[1].totalGames).toBe(68000);

    expect(body.moves[2].san).toBe("c4");
    expect(body.moves[2].totalGames).toBe(30000);

    expect(body.white).toBe(30000 + 28000 + 12000);
    expect(body.draws).toBe(15000 + 16000 + 8000);
    expect(body.black).toBe(25000 + 24000 + 10000);

    expect(body.topGames).toEqual([]);
  });

  it("returns moves after 1.e4 with opening info", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-masters-e4`));
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/masters?fen=rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(2);
    const sans = body.moves.map((m) => m.san).sort();
    expect(sans).toEqual(["c5", "e5"]);

    expect(body.opening).not.toBeNull();
    expect(body.opening!.eco).toBe("B00");
  });

  it("returns empty moves for a position with no master data", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-masters-empty`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/masters?fen=8/8/8/8/8/8/8/4K2k w - - 0 1",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;
    expect(body.moves).toEqual([]);
    expect(body.white).toBe(0);
    expect(body.draws).toBe(0);
    expect(body.black).toBe(0);
  });

  it("accepts a normalized 4-field FEN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-masters-4fen`));
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/masters?fen=${encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -")}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;
    expect(body.moves.length).toBe(3);
  });
});

describe("GET /api/explorer/platform", () => {
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
      url: "/api/explorer/platform?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when fen param is missing", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-nofen`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid FEN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-badfen`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=xxx",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid FEN" });
  });

  it("returns 400 for invalid rating bracket", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-badrating`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1&ratings=invalid",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid rating bracket" });
  });

  it("returns 400 for invalid speed category", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-badspeed`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1&speeds=superblitz",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid speed category" });
  });

  it("returns all platform moves when no filters provided", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-all`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(3);
    expect(body.moves[0].san).toBe("e4");
    expect(body.moves[0].totalGames).toBe(67);
    expect(body.moves[0].white).toBe(28);
    expect(body.moves[0].draws).toBe(15);
    expect(body.moves[0].black).toBe(24);

    expect(body.moves[1].san).toBe("d4");
    expect(body.moves[1].totalGames).toBe(15);

    expect(body.moves[2].san).toBe("b3");
    expect(body.moves[2].totalGames).toBe(6);
  });

  it("filters by rating bracket", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-ratings`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1&ratings=1600-1800",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(1);
    expect(body.moves[0].san).toBe("e4");
    expect(body.moves[0].totalGames).toBe(35);
    expect(body.moves[0].white).toBe(15);
    expect(body.moves[0].draws).toBe(8);
    expect(body.moves[0].black).toBe(12);
  });

  it("filters by speed category", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-speeds`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1&speeds=rapid",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(1);
    expect(body.moves[0].san).toBe("e4");
    expect(body.moves[0].totalGames).toBe(9);
  });

  it("filters by both ratings and speeds", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-both`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1&ratings=1400-1600&speeds=blitz",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(3);
    expect(body.moves[0].san).toBe("e4");
    expect(body.moves[0].totalGames).toBe(23);
    expect(body.moves[1].san).toBe("d4");
    expect(body.moves[1].totalGames).toBe(15);
    expect(body.moves[2].san).toBe("b3");
    expect(body.moves[2].totalGames).toBe(6);
  });

  it("returns empty moves for a position with no platform data", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-empty`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/platform?fen=8/8/8/8/8/8/8/4K2k w - - 0 1",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;
    expect(body.moves).toEqual([]);
    expect(body.white).toBe(0);
    expect(body.draws).toBe(0);
    expect(body.black).toBe(0);
  });

  it("returns opening info for the queried position", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-plat-opening`));
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/platform?fen=${encodeURIComponent("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1")}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;
    expect(body.opening).not.toBeNull();
    expect(body.opening!.eco).toBe("B00");
  });
});
