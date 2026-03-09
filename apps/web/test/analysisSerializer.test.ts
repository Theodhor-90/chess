import { describe, it, expect } from "vitest";
import type { AnalyzedPosition } from "@chess/shared";
import { positionsToTree, treeToPositions } from "../src/services/analysisSerializer.js";

function createTestData() {
  const fens = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  ];

  const moves = ["e4", "e5", "Nf3"];

  const positions: AnalyzedPosition[] = [
    {
      fen: fens[0],
      evaluation: { score: { type: "cp", value: 20 }, bestLine: ["e4", "e5"], depth: 20 },
      classification: null,
      centipawnLoss: null,
    },
    {
      fen: fens[1],
      evaluation: { score: { type: "cp", value: -15 }, bestLine: ["e5"], depth: 20 },
      classification: "best",
      centipawnLoss: 5,
    },
    {
      fen: fens[2],
      evaluation: { score: { type: "cp", value: 30 }, bestLine: ["Nf3"], depth: 20 },
      classification: "good",
      centipawnLoss: 15,
    },
    {
      fen: fens[3],
      evaluation: { score: { type: "cp", value: -25 }, bestLine: ["Nc6"], depth: 20 },
      classification: "best",
      centipawnLoss: 5,
    },
  ];

  return { fens, moves, positions };
}

describe("positionsToTree", () => {
  it("produces valid tree structure", () => {
    const { fens, moves, positions } = createTestData();
    const tree = positionsToTree(fens, moves, positions);

    expect(tree.fen).toBe(fens[0]);
    expect(tree.san).toBeNull();
    expect(tree.classification).toBeNull();
    expect(tree.evaluation).toEqual(positions[0].evaluation);
    expect(tree.children).toHaveLength(1);

    let current = tree;
    for (let i = 0; i < moves.length; i++) {
      const child = current.children[0];
      expect(child.fen).toBe(fens[i + 1]);
      expect(child.san).toBe(moves[i]);
      expect(child.evaluation).toEqual(positions[i + 1].evaluation);
      expect(child.classification).toBe(positions[i + 1].classification);
      current = child;
    }

    expect(current.children).toHaveLength(0);
  });
});

describe("treeToPositions", () => {
  it("produces valid flat array", () => {
    const { fens, moves, positions } = createTestData();
    const tree = positionsToTree(fens, moves, positions);
    const result = treeToPositions(tree);

    expect(result).toHaveLength(4);

    for (let i = 0; i < result.length; i++) {
      expect(result[i].fen).toBe(fens[i]);
      expect(result[i].evaluation).toEqual(positions[i].evaluation);
      expect(result[i].classification).toBe(positions[i].classification);
      expect(result[i].centipawnLoss).toBeNull();
    }
  });
});

describe("round-trip fidelity", () => {
  it("preserves fen, evaluation, and classification", () => {
    const { fens, moves, positions } = createTestData();
    const result = treeToPositions(positionsToTree(fens, moves, positions));

    expect(result).toHaveLength(positions.length);

    for (let i = 0; i < result.length; i++) {
      expect(result[i].fen).toBe(positions[i].fen);
      expect(result[i].evaluation).toEqual(positions[i].evaluation);
      expect(result[i].classification).toBe(positions[i].classification);
    }
  });

  it("sets centipawnLoss to null for all positions", () => {
    const { fens, moves, positions } = createTestData();
    const result = treeToPositions(positionsToTree(fens, moves, positions));

    for (const pos of result) {
      expect(pos.centipawnLoss).toBeNull();
    }
  });
});

describe("edge cases", () => {
  it("handles empty game (zero moves)", () => {
    const fens = ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"];
    const moves: string[] = [];
    const positions: AnalyzedPosition[] = [
      {
        fen: fens[0],
        evaluation: { score: { type: "cp", value: 20 }, bestLine: ["e4"], depth: 20 },
        classification: null,
        centipawnLoss: null,
      },
    ];

    const tree = positionsToTree(fens, moves, positions);
    expect(tree.children).toHaveLength(0);
    expect(tree.fen).toBe(fens[0]);
    expect(tree.san).toBeNull();

    const result = treeToPositions(tree);
    expect(result).toHaveLength(1);
    expect(result[0].fen).toBe(fens[0]);
    expect(result[0].evaluation).toEqual(positions[0].evaluation);
  });

  it("handles single-move game", () => {
    const fens = [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    ];
    const moves = ["e4"];
    const positions: AnalyzedPosition[] = [
      {
        fen: fens[0],
        evaluation: { score: { type: "cp", value: 20 }, bestLine: ["e4"], depth: 20 },
        classification: null,
        centipawnLoss: null,
      },
      {
        fen: fens[1],
        evaluation: { score: { type: "cp", value: -15 }, bestLine: ["e5"], depth: 20 },
        classification: "best",
        centipawnLoss: 5,
      },
    ];

    const tree = positionsToTree(fens, moves, positions);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].children).toHaveLength(0);

    const result = treeToPositions(tree);
    expect(result).toHaveLength(2);
    expect(result[0].fen).toBe(fens[0]);
    expect(result[1].fen).toBe(fens[1]);
  });

  it("handles mate evaluation", () => {
    const fens = [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    ];
    const moves = ["e4"];
    const positions: AnalyzedPosition[] = [
      {
        fen: fens[0],
        evaluation: { score: { type: "mate", value: 3 }, bestLine: ["e4"], depth: 20 },
        classification: null,
        centipawnLoss: null,
      },
      {
        fen: fens[1],
        evaluation: { score: { type: "mate", value: -3 }, bestLine: ["e5"], depth: 20 },
        classification: "best",
        centipawnLoss: 0,
      },
    ];

    const result = treeToPositions(positionsToTree(fens, moves, positions));

    expect(result[0].evaluation.score).toEqual({ type: "mate", value: 3 });
    expect(result[1].evaluation.score).toEqual({ type: "mate", value: -3 });
  });
});
