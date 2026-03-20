import { describe, it, expect } from "vitest";
import { aggregateMastersGame } from "../src/explorer/aggregation.js";

describe("aggregateMastersGame", () => {
  it("returns position/move pairs for a simple 3-move game", () => {
    // 1. e4 e5 2. Nf3 (3 half-moves)
    const pgn = "1. e4 e5 2. Nf3 *";
    const pairs = aggregateMastersGame(pgn, 2500, 2400, "1-0");

    expect(pairs).toHaveLength(3);

    // First move: starting position -> e4
    expect(pairs[0].positionFen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
    expect(pairs[0].moveSan).toBe("e4");
    expect(pairs[0].moveUci).toBe("e2e4");
    expect(pairs[0].resultFen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -");

    // Second move: after 1.e4 -> e5
    expect(pairs[1].moveSan).toBe("e5");
    expect(pairs[1].moveUci).toBe("e7e5");

    // Third move: after 1.e4 e5 -> Nf3
    expect(pairs[2].moveSan).toBe("Nf3");
    expect(pairs[2].moveUci).toBe("g1f3");
  });

  it("normalizes FEN to 4 parts (no halfmove clock or fullmove number)", () => {
    const pgn = "1. e4 *";
    const pairs = aggregateMastersGame(pgn, 2000, 2000, "1-0");

    expect(pairs).toHaveLength(1);
    // Should have exactly 4 space-separated parts
    const parts = pairs[0].positionFen.split(" ");
    expect(parts).toHaveLength(4);
    const resultParts = pairs[0].resultFen.split(" ");
    expect(resultParts).toHaveLength(4);
  });

  it("stops at 60 half-moves (move 30)", () => {
    // Use a valid game with 63 half-moves (Ruy Lopez with knight/bishop shuffling)
    const pgn =
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8 13. Nf1 Bf8 14. Ng3 g6 15. Nf1 Bg7 16. Ng3 Bf8 17. Nf1 Bg7 18. Ng3 Bf8 19. Nf1 Bg7 20. Ng3 Bf8 21. Nf1 Bg7 22. Ng3 Bf8 23. Nf1 Bg7 24. Ng3 Bf8 25. Nf1 Bg7 26. Ng3 Bf8 27. Nf1 Bg7 28. Ng3 Bf8 29. Nf1 Bg7 30. Ng3 Bf8 31. Nf1 Bg7 32. Ng3 *";
    const pairs = aggregateMastersGame(pgn, 2500, 2500, "1/2-1/2");

    // The PGN has 63 half-moves
    // aggregateMastersGame should stop at half-move 60
    expect(pairs.length).toBe(60);
  });

  it("returns empty array for invalid PGN", () => {
    const pairs = aggregateMastersGame("not a valid pgn xxx", 2000, 2000, "1-0");
    expect(pairs).toEqual([]);
  });

  it("returns empty array for empty PGN", () => {
    const pairs = aggregateMastersGame("", 2000, 2000, "1-0");
    expect(pairs).toEqual([]);
  });

  it("handles promotion moves in UCI notation", () => {
    // Set up a position where promotion happens
    const pgn = "1. e4 d5 2. exd5 c6 3. dxc6 Nf6 4. cxb7 Bd7 5. bxa8=Q *";
    const pairs = aggregateMastersGame(pgn, 2000, 2000, "1-0");

    // Find the promotion move (bxa8=Q)
    const promotionMove = pairs.find((p) => p.moveSan.includes("=Q"));
    expect(promotionMove).toBeDefined();
    expect(promotionMove!.moveUci).toMatch(/b7a8q/);
  });

  it("handles a standard game result with correct move count", () => {
    const pgn = "1. f3 e5 2. g4 Qh4# 0-1";
    const pairs = aggregateMastersGame(pgn, 1000, 1200, "0-1");

    expect(pairs).toHaveLength(4);
    expect(pairs[3].moveSan).toBe("Qh4#");
  });
});
