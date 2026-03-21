import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  upsertPlayerMoveStats,
  aggregatePlayerGame,
  backfillPlayerStats,
  aggregatePlayerGameIfIndexed,
} from "../../src/explorer/player-stats.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, seedTestUser } from "../helpers.js";
import { normalizeFen } from "@chess/shared";
import { Chess } from "chess.js";

function cleanupPlayerStats(userId: number): void {
  sqlite.exec(`DELETE FROM opening_player_stats WHERE user_id = ${userId}`);
}

function getPlayerStat(
  userId: number,
  positionFen: string,
  moveSan: string,
  color: string,
):
  | {
      white: number;
      draws: number;
      black: number;
      total_games: number;
      avg_opponent_rating: number;
    }
  | undefined {
  return sqlite
    .prepare(
      "SELECT white, draws, black, total_games, avg_opponent_rating FROM opening_player_stats WHERE user_id = ? AND position_fen = ? AND move_san = ? AND color = ?",
    )
    .get(userId, positionFen, moveSan, color) as
    | {
        white: number;
        draws: number;
        black: number;
        total_games: number;
        avg_opponent_rating: number;
      }
    | undefined;
}

beforeAll(() => {
  ensureSchema();
});

describe("upsertPlayerMoveStats", () => {
  const userId = 80001;
  const positionFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
  const moveSan = "e4";
  const moveUci = "e2e4";
  const resultFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3";
  const color = "white" as const;

  beforeAll(() => {
    seedTestUser(userId);
    cleanupPlayerStats(userId);
  });

  afterAll(() => {
    cleanupPlayerStats(userId);
    sqlite.exec(`DELETE FROM users WHERE id = ${userId}`);
  });

  it("inserts a new row on first call", () => {
    upsertPlayerMoveStats(userId, positionFen, moveSan, moveUci, resultFen, color, "1-0", 1500);
    const stat = getPlayerStat(userId, positionFen, moveSan, color);
    expect(stat).toBeDefined();
    expect(stat!.white).toBe(1);
    expect(stat!.draws).toBe(0);
    expect(stat!.black).toBe(0);
    expect(stat!.total_games).toBe(1);
    expect(stat!.avg_opponent_rating).toBe(1500);
  });

  it("increments counters on subsequent calls with different results", () => {
    upsertPlayerMoveStats(userId, positionFen, moveSan, moveUci, resultFen, color, "0-1", 1600);
    const stat = getPlayerStat(userId, positionFen, moveSan, color);
    expect(stat).toBeDefined();
    expect(stat!.white).toBe(1);
    expect(stat!.black).toBe(1);
    expect(stat!.draws).toBe(0);
    expect(stat!.total_games).toBe(2);
    expect(stat!.avg_opponent_rating).toBe(1550);
  });

  it("increments draw counter", () => {
    upsertPlayerMoveStats(userId, positionFen, moveSan, moveUci, resultFen, color, "1/2-1/2", 1700);
    const stat = getPlayerStat(userId, positionFen, moveSan, color);
    expect(stat).toBeDefined();
    expect(stat!.white).toBe(1);
    expect(stat!.black).toBe(1);
    expect(stat!.draws).toBe(1);
    expect(stat!.total_games).toBe(3);
    expect(stat!.avg_opponent_rating).toBe(1600);
  });
});

describe("aggregatePlayerGame", () => {
  const whiteUserId = 80010;
  const blackUserId = 80011;
  let gameId: number;

  // Italian Game: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5
  const pgn = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5";

  // Compute expected FENs
  const replay = new Chess();
  const startFen = normalizeFen(replay.fen());
  replay.move("e4");
  const afterE4Fen = normalizeFen(replay.fen());
  replay.move("e5");
  const afterE5Fen = normalizeFen(replay.fen());
  replay.move("Nf3");
  const afterNf3Fen = normalizeFen(replay.fen());
  replay.move("Nc6");
  const afterNc6Fen = normalizeFen(replay.fen());
  replay.move("Bc4");
  const afterBc4Fen = normalizeFen(replay.fen());
  replay.move("Bc5");

  beforeAll(() => {
    seedTestUser(whiteUserId);
    seedTestUser(blackUserId);
    cleanupPlayerStats(whiteUserId);
    cleanupPlayerStats(blackUserId);

    const token = `test-ps-${Date.now()}`;
    sqlite.exec(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, pgn, result_winner, result_reason, current_turn)
       VALUES ('${token}', 'checkmate', ${whiteUserId}, ${blackUserId}, '${pgn}', 'white', 'checkmate', 'black')`,
    );
    const row = sqlite.prepare("SELECT id FROM games WHERE invite_token = ?").get(token) as {
      id: number;
    };
    gameId = row.id;
  });

  afterAll(() => {
    cleanupPlayerStats(whiteUserId);
    cleanupPlayerStats(blackUserId);
    sqlite.exec(`DELETE FROM games WHERE id = ${gameId}`);
    sqlite.exec(`DELETE FROM users WHERE id IN (${whiteUserId}, ${blackUserId})`);
  });

  it("creates stats for white player's moves only", () => {
    aggregatePlayerGame(whiteUserId, gameId);

    const e4Stat = getPlayerStat(whiteUserId, startFen, "e4", "white");
    expect(e4Stat).toBeDefined();
    expect(e4Stat!.white).toBe(1);
    expect(e4Stat!.total_games).toBe(1);

    const nf3Stat = getPlayerStat(whiteUserId, afterE5Fen, "Nf3", "white");
    expect(nf3Stat).toBeDefined();
    expect(nf3Stat!.white).toBe(1);
    expect(nf3Stat!.total_games).toBe(1);

    const bc4Stat = getPlayerStat(whiteUserId, afterNc6Fen, "Bc4", "white");
    expect(bc4Stat).toBeDefined();
    expect(bc4Stat!.white).toBe(1);
    expect(bc4Stat!.total_games).toBe(1);
  });

  it("creates stats for black player's moves only", () => {
    aggregatePlayerGame(blackUserId, gameId);

    const e5Stat = getPlayerStat(blackUserId, afterE4Fen, "e5", "black");
    expect(e5Stat).toBeDefined();
    expect(e5Stat!.white).toBe(1);
    expect(e5Stat!.total_games).toBe(1);

    const nc6Stat = getPlayerStat(blackUserId, afterNf3Fen, "Nc6", "black");
    expect(nc6Stat).toBeDefined();
    expect(nc6Stat!.white).toBe(1);
    expect(nc6Stat!.total_games).toBe(1);

    const bc5Stat = getPlayerStat(blackUserId, afterBc4Fen, "Bc5", "black");
    expect(bc5Stat).toBeDefined();
    expect(bc5Stat!.white).toBe(1);
    expect(bc5Stat!.total_games).toBe(1);
  });

  it("does not create stats for opponent's moves", () => {
    const stat = getPlayerStat(whiteUserId, afterE4Fen, "e5", "white");
    expect(stat).toBeUndefined();
  });
});

describe("backfillPlayerStats", () => {
  const userId = 80020;
  const opponentId = 80021;
  const gameIds: number[] = [];

  beforeAll(() => {
    seedTestUser(userId);
    seedTestUser(opponentId);
    cleanupPlayerStats(userId);

    // Game 1: user plays white, wins
    const token1 = `test-bf1-${Date.now()}`;
    sqlite.exec(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, pgn, result_winner, result_reason, current_turn)
       VALUES ('${token1}', 'checkmate', ${userId}, ${opponentId}, '1. e4 e5 2. Nf3 Nc6', 'white', 'checkmate', 'black')`,
    );
    const row1 = sqlite.prepare("SELECT id FROM games WHERE invite_token = ?").get(token1) as {
      id: number;
    };
    gameIds.push(row1.id);

    // Game 2: user plays black, loses
    const token2 = `test-bf2-${Date.now()}`;
    sqlite.exec(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, pgn, result_winner, result_reason, current_turn)
       VALUES ('${token2}', 'checkmate', ${opponentId}, ${userId}, '1. d4 d5 2. c4 e6', 'white', 'checkmate', 'black')`,
    );
    const row2 = sqlite.prepare("SELECT id FROM games WHERE invite_token = ?").get(token2) as {
      id: number;
    };
    gameIds.push(row2.id);
  });

  afterAll(() => {
    cleanupPlayerStats(userId);
    for (const id of gameIds) {
      sqlite.exec(`DELETE FROM games WHERE id = ${id}`);
    }
    sqlite.exec(`DELETE FROM users WHERE id IN (${userId}, ${opponentId})`);
  });

  it("processes all games and sets playerStatsIndexed flag", async () => {
    await backfillPlayerStats(userId);

    const user = sqlite
      .prepare("SELECT player_stats_indexed FROM users WHERE id = ?")
      .get(userId) as {
      player_stats_indexed: number;
    };
    expect(user.player_stats_indexed).toBe(1);

    // Stats from game 1 (white)
    const startFen = normalizeFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const e4Stat = getPlayerStat(userId, startFen, "e4", "white");
    expect(e4Stat).toBeDefined();
    expect(e4Stat!.total_games).toBe(1);

    // Stats from game 2 (black)
    const chess = new Chess();
    chess.move("d4");
    const afterD4Fen = normalizeFen(chess.fen());
    const d5Stat = getPlayerStat(userId, afterD4Fen, "d5", "black");
    expect(d5Stat).toBeDefined();
    expect(d5Stat!.total_games).toBe(1);
  });
});

describe("aggregatePlayerGameIfIndexed", () => {
  const indexedUserId = 80030;
  const nonIndexedUserId = 80031;
  const opponentId = 80032;
  let gameId: number;

  beforeAll(() => {
    seedTestUser(indexedUserId);
    seedTestUser(nonIndexedUserId);
    seedTestUser(opponentId);
    cleanupPlayerStats(indexedUserId);
    cleanupPlayerStats(nonIndexedUserId);

    // Mark indexed user as indexed
    sqlite.exec(`UPDATE users SET player_stats_indexed = 1 WHERE id = ${indexedUserId}`);

    const token = `test-aif-${Date.now()}`;
    sqlite.exec(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, pgn, result_winner, result_reason, current_turn)
       VALUES ('${token}', 'checkmate', ${indexedUserId}, ${opponentId}, '1. e4 e5', 'white', 'checkmate', 'black')`,
    );
    const row = sqlite.prepare("SELECT id FROM games WHERE invite_token = ?").get(token) as {
      id: number;
    };
    gameId = row.id;
  });

  afterAll(() => {
    cleanupPlayerStats(indexedUserId);
    cleanupPlayerStats(nonIndexedUserId);
    sqlite.exec(`DELETE FROM games WHERE id = ${gameId}`);
    sqlite.exec(
      `DELETE FROM users WHERE id IN (${indexedUserId}, ${nonIndexedUserId}, ${opponentId})`,
    );
  });

  it("aggregates for indexed user", () => {
    aggregatePlayerGameIfIndexed(indexedUserId, gameId);
    const startFen = normalizeFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const stat = getPlayerStat(indexedUserId, startFen, "e4", "white");
    expect(stat).toBeDefined();
    expect(stat!.total_games).toBe(1);
  });

  it("skips non-indexed user", () => {
    // Create a game for the non-indexed user
    const token2 = `test-aif2-${Date.now()}`;
    sqlite.exec(
      `INSERT INTO games (invite_token, status, white_player_id, black_player_id, pgn, result_winner, result_reason, current_turn)
       VALUES ('${token2}', 'checkmate', ${nonIndexedUserId}, ${opponentId}, '1. e4 e5', 'white', 'checkmate', 'black')`,
    );
    const row = sqlite.prepare("SELECT id FROM games WHERE invite_token = ?").get(token2) as {
      id: number;
    };
    const game2Id = row.id;

    aggregatePlayerGameIfIndexed(nonIndexedUserId, game2Id);
    const startFen = normalizeFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const stat = getPlayerStat(nonIndexedUserId, startFen, "e4", "white");
    expect(stat).toBeUndefined();

    sqlite.exec(`DELETE FROM games WHERE id = ${game2Id}`);
  });
});
