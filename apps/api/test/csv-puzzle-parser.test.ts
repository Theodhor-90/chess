import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePuzzleCsvStream, type ParsedPuzzleRow } from "../src/services/csv-puzzle-parser.js";

const testDir = join(tmpdir(), `csv-puzzle-parser-test-${randomBytes(4).toString("hex")}`);

const HEADER =
  "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags";

const FIXTURE_CSV = `${HEADER}
00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1852,74,97,3567,crushing hangingPiece long middlegame,https://lichess.org/787zsVup/black#48,Italian_Game Italian_Game_Classical_Variation
000aY,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f6e7 d6d7 e7f8,1575,73,98,6277,advantage endgame short,https://lichess.org/kiuvTFoE#53,
000ba,r2qr1k1/ppp2pp1/3p3p/8/4PQ1b/2NB4/PPP2PPP/R4RK1 w - - 3 16,f4f7 e8e4 f7f6 e4e1,1862,76,98,4210,advantage middlegame short,https://lichess.org/s1M0KyyX#31,Sicilian_Defense Sicilian_Defense_Najdorf_Variation
`;

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeFixtureFile(contents: string): string {
  const filePath = join(testDir, `${randomBytes(4).toString("hex")}.csv`);
  writeFileSync(filePath, contents, "utf-8");
  return filePath;
}

async function parseFixture(
  contents: string,
): Promise<{ count: number; puzzles: ParsedPuzzleRow[] }> {
  const filePath = writeFixtureFile(contents);
  const puzzles: ParsedPuzzleRow[] = [];
  const count = await parsePuzzleCsvStream(filePath, (puzzle) => {
    puzzles.push(puzzle);
  });
  return { count, puzzles };
}

describe("parsePuzzleCsvStream", () => {
  it("parses the correct number of puzzles", async () => {
    const { count, puzzles } = await parseFixture(FIXTURE_CSV);

    expect(count).toBe(3);
    expect(puzzles).toHaveLength(3);
  });

  it("extracts all fields correctly from the first puzzle", async () => {
    const { puzzles } = await parseFixture(FIXTURE_CSV);

    expect(puzzles[0]).toEqual({
      puzzleId: "00008",
      fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
      moves: "f2g3 e6e7 b2b1 b3c1 b1c1 h6c1",
      rating: 1852,
      ratingDeviation: 74,
      popularity: 97,
      nbPlays: 3567,
      themes: "crushing hangingPiece long middlegame",
      gameUrl: "https://lichess.org/787zsVup/black#48",
      openingTags: "Italian_Game Italian_Game_Classical_Variation",
    });
  });

  it("handles missing openingTags as null", async () => {
    const { puzzles } = await parseFixture(FIXTURE_CSV);

    // Second puzzle has an empty openingTags field
    expect(puzzles[1].openingTags).toBeNull();
    // Third puzzle has openingTags present
    expect(puzzles[2].openingTags).toBe("Sicilian_Defense Sicilian_Defense_Najdorf_Variation");
  });

  it("stores moves as a raw space-separated string", async () => {
    const { puzzles } = await parseFixture(FIXTURE_CSV);

    expect(puzzles[0].moves).toBe("f2g3 e6e7 b2b1 b3c1 b1c1 h6c1");
    expect(puzzles[1].moves).toBe("d3d6 f6e7 d6d7 e7f8");
  });

  it("stores themes as a raw space-separated string", async () => {
    const { puzzles } = await parseFixture(FIXTURE_CSV);

    expect(puzzles[0].themes).toBe("crushing hangingPiece long middlegame");
    expect(puzzles[1].themes).toBe("advantage endgame short");
  });

  it("skips the header line", async () => {
    const { count, puzzles } = await parseFixture(
      `${HEADER}\n00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7,1852,74,97,3567,crushing,https://lichess.org/test,\n`,
    );

    expect(count).toBe(1);
    expect(puzzles).toHaveLength(1);
    expect(puzzles[0].puzzleId).toBe("00008");
  });

  it("skips lines with fewer than 9 fields", async () => {
    const csv = `${HEADER}\ntoo,few,fields\n00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3,1852,74,97,3567,crushing,https://lichess.org/test,\n`;
    const { count, puzzles } = await parseFixture(csv);

    expect(count).toBe(1);
    expect(puzzles).toHaveLength(1);
    expect(puzzles[0].puzzleId).toBe("00008");
  });

  it("skips lines with non-numeric rating fields", async () => {
    const csv = `${HEADER}\n00008,fen,moves,notanumber,74,97,3567,themes,https://example.com,\n000aY,fen,moves,1575,73,98,6277,themes,https://example.com,\n`;
    const { count, puzzles } = await parseFixture(csv);

    expect(count).toBe(1);
    expect(puzzles[0].puzzleId).toBe("000aY");
  });

  it("skips blank lines in the middle of the file", async () => {
    const csv = `${HEADER}\n00008,fen1,moves1,1000,50,90,100,theme1,https://example.com/1,opening1\n\n000aY,fen2,moves2,1500,60,80,200,theme2,https://example.com/2,\n`;
    const { count, puzzles } = await parseFixture(csv);

    expect(count).toBe(2);
    expect(puzzles[0].puzzleId).toBe("00008");
    expect(puzzles[1].puzzleId).toBe("000aY");
  });

  it("returns 0 for an empty file", async () => {
    const { count, puzzles } = await parseFixture("");

    expect(count).toBe(0);
    expect(puzzles).toHaveLength(0);
  });

  it("returns 0 for a file with only the header line", async () => {
    const { count, puzzles } = await parseFixture(`${HEADER}\n`);

    expect(count).toBe(0);
    expect(puzzles).toHaveLength(0);
  });
});
