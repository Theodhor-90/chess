import { describe, it, expect, beforeAll } from "vitest";
import * as store from "../src/game/store.js";
import { ensureSchema } from "./helpers.js";

beforeAll(() => {
  ensureSchema();
});

describe("Game Persistence", () => {
  it("created game can be retrieved by ID", () => {
    const game = store.createGame(1);
    const fetched = store.getGame(game.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(game.id);
    expect(fetched!.inviteToken).toBe(game.inviteToken);
    expect(fetched!.status).toBe("waiting");
  });

  it("created game can be retrieved by invite token", () => {
    const game = store.createGame(1);
    const fetched = store.getGameByInviteToken(game.inviteToken);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(game.id);
  });

  it("updateGame persists changes", () => {
    const game = store.createGame(1);
    store.updateGame(game.id, { status: "active", fen: "custom-fen" });
    const fetched = store.getGame(game.id);
    expect(fetched!.status).toBe("active");
    expect(fetched!.fen).toBe("custom-fen");
  });

  it("getGamesByUserId returns games for both white and black player", () => {
    const game = store.createGame(501);
    const isWhite = game.players.white?.userId === 501;
    const opponentColor = isWhite ? "black" : "white";
    store.updateGame(game.id, {
      status: "active",
      players: {
        ...game.players,
        [opponentColor]: { userId: 502, color: opponentColor },
      },
    });

    const user501Games = store.getGamesByUserId(501);
    const user502Games = store.getGamesByUserId(502);
    expect(user501Games.some((g) => g.id === game.id)).toBe(true);
    expect(user502Games.some((g) => g.id === game.id)).toBe(true);
  });

  it("getGame returns undefined for non-existent game", () => {
    expect(store.getGame(999999)).toBeUndefined();
  });

  it("getGameByInviteToken returns undefined for unknown token", () => {
    expect(store.getGameByInviteToken("no-such-token")).toBeUndefined();
  });
});

describe("Move Persistence", () => {
  it("addMove persists moves and getGame returns them in order", () => {
    const game = store.createGame(1);
    store.addMove(game.id, 1, "e4");
    store.addMove(game.id, 2, "e5");
    store.addMove(game.id, 3, "Nf3");

    const fetched = store.getGame(game.id);
    expect(fetched!.moves).toEqual(["e4", "e5", "Nf3"]);
  });

  it("game with no moves returns empty moves array", () => {
    const game = store.createGame(1);
    const fetched = store.getGame(game.id);
    expect(fetched!.moves).toEqual([]);
  });

  it("moves survive across multiple getGame calls", () => {
    const game = store.createGame(1);
    store.addMove(game.id, 1, "d4");
    store.addMove(game.id, 2, "d5");

    const first = store.getGame(game.id);
    const second = store.getGame(game.id);
    expect(first!.moves).toEqual(["d4", "d5"]);
    expect(second!.moves).toEqual(["d4", "d5"]);
  });
});

describe("Result Persistence", () => {
  it("game result with winner persists correctly", () => {
    const game = store.createGame(1);
    store.updateGame(game.id, {
      status: "checkmate",
      result: { winner: "white", reason: "checkmate" },
    });
    const fetched = store.getGame(game.id);
    expect(fetched!.status).toBe("checkmate");
    expect(fetched!.result).toEqual({ winner: "white", reason: "checkmate" });
  });

  it("game result without winner (draw) persists correctly", () => {
    const game = store.createGame(1);
    store.updateGame(game.id, {
      status: "draw",
      result: { reason: "draw" },
    });
    const fetched = store.getGame(game.id);
    expect(fetched!.status).toBe("draw");
    expect(fetched!.result).toEqual({ reason: "draw" });
  });
});
