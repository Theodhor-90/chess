import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as store from "../src/game/store.js";
import * as gameService from "../src/game/service.js";
import type { DrizzleDb } from "../src/db/index.js";
import type { Database as DatabaseType } from "better-sqlite3";
import { createDb, sqlite as moduleSqlite } from "../src/db/index.js";
import { buildApp } from "../src/server.js";
import { unlinkSync } from "node:fs";
import {
  createTestDbOnDisk,
  cleanTables,
  bootstrapSchema,
  uniqueEmail,
  registerAndLogin,
  createAndJoinGame,
} from "./helpers.js";

let db: DrizzleDb;
let sqliteHandle: DatabaseType;
let filePath: string;
let cleanup: () => void;

beforeEach(() => {
  const created = createTestDbOnDisk();
  db = created.db;
  sqliteHandle = created.sqlite;
  filePath = created.filePath;
  cleanup = created.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("Data survives across app instances", () => {
  it("game created with one db connection is retrievable from another", () => {
    const game = store.createGame(db, 100);

    const second = createDb(filePath);
    try {
      const retrieved = store.getGame(second.db, game.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(game.id);
      expect(retrieved!.inviteToken).toBe(game.inviteToken);
      expect(retrieved!.status).toBe("waiting");
      expect(retrieved!.fen).toBe(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      );
    } finally {
      second.close();
    }
  });

  it("move history is intact when read from a second connection", () => {
    const game = store.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;

    gameService.makeMove(db, joined.id, whiteUserId, { from: "e2", to: "e4" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "e7", to: "e5" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "g1", to: "f3" });

    const second = createDb(filePath);
    try {
      const retrieved = store.getGame(second.db, joined.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.moves).toEqual(["e4", "e5", "Nf3"]);
      expect(retrieved!.moves.length).toBe(3);
      expect(retrieved!.pgn).toContain("Nf3");
      expect(retrieved!.status).toBe("active");
    } finally {
      second.close();
    }
  });

  it("game state (status, result) persists across connections", () => {
    const game = store.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    gameService.resignGame(db, joined.id, whiteUserId);

    const second = createDb(filePath);
    try {
      const retrieved = store.getGame(second.db, joined.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe("resigned");
      expect(retrieved!.result).toEqual({ winner: "black", reason: "resigned" });
    } finally {
      second.close();
    }
  });

  it("data persists after closing first connection and opening a new one", () => {
    const game = store.createGame(db, 100);
    const gameId = game.id;
    const inviteToken = game.inviteToken;
    sqliteHandle.close();

    const restarted = createDb(filePath);
    try {
      const retrieved = store.getGame(restarted.db, gameId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(gameId);
      expect(retrieved!.inviteToken).toBe(inviteToken);
      expect(retrieved!.status).toBe("waiting");
    } finally {
      restarted.close();
    }

    cleanup = () => {
      try {
        unlinkSync(filePath);
        unlinkSync(filePath + "-wal");
        unlinkSync(filePath + "-shm");
      } catch {
        void 0;
      }
    };
  });
});

describe("Move history integrity", () => {
  it("all moves present and in order after multiple moves", () => {
    const game = store.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;

    gameService.makeMove(db, joined.id, whiteUserId, { from: "e2", to: "e4" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "e7", to: "e5" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "g1", to: "f3" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "b8", to: "c6" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "f1", to: "c4" });

    const fetched = gameService.getGame(db, joined.id);
    expect(fetched.moves).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4"]);
    expect(fetched.moves.length).toBe(5);
  });

  it("PGN is reconstructable from stored moves", () => {
    const game = store.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;

    gameService.makeMove(db, joined.id, whiteUserId, { from: "e2", to: "e4" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "e7", to: "e5" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "d2", to: "d4" });

    const fetched = gameService.getGame(db, joined.id);
    expect(fetched.moves).toEqual(["e4", "e5", "d4"]);
    expect(fetched.pgn).toContain("2. d4");
  });
});

describe("Game list endpoint", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    bootstrapSchema(moduleSqlite);
    cleanTables(moduleSqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns only games where user is a player (white or black)", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("persist-list-c1"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("persist-list-c2"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("persist-list-c3"));

    const { gameId: g1 } = await createAndJoinGame(app, c1, c2);
    const { gameId: g2 } = await createAndJoinGame(app, c2, c3);

    const res1 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c1 },
    });
    expect(res1.statusCode).toBe(200);
    const games1 = res1.json().games;
    expect(games1).toHaveLength(1);
    expect(games1[0].id).toBe(g1);

    const res2 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c2 },
    });
    expect(res2.statusCode).toBe(200);
    const games2 = res2.json().games;
    expect(games2).toHaveLength(2);
    const ids2 = games2.map((g: { id: number }) => g.id);
    expect(ids2).toContain(g1);
    expect(ids2).toContain(g2);

    const res3 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c3 },
    });
    expect(res3.statusCode).toBe(200);
    const games3 = res3.json().games;
    expect(games3).toHaveLength(1);
    expect(games3[0].id).toBe(g2);
  });

  it("playerColor is correct for creator and joiner", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("persist-color-c1"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("persist-color-c2"));
    const { creatorColor } = await createAndJoinGame(app, c1, c2);

    const res1 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c1 },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().games[0].playerColor).toBe(creatorColor);

    const joinerColor = creatorColor === "white" ? "black" : "white";
    const res2 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c2 },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().games[0].playerColor).toBe(joinerColor);
  });
});

describe("Edge cases", () => {
  it("game with no moves (waiting status) persists correctly", () => {
    const game = store.createGame(db, 100);

    const fetched = store.getGame(db, game.id);
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe("waiting");
    expect(fetched!.moves).toEqual([]);
    expect(fetched!.pgn).toBe("");
    expect(fetched!.fen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );

    const second = createDb(filePath);
    try {
      const retrieved = store.getGame(second.db, game.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe("waiting");
      expect(retrieved!.moves).toEqual([]);
    } finally {
      second.close();
    }
  });

  it("completed game (checkmate) - result persists", () => {
    const game = store.createGame(db, 100);
    const joined = gameService.joinGame(db, game.id, 200, game.inviteToken);
    const whiteUserId = joined.players.white!.userId;
    const blackUserId = joined.players.black!.userId;

    gameService.makeMove(db, joined.id, whiteUserId, { from: "e2", to: "e4" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "e7", to: "e5" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "d1", to: "h5" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "b8", to: "c6" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "f1", to: "c4" });
    gameService.makeMove(db, joined.id, blackUserId, { from: "g8", to: "f6" });
    gameService.makeMove(db, joined.id, whiteUserId, { from: "h5", to: "f7" });

    const fetched = gameService.getGame(db, joined.id);
    expect(fetched.status).toBe("checkmate");
    expect(fetched.result).toEqual({ winner: "white", reason: "checkmate" });
    expect(fetched.moves).toEqual(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
    expect(fetched.pgn).toContain("Qxf7#");

    const second = createDb(filePath);
    try {
      const retrieved = store.getGame(second.db, joined.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe("checkmate");
      expect(retrieved!.result).toEqual({ winner: "white", reason: "checkmate" });
      expect(retrieved!.moves).toEqual(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
    } finally {
      second.close();
    }
  });

  it("aborted game - status persists", () => {
    const game = store.createGame(db, 100);
    const creatorId = game.players.white?.userId ?? game.players.black?.userId;
    gameService.abortGame(db, game.id, creatorId!);

    const fetched = store.getGame(db, game.id);
    expect(fetched).toBeDefined();
    expect(fetched!.status).toBe("aborted");
    expect(fetched!.moves).toEqual([]);

    const second = createDb(filePath);
    try {
      const retrieved = store.getGame(second.db, game.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe("aborted");
    } finally {
      second.close();
    }
  });
});
