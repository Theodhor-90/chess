import { describe, it, expect, vi } from "vitest";
import type { EvalScore, EvaluationResult } from "@chess/shared";
import type { StockfishService } from "../src/services/stockfish.js";
import {
  classifyMove,
  computeAccuracy,
  mateScoreToCp,
  analyzeGame,
} from "../src/services/analysis.js";

function makeEval(score: EvalScore, bestLine: string[] = ["e4"]): EvaluationResult {
  return { score, bestLine, depth: 18 };
}

function createMockService(results: Map<string, EvaluationResult>) {
  const calls: string[] = [];
  return {
    service: {
      evaluate: vi.fn(async (fen: string) => {
        calls.push(fen);
        const result = results.get(fen);
        if (!result) throw new Error(`Unexpected FEN: ${fen}`);
        return result;
      }),
    } as unknown as StockfishService,
    calls,
  };
}

describe("mateScoreToCp", () => {
  it("converts mate-in-2 to 50000", () => {
    expect(mateScoreToCp(2)).toBe(50000);
  });

  it("converts negative mate values preserving sign", () => {
    expect(mateScoreToCp(-2)).toBe(-50000);
  });

  it("returns 0 for mate value 0", () => {
    expect(mateScoreToCp(0)).toBe(0);
  });
});

describe("classifyMove", () => {
  it('returns "best" when played move matches engine top move', () => {
    const result = classifyMove(
      { type: "cp", value: 50 },
      { type: "cp", value: 20 },
      "e4",
      "e4",
      true,
    );
    expect(result).toBe("best");
  });

  it('returns "good" for 0 centipawn loss', () => {
    // White's turn, eval before +50, eval after +50 (from black's perspective = -50 raw)
    // cpBefore = 50, cpAfter = -(-50) = 50, loss = 50 - 50 = 0
    const result = classifyMove(
      { type: "cp", value: 50 },
      { type: "cp", value: -50 },
      "e4",
      "d4",
      true,
    );
    expect(result).toBe("good");
  });

  it('returns "good" for 30 centipawn loss (upper boundary)', () => {
    // White's turn: cpBefore = 50, cpAfter = 50 - 30 = 20
    // After move it's black's turn, so evalAfter raw must be -20 (black perspective)
    const result = classifyMove(
      { type: "cp", value: 50 },
      { type: "cp", value: -20 },
      "e4",
      "d4",
      true,
    );
    expect(result).toBe("good");
  });

  it('returns "inaccuracy" for 31 centipawn loss', () => {
    // White's turn: cpBefore = 50, cpAfter = 50 - 31 = 19
    // evalAfter from black's turn: raw = -19
    const result = classifyMove(
      { type: "cp", value: 50 },
      { type: "cp", value: -19 },
      "e4",
      "d4",
      true,
    );
    expect(result).toBe("inaccuracy");
  });

  it('returns "inaccuracy" for 100 centipawn loss (upper boundary)', () => {
    // White's turn: cpBefore = 100, cpAfter = 100 - 100 = 0
    // evalAfter from black's turn: raw = 0
    const result = classifyMove(
      { type: "cp", value: 100 },
      { type: "cp", value: 0 },
      "e4",
      "d4",
      true,
    );
    expect(result).toBe("inaccuracy");
  });

  it('returns "mistake" for 101 centipawn loss', () => {
    // White's turn: cpBefore = 200, cpAfter = 200 - 101 = 99
    // evalAfter from black's turn: raw = -99
    const result = classifyMove(
      { type: "cp", value: 200 },
      { type: "cp", value: -99 },
      "e4",
      "d4",
      true,
    );
    expect(result).toBe("mistake");
  });

  it('returns "mistake" for 250 centipawn loss (upper boundary)', () => {
    // White's turn: cpBefore = 300, cpAfter = 300 - 250 = 50
    // evalAfter from black's turn: raw = -50
    const result = classifyMove(
      { type: "cp", value: 300 },
      { type: "cp", value: -50 },
      "e4",
      "d4",
      true,
    );
    expect(result).toBe("mistake");
  });

  it('returns "blunder" for 251 centipawn loss', () => {
    // White's turn: cpBefore = 300, cpAfter = 300 - 251 = 49
    // evalAfter from black's turn: raw = -49
    const result = classifyMove(
      { type: "cp", value: 300 },
      { type: "cp", value: -49 },
      "e4",
      "d4",
      true,
    );
    expect(result).toBe("blunder");
  });

  it("handles mate scores correctly", () => {
    // White's turn, before: mate in 5 = +20000, after: mate in 1 (opponent has mate) = cp -100000
    // cpBefore = 20000, cpAfter = -(-100000) = 100000... actually let's be more careful
    // Before: white to move, mate in 5 → mateScoreToCp(5) = 20000, isWhiteTurn=true → cpBefore = 20000
    // After: black to move, cp 0 → isWhiteTurn=false → cpAfter = -(0) = 0
    // loss = 20000 - 0 = 20000 → blunder
    const result = classifyMove(
      { type: "mate", value: 5 },
      { type: "cp", value: 0 },
      "Qh5",
      "a3",
      true,
    );
    expect(result).toBe("blunder");
  });

  it("works correctly for black's moves", () => {
    // Black's turn: black wants eval to go down (from white's perspective)
    // evalBefore: black to move, cp -50 → cpBefore = -(-50) = 50 (white's perspective)
    // evalAfter: white to move, cp 100 → cpAfter = 100 (white's perspective)
    // loss for black = cpAfter - cpBefore = 100 - 50 = 50 → inaccuracy
    const result = classifyMove(
      { type: "cp", value: -50 },
      { type: "cp", value: 100 },
      "e5",
      "a6",
      false,
    );
    expect(result).toBe("inaccuracy");
  });
});

describe("computeAccuracy", () => {
  it("returns 100 for zero losses", () => {
    expect(computeAccuracy([0, 0, 0])).toBe(100);
  });

  it("returns expected value for mixed losses", () => {
    // losses: [0, 50, 100]
    // per-move: [100, 50, 0]
    // average: 150 / 3 = 50
    expect(computeAccuracy([0, 50, 100])).toBe(50);
  });

  it("returns 0 for all losses >= 100", () => {
    expect(computeAccuracy([100, 200, 300])).toBe(0);
  });

  it("returns 100 for empty array", () => {
    expect(computeAccuracy([])).toBe(100);
  });
});

describe("analyzeGame", () => {
  const fen0 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const fen1 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  const fen2 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

  const fens = [fen0, fen1, fen2];
  const playedMoves = ["e4", "e5"];

  function buildResults(): Map<string, EvaluationResult> {
    const m = new Map<string, EvaluationResult>();
    // Starting position: white to move, eval +20, best move e4
    m.set(fen0, makeEval({ type: "cp", value: 20 }, ["e4"]));
    // After 1.e4: black to move, eval -25 (from black's perspective), best move e5
    m.set(fen1, makeEval({ type: "cp", value: -25 }, ["e5"]));
    // After 1...e5: white to move, eval +15, best move Nf3
    m.set(fen2, makeEval({ type: "cp", value: 15 }, ["Nf3"]));
    return m;
  }

  it("evaluates each FEN position sequentially", async () => {
    const { service, calls } = createMockService(buildResults());
    await analyzeGame(service, fens, playedMoves);
    expect(calls).toEqual([fen0, fen1, fen2]);
  });

  it("invokes progress callback with correct indices", async () => {
    const { service } = createMockService(buildResults());
    const progress: [number, number][] = [];
    await analyzeGame(service, fens, playedMoves, (i, total) => {
      progress.push([i, total]);
    });
    expect(progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });

  it("returns positions with correct classifications", async () => {
    const { service } = createMockService(buildResults());
    const result = await analyzeGame(service, fens, playedMoves);

    // Position 0: starting position, no classification
    expect(result.positions[0].classification).toBeNull();

    // Position 1: white played e4, which is the best move from position 0
    expect(result.positions[1].classification).toBe("best");

    // Position 2: black played e5, which is the best move from position 1
    expect(result.positions[2].classification).toBe("best");
  });

  it("computes white and black accuracy correctly", async () => {
    const results = new Map<string, EvaluationResult>();
    results.set(fen0, makeEval({ type: "cp", value: 20 }, ["e4"]));
    // White plays e4 (best move) → 0 loss
    results.set(fen1, makeEval({ type: "cp", value: -20 }, ["e5"]));
    // Black plays e5 (best move) → 0 loss
    results.set(fen2, makeEval({ type: "cp", value: 20 }, ["Nf3"]));

    const { service } = createMockService(results);
    const result = await analyzeGame(service, fens, playedMoves);

    expect(result.whiteAccuracy).toBe(100);
    expect(result.blackAccuracy).toBe(100);
  });

  it("sets null classification and centipawnLoss for starting position", async () => {
    const { service } = createMockService(buildResults());
    const result = await analyzeGame(service, fens, playedMoves);
    expect(result.positions[0].classification).toBeNull();
    expect(result.positions[0].centipawnLoss).toBeNull();
  });
});
