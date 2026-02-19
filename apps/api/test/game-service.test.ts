import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as gameService from "../src/game/service.js";
import * as store from "../src/game/store.js";
import { GameError } from "../src/game/errors.js";
import type { DrizzleDb } from "../src/db/index.js";
import type { Database as DatabaseType } from "better-sqlite3";
import { createInMemoryDb, cleanTables } from "./helpers.js";

let db: DrizzleDb;
let sqliteHandle: DatabaseType;
let closeDb: () => void;

beforeAll(() => {
  const created = createInMemoryDb();
  db = created.db;
  sqliteHandle = created.sqlite;
  closeDb = created.close;
});

beforeEach(() => {
  cleanTables(sqliteHandle);
});

afterAll(() => {
  closeDb();
});

describe("Game Creation", () => {
  it("creates a game in waiting status with valid FEN", () => {
    const game = gameService.createGame(db, 1);
    expect(game.status).toBe("waiting");
    expect(game.fen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(game.id).toBeGreaterThan(0);
  });

  it("assigns creator a color (white or black)", () => {
    const game = gameService.createGame(db, 1);
    const creatorIsWhite = game.players.white?.userId === 1;
    const creatorIsBlack = game.players.black?.userId === 1;
    expect(creatorIsWhite || creatorIsBlack).toBe(true);
    expect(creatorIsWhite && creatorIsBlack).toBe(false);
  });

  it("generates an invite token", () => {
    const game = gameService.createGame(db, 1);
    expect(game.inviteToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("defaults to 10 minutes, no increment", () => {
    const game = gameService.createGame(db, 1);
    expect(game.clock).toEqual({ initialTime: 600, increment: 0 });
  });

  it("respects custom clock config", () => {
    const game = gameService.createGame(db, 1, { initialTime: 300, increment: 5 });
    expect(game.clock).toEqual({ initialTime: 300, increment: 5 });
  });
});

describe("Joining", () => {
  it("opponent joins with correct invite token — status becomes active", () => {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    expect(joined.status).toBe("active");
    expect(joined.players.white).toBeDefined();
    expect(joined.players.black).toBeDefined();
    const userIds = [joined.players.white!.userId, joined.players.black!.userId];
    expect(userIds).toContain(100);
    expect(userIds).toContain(200);
  });

  it("rejects wrong invite token", () => {
    const game = gameService.createGame(db, 100);
    expect(() => gameService.joinGame(db, game.id, 200, "wrong-token")).toThrow(GameError);
    try {
      gameService.joinGame(db, game.id, 200, "wrong-token");
    } catch (err) {
      expect((err as GameError).code).toBe("INVALID_INVITE_TOKEN");
    }
  });

  it("rejects joining own game", () => {
    const game = gameService.createGame(db, 100);
    expect(() => gameService.joinGame(db, game.id, 100, game.inviteToken)).toThrow(GameError);
    try {
      gameService.joinGame(db, game.id, 100, game.inviteToken);
    } catch (err) {
      expect((err as GameError).code).toBe("CANNOT_JOIN_OWN_GAME");
    }
  });

  it("rejects joining a game not in waiting status", () => {
    const game = gameService.createGame(db, 100);
    gameService.joinGame(db, game.id, 200, game.inviteToken);
    expect(() => gameService.joinGame(db, game.id, 300, game.inviteToken)).toThrow(GameError);
    try {
      gameService.joinGame(db, game.id, 300, game.inviteToken);
    } catch (err) {
      expect((err as GameError).code).toBe("INVALID_STATUS");
    }
  });
});

describe("Moves", () => {
  function createActiveGame() {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;
    return { gameId: joined.id, whiteUserId, blackUserId };
  }

  it("legal move is accepted, FEN and PGN update", () => {
    const { gameId, whiteUserId } = createActiveGame();
    const result = gameService.makeMove(db, gameId, whiteUserId, { from: "e2", to: "e4" });
    expect(result.san).toBe("e4");
    expect(result.status).toBe("active");
    expect(result.fen).toContain("4P3");
    expect(result.pgn).toContain("e4");
  });

  it("illegal move is rejected with ILLEGAL_MOVE", () => {
    const { gameId, whiteUserId } = createActiveGame();
    try {
      gameService.makeMove(db, gameId, whiteUserId, { from: "e2", to: "e5" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("ILLEGAL_MOVE");
    }
  });

  it("moving out of turn is rejected with NOT_YOUR_TURN", () => {
    const { gameId, blackUserId } = createActiveGame();
    try {
      gameService.makeMove(db, gameId, blackUserId, { from: "e7", to: "e5" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("NOT_YOUR_TURN");
    }
  });

  it("moving in a non-active game is rejected", () => {
    const game = gameService.createGame(db, 100);
    try {
      gameService.makeMove(db, game.id, 100, { from: "e2", to: "e4" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("INVALID_STATUS");
    }
  });

  it("non-player cannot make a move", () => {
    const { gameId } = createActiveGame();
    try {
      gameService.makeMove(db, gameId, 999, { from: "e2", to: "e4" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("NOT_A_PLAYER");
    }
  });

  it("pawn promotion works correctly", () => {
    const { gameId, whiteUserId } = createActiveGame();
    store.updateGame(db, gameId, {
      fen: "k7/4P3/8/8/8/8/8/K7 w - - 0 1",
      currentTurn: "white",
    });

    const result = gameService.makeMove(db, gameId, whiteUserId, {
      from: "e7",
      to: "e8",
      promotion: "q",
    });
    expect(result.san).toBe("e8=Q+");
    expect(result.fen).toContain("Q");
  });
});

describe("Game-Over Detection", () => {
  function createActiveGame() {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;
    return { gameId: joined.id, whiteUserId, blackUserId };
  }

  it("Scholar's mate → checkmate with correct winner", () => {
    const { gameId, whiteUserId, blackUserId } = createActiveGame();

    gameService.makeMove(db, gameId, whiteUserId, { from: "e2", to: "e4" });
    gameService.makeMove(db, gameId, blackUserId, { from: "e7", to: "e5" });
    gameService.makeMove(db, gameId, whiteUserId, { from: "d1", to: "h5" });
    gameService.makeMove(db, gameId, blackUserId, { from: "b8", to: "c6" });
    gameService.makeMove(db, gameId, whiteUserId, { from: "f1", to: "c4" });
    gameService.makeMove(db, gameId, blackUserId, { from: "g8", to: "f6" });
    const result = gameService.makeMove(db, gameId, whiteUserId, { from: "h5", to: "f7" });

    expect(result.status).toBe("checkmate");
    expect(result.result).toEqual({ winner: "white", reason: "checkmate" });

    const game = gameService.getGame(db, gameId);
    expect(game.status).toBe("checkmate");
    expect(game.result).toEqual({ winner: "white", reason: "checkmate" });
  });

  it("stalemate position → status becomes stalemate", () => {
    const { gameId, whiteUserId } = createActiveGame();
    store.updateGame(db, gameId, {
      fen: "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1",
      currentTurn: "white",
    });

    const result = gameService.makeMove(db, gameId, whiteUserId, { from: "c1", to: "c7" });
    expect(result.status).toBe("stalemate");
    expect(result.result).toEqual({ reason: "stalemate" });
  });

  it("insufficient material triggers draw", () => {
    const { gameId, whiteUserId } = createActiveGame();
    store.updateGame(db, gameId, {
      fen: "4k3/8/8/8/8/8/4b3/4K3 w - - 0 1",
      currentTurn: "white",
    });

    const result = gameService.makeMove(db, gameId, whiteUserId, { from: "e1", to: "e2" });
    expect(result.status).toBe("draw");
    expect(result.result).toEqual({ reason: "draw" });
  });
});

describe("Resign", () => {
  function createActiveGame() {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    return { gameId: joined.id, whiteUserId };
  }

  it("player resigns → status resigned, opponent wins", () => {
    const { gameId, whiteUserId } = createActiveGame();
    const game = gameService.resignGame(db, gameId, whiteUserId);
    expect(game.status).toBe("resigned");
    expect(game.result).toEqual({ winner: "black", reason: "resigned" });
  });

  it("cannot resign a non-active game", () => {
    const game = gameService.createGame(db, 100);
    try {
      gameService.resignGame(db, game.id, 100);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("INVALID_STATUS");
    }
  });

  it("non-player cannot resign", () => {
    const { gameId } = createActiveGame();
    try {
      gameService.resignGame(db, gameId, 999);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("NOT_A_PLAYER");
    }
  });
});

describe("Draw", () => {
  function createActiveGame() {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;
    return { gameId: joined.id, whiteUserId, blackUserId };
  }

  it("player offers draw → drawOffer is set", () => {
    const { gameId, whiteUserId } = createActiveGame();
    const game = gameService.offerOrAcceptDraw(db, gameId, whiteUserId);
    expect(game.drawOffer).toBe("white");
  });

  it("opponent accepts → status draw", () => {
    const { gameId, whiteUserId, blackUserId } = createActiveGame();
    gameService.offerOrAcceptDraw(db, gameId, whiteUserId);
    const game = gameService.offerOrAcceptDraw(db, gameId, blackUserId);
    expect(game.status).toBe("draw");
    expect(game.result).toEqual({ reason: "draw" });
    expect(game.drawOffer).toBeNull();
  });

  it("draw offer canceled when offering player makes a move", () => {
    const { gameId, whiteUserId } = createActiveGame();
    gameService.offerOrAcceptDraw(db, gameId, whiteUserId);
    gameService.makeMove(db, gameId, whiteUserId, { from: "e2", to: "e4" });
    const game = gameService.getGame(db, gameId);
    expect(game.drawOffer).toBeNull();
  });

  it("same player offering twice is a no-op", () => {
    const { gameId, whiteUserId } = createActiveGame();
    gameService.offerOrAcceptDraw(db, gameId, whiteUserId);
    const second = gameService.offerOrAcceptDraw(db, gameId, whiteUserId);
    expect(second.drawOffer).toBe("white");
    expect(second.status).toBe("active");
  });

  it("cannot offer draw in non-active game", () => {
    const game = gameService.createGame(db, 100);
    try {
      gameService.offerOrAcceptDraw(db, game.id, 100);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("INVALID_STATUS");
    }
  });
});

describe("Abort", () => {
  function createActiveGame() {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    return { gameId: joined.id, whiteUserId };
  }

  it("creator aborts waiting game → status aborted", () => {
    const game = gameService.createGame(db, 100);
    const creatorId = game.players.white?.userId ?? game.players.black?.userId;
    const aborted = gameService.abortGame(db, game.id, creatorId!);
    expect(aborted.status).toBe("aborted");
  });

  it("cannot abort an active game", () => {
    const { gameId, whiteUserId } = createActiveGame();
    try {
      gameService.abortGame(db, gameId, whiteUserId);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("INVALID_STATUS");
    }
  });

  it("non-creator cannot abort", () => {
    const game = gameService.createGame(db, 100);
    try {
      gameService.abortGame(db, game.id, 200);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GameError);
      expect((err as GameError).code).toBe("NOT_A_PLAYER");
    }
  });
});

describe("Store — getGameByInviteToken", () => {
  it("returns game when token matches", () => {
    const game = store.createGame(db, 100);
    const found = store.getGameByInviteToken(db, game.inviteToken);
    expect(found).toBeDefined();
    expect(found!.id).toBe(game.id);
    expect(found!.inviteToken).toBe(game.inviteToken);
  });

  it("returns undefined for unknown token", () => {
    const found = store.getGameByInviteToken(db, "nonexistent-token");
    expect(found).toBeUndefined();
  });
});

describe("Store — getGamesByUserId", () => {
  it("returns games where user is white or black", () => {
    const userId = 100;
    const g1 = store.createGame(db, userId);
    const g2 = store.createGame(db, userId);
    const games = store.getGamesByUserId(db, userId);
    const ids = games.map((g) => g.id);
    expect(ids).toContain(g1.id);
    expect(ids).toContain(g2.id);
  });

  it("returns empty array for user with no games", () => {
    const games = store.getGamesByUserId(db, 99999);
    expect(games).toEqual([]);
  });

  it("returns games ordered by createdAt descending", () => {
    const userId = 100;
    store.createGame(db, userId);
    store.createGame(db, userId);
    const games = store.getGamesByUserId(db, userId);
    for (let i = 0; i < games.length - 1; i++) {
      expect(games[i].createdAt).toBeGreaterThanOrEqual(games[i + 1].createdAt);
    }
  });
});

describe("Store — moves reconstruction from DB", () => {
  it("getGame returns moves from moves table after makeMove", () => {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;

    gameService.makeMove(db, joined.id, whiteUserId, { from: "e2", to: "e4" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "e7", to: "e5" });

    const fetched = gameService.getGame(db, joined.id);
    expect(fetched.moves).toEqual(["e4", "e5"]);
    expect(fetched.moves.length).toBe(2);
  });

  it("moves are ordered by moveNumber", () => {
    const game = gameService.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;

    gameService.makeMove(db, joined.id, whiteUserId, { from: "e2", to: "e4" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "e7", to: "e5" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "g1", to: "f3" });

    const fetched = gameService.getGame(db, joined.id);
    expect(fetched.moves).toEqual(["e4", "e5", "Nf3"]);
  });

  it("newly created game has empty moves array", () => {
    const game = gameService.createGame(db, 100);
    const fetched = gameService.getGame(db, game.id);
    expect(fetched.moves).toEqual([]);
  });
});
