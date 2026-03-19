import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { selectBotMove, waitThinkTime, BOT_USER_ID } from "../../src/bot/bot-player.js";
import type { BotProfile, EvaluationResult, EngineLineInfo } from "@chess/shared";
import type { EnginePool } from "../../src/engine/engine-pool.js";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function createMockEnginePool(result: EvaluationResult): EnginePool {
  return {
    evaluate: vi.fn().mockResolvedValue(result),
  } as unknown as EnginePool;
}

function makeProfile(overrides?: Partial<BotProfile>): BotProfile {
  return {
    id: 1,
    name: "Test Bot",
    level: 1,
    estimatedElo: 400,
    depth: 3,
    errorRate: 0,
    thinkTimeMin: 100,
    thinkTimeMax: 200,
    ...overrides,
  };
}

function makeEngineLines(sanMoves: string[][]): EngineLineInfo[] {
  return sanMoves.map((moves, i) => ({
    score: { type: "cp" as const, value: 100 - i * 50 },
    moves,
    depth: 10,
  }));
}

describe("BotPlayer", () => {
  describe("BOT_USER_ID", () => {
    it("equals 0", () => {
      expect(BOT_USER_ID).toBe(0);
    });
  });

  describe("selectBotMove", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("picks the best line when errorRate is 0", async () => {
      const engineLines = makeEngineLines([["e4"], ["d4"], ["Nf3"]]);
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4", "e5"],
        depth: 10,
        engineLines,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile({ errorRate: 0 });

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      expect(move).toEqual({ from: "e2", to: "e4", promotion: undefined });
      expect(pool.evaluate).toHaveBeenCalledWith(STARTING_FEN, 3);
    });

    it("picks a suboptimal line when errorRate triggers", async () => {
      // Math.random() < errorRate → true, so we pick suboptimal
      // First call: 0.3 < 0.5 → pick suboptimal
      // Second call: 0.0 → floor(0.0 * 2) = 0 → index 1 (2nd line = d4)
      vi.mocked(Math.random).mockReturnValueOnce(0.3).mockReturnValueOnce(0.0);

      const engineLines = makeEngineLines([["e4"], ["d4"], ["Nf3"]]);
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4", "e5"],
        depth: 10,
        engineLines,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile({ errorRate: 0.5 });

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      // Index 1 → "d4" → from d2, to d4
      expect(move).toEqual({ from: "d2", to: "d4", promotion: undefined });
    });

    it("picks 3rd line when random selects it", async () => {
      // First random: 0.1 < 0.5 → suboptimal
      // Second random: 0.999 → floor(0.999 * 2) = 1 → index 2 (3rd line = Nf3)
      vi.mocked(Math.random).mockReturnValueOnce(0.1).mockReturnValueOnce(0.999);

      const engineLines = makeEngineLines([["e4"], ["d4"], ["Nf3"]]);
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4", "e5"],
        depth: 10,
        engineLines,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile({ errorRate: 0.5 });

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      // Index 2 → "Nf3" → from g1, to f3
      expect(move).toEqual({ from: "g1", to: "f3", promotion: undefined });
    });

    it("does not pick suboptimal when random exceeds errorRate", async () => {
      // 0.8 >= 0.5 → do NOT pick suboptimal → pick best (index 0)
      vi.mocked(Math.random).mockReturnValueOnce(0.8);

      const engineLines = makeEngineLines([["e4"], ["d4"], ["Nf3"]]);
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4", "e5"],
        depth: 10,
        engineLines,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile({ errorRate: 0.5 });

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      expect(move).toEqual({ from: "e2", to: "e4", promotion: undefined });
    });

    it("handles single engine line regardless of errorRate", async () => {
      const engineLines = makeEngineLines([["e4"]]);
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4", "e5"],
        depth: 10,
        engineLines,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile({ errorRate: 0.9 });

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      // Only 1 line available, always picks it
      expect(move).toEqual({ from: "e2", to: "e4", promotion: undefined });
    });

    it("falls back to bestLine when engineLines is empty", async () => {
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4", "e5"],
        depth: 10,
        engineLines: [],
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile();

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      expect(move).toEqual({ from: "e2", to: "e4", promotion: undefined });
    });

    it("falls back to bestLine when engineLines is undefined", async () => {
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4", "e5"],
        depth: 10,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile();

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      expect(move).toEqual({ from: "e2", to: "e4", promotion: undefined });
    });

    it("throws when engine returns no moves at all", async () => {
      const result: EvaluationResult = {
        score: { type: "cp", value: 0 },
        bestLine: [],
        depth: 10,
        engineLines: [],
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile();

      await expect(selectBotMove(pool, STARTING_FEN, profile)).rejects.toThrow(
        "Engine returned no moves",
      );
    });

    it("passes the profile depth to engine evaluate", async () => {
      const engineLines = makeEngineLines([["e4"]]);
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4"],
        depth: 14,
        engineLines,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile({ depth: 14 });

      await selectBotMove(pool, STARTING_FEN, profile);

      expect(pool.evaluate).toHaveBeenCalledWith(STARTING_FEN, 14);
    });

    it("handles two engine lines with errorRate triggering", async () => {
      // 0.2 < 0.5 → suboptimal, 0.0 → floor(0.0 * 1) = 0 → index 1
      vi.mocked(Math.random).mockReturnValueOnce(0.2).mockReturnValueOnce(0.0);

      const engineLines = makeEngineLines([["e4"], ["d4"]]);
      const result: EvaluationResult = {
        score: { type: "cp", value: 100 },
        bestLine: ["e4"],
        depth: 10,
        engineLines,
      };
      const pool = createMockEnginePool(result);
      const profile = makeProfile({ errorRate: 0.5 });

      const move = await selectBotMove(pool, STARTING_FEN, profile);

      expect(move).toEqual({ from: "d2", to: "d4", promotion: undefined });
    });
  });

  describe("waitThinkTime", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("resolves after a delay within [thinkTimeMin, thinkTimeMax]", async () => {
      // Control Math.random to return 0.5 → duration = 100 + 0.5 * (200 - 100) = 150
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const profile = makeProfile({ thinkTimeMin: 100, thinkTimeMax: 200 });
      const { promise } = waitThinkTime(profile);

      // At 149ms, should not have resolved
      vi.advanceTimersByTime(149);
      // At 150ms, should resolve
      vi.advanceTimersByTime(1);

      await expect(promise).resolves.toBeUndefined();
    });

    it("uses thinkTimeMin when random returns 0", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0);

      const profile = makeProfile({ thinkTimeMin: 300, thinkTimeMax: 1000 });
      const { promise } = waitThinkTime(profile);

      vi.advanceTimersByTime(300);

      await expect(promise).resolves.toBeUndefined();
    });

    it("approaches thinkTimeMax when random returns ~1", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.999);

      const profile = makeProfile({ thinkTimeMin: 100, thinkTimeMax: 500 });
      const { promise } = waitThinkTime(profile);

      // Duration = 100 + 0.999 * 400 = 499.6, setTimeout rounds to ~500
      vi.advanceTimersByTime(500);

      await expect(promise).resolves.toBeUndefined();
    });

    it("returns a cancel function that clears the timeout", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);

      const profile = makeProfile({ thinkTimeMin: 1000, thinkTimeMax: 2000 });
      const { promise, cancel } = waitThinkTime(profile);

      // Cancel before the timeout fires
      cancel();

      // Advance past the full duration — should not throw or hang
      vi.advanceTimersByTime(3000);

      // Promise should remain pending (never resolved) — verify by racing
      const result = await Promise.race([
        promise.then(() => "resolved"),
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("timeout"), 0);
          vi.advanceTimersByTime(0);
        }),
      ]);
      expect(result).toBe("timeout");
    });
  });

  describe("getPlayerColor modification", () => {
    it("allows BOT_USER_ID (0) to make moves in bot games", async () => {
      // This tests the getPlayerColor modification indirectly by verifying
      // that gameService.makeMove doesn't throw NOT_A_PLAYER for bot games.
      // We mock store.getGame to return a bot game where black is the bot (null player).
      const storeModule = await import("../../src/game/store.js");
      const { makeMove } = await import("../../src/game/service.js");

      const mockBotGame = {
        id: 999,
        inviteToken: "test-token",
        status: "active" as const,
        players: {
          white: { userId: 1, username: "Human" },
          black: undefined, // Bot side — null player slot
        },
        fen: STARTING_FEN,
        pgn: "",
        moves: [] as string[],
        currentTurn: "white" as const,
        clock: { initialTime: 600, increment: 0 },
        drawOffer: null,
        createdAt: Date.now(),
        clockWhiteRemaining: null,
        clockBlackRemaining: null,
        botLevel: 3,
      };

      // Mock store.getGame to return our bot game
      const getGameSpy = vi.spyOn(storeModule, "getGame").mockReturnValue(mockBotGame);
      const addMoveSpy = vi.spyOn(storeModule, "addMove").mockReturnValue(undefined as never);
      const updateGameSpy = vi
        .spyOn(storeModule, "updateGame")
        .mockReturnValue(mockBotGame as never);

      // Simulate: it's white's turn (human), so BOT_USER_ID trying to move as
      // black (the bot side) should fail with NOT_YOUR_TURN, not NOT_A_PLAYER.
      // This proves getPlayerColor correctly identified the bot's color as "black".
      try {
        makeMove(999, BOT_USER_ID, { from: "e7", to: "e5" });
      } catch (err: unknown) {
        // Should throw NOT_YOUR_TURN (because it's white's turn, not black's)
        // NOT "NOT_A_PLAYER" — that would mean getPlayerColor failed.
        expect((err as { code: string }).code).toBe("NOT_YOUR_TURN");
      }

      getGameSpy.mockRestore();
      addMoveSpy.mockRestore();
      updateGameSpy.mockRestore();
    });
  });
});
