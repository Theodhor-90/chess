import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type { ExplorerResponse } from "@chess/shared";

const TEST_PREFIX = `expl_personal_${Date.now()}`;

let testUserId: number;
let _testCookie: string;
let opponentUserId: number;
const gameIds: number[] = [];

beforeAll(async () => {
  ensureSchema();

  const { app: setupApp } = buildApp();
  await setupApp.ready();

  const { cookie, userId } = await registerAndLogin(setupApp, uniqueEmail(`${TEST_PREFIX}-user`));
  testUserId = userId;
  _testCookie = cookie;

  const { userId: oppId } = await registerAndLogin(
    setupApp,
    uniqueEmail(`${TEST_PREFIX}-opponent`),
  );
  opponentUserId = oppId;

  const uniqueToken = `personal_test_${Date.now()}`;

  // Game 1: User is white, plays 1.e4 e5 2.Nf3, white wins, blitz (300s)
  const g1 = sqlite
    .prepare(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
       VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5 2. Nf3', 'black', 300, 0, 'white', 'checkmate', ?)`,
    )
    .run(`${uniqueToken}_1`, testUserId, opponentUserId, Math.floor(Date.now() / 1000));
  gameIds.push(Number(g1.lastInsertRowid));

  // Game 2: User is white, plays 1.e4 c5, draw, blitz (300s)
  const g2 = sqlite
    .prepare(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
       VALUES (?, 'draw', ?, ?, 'final', '1. e4 c5', 'white', 300, 0, NULL, 'draw', ?)`,
    )
    .run(`${uniqueToken}_2`, testUserId, opponentUserId, Math.floor(Date.now() / 1000));
  gameIds.push(Number(g2.lastInsertRowid));

  // Game 3: User is white, plays 1.d4 d5, black wins, rapid (900s)
  const g3 = sqlite
    .prepare(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
       VALUES (?, 'resigned', ?, ?, 'final', '1. d4 d5', 'white', 900, 0, 'black', 'resigned', ?)`,
    )
    .run(`${uniqueToken}_3`, testUserId, opponentUserId, Math.floor(Date.now() / 1000));
  gameIds.push(Number(g3.lastInsertRowid));

  // Game 4: User is black, opponent plays 1.e4, user plays e5, black wins, blitz
  const g4 = sqlite
    .prepare(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
       VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5', 'white', 300, 0, 'black', 'checkmate', ?)`,
    )
    .run(`${uniqueToken}_4`, opponentUserId, testUserId, Math.floor(Date.now() / 1000));
  gameIds.push(Number(g4.lastInsertRowid));

  await setupApp.close();
});

afterAll(() => {
  for (const id of gameIds) {
    sqlite.prepare("DELETE FROM games WHERE id = ?").run(id);
  }
  sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(testUserId);
  sqlite.prepare("UPDATE users SET player_stats_indexed = 0 WHERE id = ?").run(testUserId);
});

describe("GET /api/explorer/personal - auth & validation", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when fen param is missing", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-nofen`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/personal?color=white",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when color param is missing", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-nocolor`));
    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid FEN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-badfen`));
    const res = await app.inject({
      method: "GET",
      url: "/api/explorer/personal?fen=invalid&color=white",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid FEN" });
  });

  it("returns 400 for invalid color", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-badcolor`));
    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=purple`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid speed category", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-badspeed`));
    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white&speeds=superblitz`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid speed category" });
  });
});

describe("GET /api/explorer/personal - backfill and stats", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("triggers backfill on first request and returns stats", async () => {
    sqlite.prepare("UPDATE users SET player_stats_indexed = 0 WHERE id = ?").run(testUserId);
    sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(testUserId);

    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-backfill`));

    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;
    expect(body.moves).toEqual([]);
  });

  it("returns personal stats for user with games (white at starting position)", async () => {
    const { cookie, userId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-stats-user`),
    );

    const { userId: oppId } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-stats-opp`));

    const sToken = `personal_stats_${Date.now()}`;
    const localGameIds: number[] = [];

    // Game A: User is white, plays 1.e4, white wins
    const gA = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5', 'black', 300, 0, 'white', 'checkmate', ?)`,
      )
      .run(`${sToken}_A`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(gA.lastInsertRowid));

    // Game B: User is white, plays 1.e4, draw
    const gB = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'draw', ?, ?, 'final', '1. e4 c5', 'white', 300, 0, NULL, 'draw', ?)`,
      )
      .run(`${sToken}_B`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(gB.lastInsertRowid));

    // Game C: User is white, plays 1.d4, black wins, rapid
    const gC = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'resigned', ?, ?, 'final', '1. d4 d5', 'white', 900, 0, 'black', 'resigned', ?)`,
      )
      .run(`${sToken}_C`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(gC.lastInsertRowid));

    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    // Should have 2 moves: e4 (2 games), d4 (1 game)
    expect(body.moves.length).toBe(2);

    // Sorted by totalGames desc
    expect(body.moves[0].san).toBe("e4");
    expect(body.moves[0].totalGames).toBe(2);
    // e4 games: Game A (white won = 1-0), Game B (draw)
    // Player-relative: wins (white field) = 1 (Game A won), draws = 1 (Game B), losses (black field) = 0
    expect(body.moves[0].white).toBe(1);
    expect(body.moves[0].draws).toBe(1);
    expect(body.moves[0].black).toBe(0);

    expect(body.moves[1].san).toBe("d4");
    expect(body.moves[1].totalGames).toBe(1);
    // d4 game: Game C (black won = 0-1)
    // Player-relative: wins = 0, losses (black field) = 1
    expect(body.moves[1].white).toBe(0);
    expect(body.moves[1].draws).toBe(0);
    expect(body.moves[1].black).toBe(1);

    expect(body.white).toBe(1);
    expect(body.draws).toBe(1);
    expect(body.black).toBe(1);

    // Verify playerStatsIndexed was set
    const userRow = sqlite
      .prepare("SELECT player_stats_indexed FROM users WHERE id = ?")
      .get(userId) as { player_stats_indexed: number };
    expect(userRow.player_stats_indexed).toBe(1);

    // Cleanup
    for (const id of localGameIds) {
      sqlite.prepare("DELETE FROM games WHERE id = ?").run(id);
    }
    sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(userId);
  });

  it("returns personal stats for user as black after 1.e4", async () => {
    const { cookie, userId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-black-stats`),
    );

    const { userId: oppId } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-black-opp`));

    const bToken = `personal_black_${Date.now()}`;
    const localGameIds: number[] = [];

    // Game: User is black, opponent plays 1.e4, user plays e5, black wins
    const g1 = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5', 'white', 300, 0, 'black', 'checkmate', ?)`,
      )
      .run(`${bToken}_1`, oppId, userId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(g1.lastInsertRowid));

    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=black`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(1);
    expect(body.moves[0].san).toBe("e5");
    expect(body.moves[0].totalGames).toBe(1);
    // User is black and won: table stores 0-1 (white=0, black=1)
    // Player-relative transform for black: wins = table.black = 1, losses = table.white = 0
    expect(body.moves[0].white).toBe(1); // player wins
    expect(body.moves[0].black).toBe(0); // player losses

    // Cleanup
    for (const id of localGameIds) {
      sqlite.prepare("DELETE FROM games WHERE id = ?").run(id);
    }
    sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(userId);
  });

  it("returns empty moves for a position with no data", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-empty-pos`));

    const fen = encodeURIComponent("8/8/8/8/8/8/8/4K2k w - - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;
    expect(body.moves).toEqual([]);
    expect(body.white).toBe(0);
    expect(body.draws).toBe(0);
    expect(body.black).toBe(0);
  });

  it("returns top games for the personal endpoint", async () => {
    const { cookie, userId } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-topgames`));

    const { userId: oppId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-topgames-opp`),
    );

    const tToken = `personal_topgames_${Date.now()}`;
    const localGameIds: number[] = [];

    // Seed 2 games that both pass through starting position
    const g1 = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5', 'black', 300, 0, 'white', 'checkmate', ?)`,
      )
      .run(`${tToken}_1`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(g1.lastInsertRowid));

    const g2 = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'draw', ?, ?, 'final', '1. d4 d5', 'white', 300, 0, NULL, 'draw', ?)`,
      )
      .run(`${tToken}_2`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(g2.lastInsertRowid));

    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.topGames.length).toBe(2);
    for (const game of body.topGames) {
      expect(game.id).toBeGreaterThan(0);
      expect(typeof game.white).toBe("string");
      expect(typeof game.black).toBe("string");
      expect(game.result).toMatch(/^(1-0|0-1|1\/2-1\/2)$/);
      expect(game.year).toBeGreaterThan(0);
    }

    // Cleanup
    for (const id of localGameIds) {
      sqlite.prepare("DELETE FROM games WHERE id = ?").run(id);
    }
    sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(userId);
  });
});

describe("GET /api/explorer/personal - filtered requests", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("filters by speed category using on-the-fly replay", async () => {
    const { cookie, userId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-speed-filter`),
    );

    const { userId: oppId } = await registerAndLogin(app, uniqueEmail(`${TEST_PREFIX}-speed-opp`));

    const sfToken = `personal_speed_${Date.now()}`;
    const localGameIds: number[] = [];

    // Blitz game (300s): 1.e4 e5, white wins
    const g1 = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5', 'black', 300, 0, 'white', 'checkmate', ?)`,
      )
      .run(`${sfToken}_1`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(g1.lastInsertRowid));

    // Rapid game (900s): 1.d4 d5, black wins
    const g2 = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'resigned', ?, ?, 'final', '1. d4 d5', 'white', 900, 0, 'black', 'resigned', ?)`,
      )
      .run(`${sfToken}_2`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(g2.lastInsertRowid));

    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

    // Filter to rapid only — should only see d4
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white&speeds=rapid`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    expect(body.moves.length).toBe(1);
    expect(body.moves[0].san).toBe("d4");
    expect(body.moves[0].totalGames).toBe(1);
    expect(body.moves[0].black).toBe(1); // loss

    // Cleanup
    for (const id of localGameIds) {
      sqlite.prepare("DELETE FROM games WHERE id = ?").run(id);
    }
    sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(userId);
  });

  it("returns opening info for queried position", async () => {
    const { cookie, userId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-opening-info`),
    );

    const { userId: oppId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-opening-opp`),
    );

    const oToken = `personal_opening_${Date.now()}`;
    const localGameIds: number[] = [];

    // Game at after-e4 position
    const g1 = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5', 'white', 300, 0, 'black', 'checkmate', ?)`,
      )
      .run(`${oToken}_1`, oppId, userId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(g1.lastInsertRowid));

    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=black`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse;

    // The after-e4 position should have opening info (B00) from the opening_positions table
    expect(body.opening).not.toBeNull();
    expect(body.opening!.eco).toBe("B00");

    // Cleanup
    for (const id of localGameIds) {
      sqlite.prepare("DELETE FROM games WHERE id = ?").run(id);
    }
    sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(userId);
  });
});

describe("GET /api/explorer/player - self-query optimization", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("uses pre-aggregated stats when querying own stats without filters", async () => {
    const { cookie, userId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-player-opt`),
    );

    const { userId: oppId } = await registerAndLogin(
      app,
      uniqueEmail(`${TEST_PREFIX}-player-opt-opp`),
    );

    const pToken = `player_opt_${Date.now()}`;
    const localGameIds: number[] = [];

    // Game: User is white, plays 1.e4, white wins
    const g1 = sqlite
      .prepare(
        `INSERT INTO games (invite_token, status, white_player_id, black_player_id, fen, pgn, current_turn, clock_initial_time, clock_increment, result_winner, result_reason, created_at)
         VALUES (?, 'checkmate', ?, ?, 'final', '1. e4 e5', 'black', 300, 0, 'white', 'checkmate', ?)`,
      )
      .run(`${pToken}_1`, userId, oppId, Math.floor(Date.now() / 1000));
    localGameIds.push(Number(g1.lastInsertRowid));

    // First, trigger personal endpoint to run backfill
    const fen = encodeURIComponent("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    await app.inject({
      method: "GET",
      url: `/api/explorer/personal?fen=${fen}&color=white`,
      headers: { cookie },
    });

    // Now query via /player endpoint with own userId — should use pre-aggregated path
    const res = await app.inject({
      method: "GET",
      url: `/api/explorer/player?fen=${fen}&color=white&userId=${userId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ExplorerResponse & { partial: boolean };

    expect(body.moves.length).toBe(1);
    expect(body.moves[0].san).toBe("e4");
    expect(body.moves[0].totalGames).toBe(1);
    expect(body.moves[0].white).toBe(1); // player won
    expect(body.partial).toBe(false);

    // Cleanup
    for (const id of localGameIds) {
      sqlite.prepare("DELETE FROM games WHERE id = ?").run(id);
    }
    sqlite.prepare("DELETE FROM opening_player_stats WHERE user_id = ?").run(userId);
  });
});
