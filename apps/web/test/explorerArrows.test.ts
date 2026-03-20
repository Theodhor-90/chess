import { describe, it, expect } from "vitest";
import type { ExplorerMove } from "@chess/shared";
import {
  parseUci,
  buildExplorerArrows,
  buildHoverArrow,
  EXPLORER_BRUSHES,
} from "../src/utils/explorerArrows.js";

describe("parseUci", () => {
  it("extracts origin and destination from a 4-char UCI string", () => {
    expect(parseUci("e2e4")).toEqual({ orig: "e2", dest: "e4" });
  });

  it("extracts origin and destination from a 5-char UCI string (promotion)", () => {
    expect(parseUci("e7e8q")).toEqual({ orig: "e7", dest: "e8" });
  });
});

describe("buildExplorerArrows", () => {
  const moves: ExplorerMove[] = [
    {
      san: "e4",
      uci: "e2e4",
      white: 600,
      draws: 200,
      black: 200,
      totalGames: 1000,
      avgRating: 2500,
      opening: null,
    },
    {
      san: "d4",
      uci: "d2d4",
      white: 300,
      draws: 200,
      black: 500,
      totalGames: 1000,
      avgRating: 2450,
      opening: null,
    },
    {
      san: "c4",
      uci: "c2c4",
      white: 250,
      draws: 250,
      black: 250,
      totalGames: 750,
      avgRating: 2400,
      opening: null,
    },
  ];

  it("returns empty array for empty moves", () => {
    expect(buildExplorerArrows([])).toEqual([]);
  });

  it("returns shapes with correct orig and dest", () => {
    const shapes = buildExplorerArrows(moves);
    expect(shapes[0].orig).toBe("e2");
    expect(shapes[0].dest).toBe("e4");
    expect(shapes[1].orig).toBe("d2");
    expect(shapes[1].dest).toBe("d4");
  });

  it("assigns explorerGood brush for score > 0.55", () => {
    // e4: score = (600 + 200*0.5) / 1000 = 0.7 → explorerGood
    const shapes = buildExplorerArrows(moves);
    expect(shapes[0].brush).toBe("explorerGood");
  });

  it("assigns explorerPoor brush for score < 0.45", () => {
    // d4: score = (300 + 200*0.5) / 1000 = 0.4 → explorerPoor
    const shapes = buildExplorerArrows(moves);
    expect(shapes[1].brush).toBe("explorerPoor");
  });

  it("assigns explorerNeutral brush for score between 0.45 and 0.55", () => {
    // c4: score = (250 + 250*0.5) / 750 = 0.5 → explorerNeutral
    const shapes = buildExplorerArrows(moves);
    expect(shapes[2].brush).toBe("explorerNeutral");
  });

  it("computes lineWidth proportional to totalGames", () => {
    const shapes = buildExplorerArrows(moves);
    // e4: 1000/1000 → 3 + Math.round(12) = 15
    expect(shapes[0].modifiers?.lineWidth).toBe(15);
    // d4: 1000/1000 → 15
    expect(shapes[1].modifiers?.lineWidth).toBe(15);
    // c4: 750/1000 → 3 + Math.round(9) = 12
    expect(shapes[2].modifiers?.lineWidth).toBe(12);
  });

  it("limits to maxArrows parameter", () => {
    const shapes = buildExplorerArrows(moves, 2);
    expect(shapes).toHaveLength(2);
  });

  it("defaults to 5 max arrows", () => {
    const manyMoves = Array.from({ length: 8 }, (_, i) => ({
      san: `m${i}`,
      uci: `a${i + 1}b${i + 1}`,
      white: 50,
      draws: 25,
      black: 25,
      totalGames: 100 - i * 10,
      avgRating: 2000,
      opening: null,
    })) as ExplorerMove[];
    const shapes = buildExplorerArrows(manyMoves);
    expect(shapes).toHaveLength(5);
  });
});

describe("buildHoverArrow", () => {
  it("returns a single shape with hover brush", () => {
    const shapes = buildHoverArrow("e2e4");
    expect(shapes).toHaveLength(1);
    expect(shapes[0].orig).toBe("e2");
    expect(shapes[0].dest).toBe("e4");
    expect(shapes[0].brush).toBe("explorerHover");
    expect(shapes[0].modifiers?.lineWidth).toBe(14);
    expect(shapes[0].modifiers?.hilite).toBe(true);
  });
});

describe("EXPLORER_BRUSHES", () => {
  it("defines all four custom brushes", () => {
    expect(EXPLORER_BRUSHES.explorerGood).toBeDefined();
    expect(EXPLORER_BRUSHES.explorerNeutral).toBeDefined();
    expect(EXPLORER_BRUSHES.explorerPoor).toBeDefined();
    expect(EXPLORER_BRUSHES.explorerHover).toBeDefined();
  });

  it("each brush has required properties", () => {
    for (const brush of Object.values(EXPLORER_BRUSHES)) {
      expect(brush).toHaveProperty("key");
      expect(brush).toHaveProperty("color");
      expect(brush).toHaveProperty("opacity");
      expect(brush).toHaveProperty("lineWidth");
    }
  });
});
