import { describe, it, expect } from "vitest";
import {
  normalizeFen,
  loadOpenings,
  classifyPosition,
  classifyGame,
  getRatingBracket,
  getSpeedCategory,
} from "../src/index.js";

describe("normalizeFen", () => {
  it("strips halfmove clock and fullmove number from a standard FEN", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(normalizeFen(fen)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -");
  });

  it("strips halfmove clock and fullmove number with en passant square", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(normalizeFen(fen)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3");
  });

  it("handles FEN that already has only 4 parts", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    expect(normalizeFen(fen)).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
  });
});

describe("loadOpenings", () => {
  it("returns a Map with approximately 3,641 entries", () => {
    const map = loadOpenings();
    expect(map.size).toBeGreaterThan(3000);
    expect(map.size).toBeLessThan(4000);
  });

  it("map entries have eco and name strings", () => {
    const map = loadOpenings();
    const firstEntry = map.values().next().value;
    expect(firstEntry).toBeDefined();
    expect(firstEntry).toHaveProperty("eco");
    expect(firstEntry).toHaveProperty("name");
    expect(typeof firstEntry!.eco).toBe("string");
    expect(typeof firstEntry!.name).toBe("string");
  });
});

describe("classifyPosition", () => {
  it("returns correct ECO/name for 1.e4 → B00", () => {
    const map = loadOpenings();
    // After 1.e4: chess.js uses "-" for en passant when no capture is legal
    const result = classifyPosition(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      map,
    );
    expect(result).not.toBeNull();
    expect(result!.eco).toBe("B00");
    expect(result!.name).toContain("King");
  });

  it("returns correct ECO/name for Ruy Lopez (1.e4 e5 2.Nf3 Nc6 3.Bb5)", () => {
    const map = loadOpenings();
    const fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    const result = classifyPosition(fen, map);
    expect(result).not.toBeNull();
    expect(result!.eco).toBe("C60");
    expect(result!.name).toContain("Ruy Lopez");
  });

  it("returns null for a position beyond book", () => {
    const map = loadOpenings();
    const fen = "r1b1k2r/pp1pppbp/2n3p1/q1p5/2BPP3/2N2N2/PPP2PPP/R1BQK2R b KQkq - 0 6";
    const result = classifyPosition(fen, map);
    expect(result).toBeNull();
  });

  it("normalizes FEN before lookup (handles full 6-part FEN)", () => {
    const map = loadOpenings();
    const fen1 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const fen2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 5 10";
    const result1 = classifyPosition(fen1, map);
    const result2 = classifyPosition(fen2, map);
    expect(result1).toEqual(result2);
  });
});

describe("classifyGame", () => {
  it("returns the deepest opening match from a list of FENs", () => {
    const map = loadOpenings();
    const fens = [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    ];
    const result = classifyGame(fens, map);
    expect(result).not.toBeNull();
    expect(result!.eco).toBe("C60");
    expect(result!.name).toContain("Ruy Lopez");
  });

  it("returns null if no FEN matches any opening", () => {
    const map = loadOpenings();
    const fens = ["r1b1k2r/pp1pppbp/2n3p1/q1p5/2BPP3/2N2N2/PPP2PPP/R1BQK2R b KQkq - 0 6"];
    const result = classifyGame(fens, map);
    expect(result).toBeNull();
  });

  it("returns the deepest match, not the first", () => {
    const map = loadOpenings();
    const fens = [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", // B00
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", // C20
    ];
    const result = classifyGame(fens, map);
    expect(result).not.toBeNull();
    expect(result!.eco).toBe("C20");
  });
});

describe("getRatingBracket", () => {
  it("returns '0-1000' for ratings below 1000", () => {
    expect(getRatingBracket(500)).toBe("0-1000");
    expect(getRatingBracket(0)).toBe("0-1000");
    expect(getRatingBracket(999)).toBe("0-1000");
  });

  it("returns '1000-1200' for ratings 1000-1199", () => {
    expect(getRatingBracket(1000)).toBe("1000-1200");
    expect(getRatingBracket(1199)).toBe("1000-1200");
  });

  it("returns '1200-1400' for ratings 1200-1399", () => {
    expect(getRatingBracket(1200)).toBe("1200-1400");
    expect(getRatingBracket(1399)).toBe("1200-1400");
  });

  it("returns '1400-1600' for ratings 1400-1599", () => {
    expect(getRatingBracket(1400)).toBe("1400-1600");
    expect(getRatingBracket(1599)).toBe("1400-1600");
  });

  it("returns '1600-1800' for ratings 1600-1799", () => {
    expect(getRatingBracket(1600)).toBe("1600-1800");
  });

  it("returns '1800-2000' for ratings 1800-1999", () => {
    expect(getRatingBracket(1800)).toBe("1800-2000");
  });

  it("returns '2000-2200' for ratings 2000-2199", () => {
    expect(getRatingBracket(2000)).toBe("2000-2200");
  });

  it("returns '2200+' for ratings 2200 and above", () => {
    expect(getRatingBracket(2200)).toBe("2200+");
    expect(getRatingBracket(2800)).toBe("2200+");
  });
});

describe("getSpeedCategory", () => {
  it("returns 'bullet' for clock <= 120 seconds", () => {
    expect(getSpeedCategory(60)).toBe("bullet");
    expect(getSpeedCategory(120)).toBe("bullet");
  });

  it("returns 'blitz' for clock > 120 and <= 600 seconds", () => {
    expect(getSpeedCategory(180)).toBe("blitz");
    expect(getSpeedCategory(300)).toBe("blitz");
    expect(getSpeedCategory(600)).toBe("blitz");
  });

  it("returns 'rapid' for clock > 600 and <= 1800 seconds", () => {
    expect(getSpeedCategory(900)).toBe("rapid");
    expect(getSpeedCategory(1800)).toBe("rapid");
  });

  it("returns 'classical' for clock > 1800 seconds", () => {
    expect(getSpeedCategory(1801)).toBe("classical");
    expect(getSpeedCategory(3600)).toBe("classical");
  });
});
