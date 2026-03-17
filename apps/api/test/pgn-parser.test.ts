import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePgnStream, type ParsedPgnGame } from "../src/services/pgn-parser.js";

const testDir = join(tmpdir(), `pgn-parser-test-${randomBytes(4).toString("hex")}`);

const FIXTURE_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abc12345"]
[LichessURL "https://lichess.org/abc12345"]
[Date "2020.06.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]
[WhiteElo "2400"]
[BlackElo "2300"]
[ECO "C50"]
[Opening "Italian Game"]
[TimeControl "180+2"]
[Termination "Normal"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0

[Event "Rated Rapid game"]
[Site "https://lichess.org/def67890"]
[LichessURL "https://lichess.org/def67890"]
[Date "2020.07.15"]
[White "Player3"]
[Black "Player4"]
[Result "0-1"]
[WhiteElo "2100"]
[BlackElo "2200"]
[ECO "B50"]
[Opening "Sicilian Defense"]
[TimeControl "600+0"]
[Termination "Time forfeit"]

1. e4 c5 2. Nf3 d6 0-1

[Event "Rated Classical game"]
[Site "https://lichess.org/ghi11111"]
[LichessURL "https://lichess.org/ghi11111"]
[Date "2021.01.10"]
[White "Player5"]
[Black "Player6"]
[Result "1/2-1/2"]
[WhiteElo "2500"]
[BlackElo "2450"]
[ECO "A00"]
[Opening "Hungarian Opening"]
[TimeControl "1800+0"]
[Termination "Normal"]

1. g3 d5 2. Bg2 c6 1/2-1/2
`;

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeFixtureFile(contents: string): string {
  const filePath = join(testDir, `${randomBytes(4).toString("hex")}.pgn`);
  writeFileSync(filePath, contents, "utf-8");
  return filePath;
}

async function parseFixture(contents: string): Promise<{ count: number; games: ParsedPgnGame[] }> {
  const filePath = writeFixtureFile(contents);
  const games: ParsedPgnGame[] = [];
  const count = await parsePgnStream(filePath, (game) => {
    games.push(game);
  });
  return { count, games };
}

describe("parsePgnStream", () => {
  it("parses the correct number of games", async () => {
    const { count, games } = await parseFixture(FIXTURE_PGN);

    expect(count).toBe(3);
    expect(games).toHaveLength(3);
  });

  it("extracts headers correctly from each game", async () => {
    const { games } = await parseFixture(FIXTURE_PGN);

    expect(games[0].headers).toMatchObject({
      White: "Player1",
      Black: "Player2",
      Result: "1-0",
      WhiteElo: "2400",
      BlackElo: "2300",
      ECO: "C50",
      Opening: "Italian Game",
      LichessURL: "https://lichess.org/abc12345",
      Date: "2020.06.01",
      TimeControl: "180+2",
      Termination: "Normal",
    });
    expect(games[1].headers).toMatchObject({
      White: "Player3",
      Black: "Player4",
      Result: "0-1",
      LichessURL: "https://lichess.org/def67890",
    });
    expect(games[2].headers).toMatchObject({
      White: "Player5",
      Black: "Player6",
      Result: "1/2-1/2",
      LichessURL: "https://lichess.org/ghi11111",
    });
  });

  it("captures move text correctly", async () => {
    const { games } = await parseFixture(FIXTURE_PGN);

    expect(games[0].moveText).toBe("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0");
    expect(games[1].moveText).toBe("1. e4 c5 2. Nf3 d6 0-1");
    expect(games[2].moveText).toBe("1. g3 d5 2. Bg2 c6 1/2-1/2");
  });

  it("rawPgn contains both headers and move text", async () => {
    const { games } = await parseFixture(FIXTURE_PGN);

    expect(games[0].rawPgn).toContain('[White "Player1"]');
    expect(games[0].rawPgn).toContain("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0");
  });

  it("handles a game with no move text", async () => {
    const fixture = `[Event "Headers Only"]
[LichessURL "https://lichess.org/headersonly"]
[White "Player1"]
[Black "Player2"]
[Result "*"]
`;
    const { count, games } = await parseFixture(fixture);

    expect(count).toBe(1);
    expect(games).toHaveLength(1);
    expect(games[0].headers).toMatchObject({
      Event: "Headers Only",
      LichessURL: "https://lichess.org/headersonly",
      White: "Player1",
      Black: "Player2",
      Result: "*",
    });
    expect(games[0].moveText).toBe("");
  });

  it("handles file not ending with a blank line", async () => {
    const fixture = `[Event "No Trailing Blank"]
[LichessURL "https://lichess.org/notrailing"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 1-0`;
    const { count, games } = await parseFixture(fixture);

    expect(count).toBe(1);
    expect(games).toHaveLength(1);
    expect(games[0].moveText).toBe("1. e4 e5 1-0");
  });

  it("handles consecutive blank lines between games", async () => {
    const fixture = `[Event "Game 1"]
[LichessURL "https://lichess.org/game1"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 1-0



[Event "Game 2"]
[LichessURL "https://lichess.org/game2"]
[White "Player3"]
[Black "Player4"]
[Result "0-1"]

1. d4 d5 0-1
`;
    const { count, games } = await parseFixture(fixture);

    expect(count).toBe(2);
    expect(games).toHaveLength(2);
    expect(games[0].headers.Event).toBe("Game 1");
    expect(games[1].headers.Event).toBe("Game 2");
  });

  it("handles multi-line move text", async () => {
    const fixture = `[Event "Multi Line"]
[LichessURL "https://lichess.org/multiline"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5
2. Nf3 Nc6
3. Bb5 a6 1-0
`;
    const { count, games } = await parseFixture(fixture);

    expect(count).toBe(1);
    expect(games).toHaveLength(1);
    expect(games[0].moveText).toBe("1. e4 e5\n2. Nf3 Nc6\n3. Bb5 a6 1-0");
  });

  it("skips malformed game content and continues parsing later games", async () => {
    const fixture = `[Event "Valid Game 1"]
[LichessURL "https://lichess.org/valid1"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 1-0

This is not a PGN game.
It has no headers and should be ignored.

[Event "Valid Game 2"]
[LichessURL "https://lichess.org/valid2"]
[White "Player3"]
[Black "Player4"]
[Result "0-1"]

1. d4 d5 0-1
`;
    const { count, games } = await parseFixture(fixture);

    expect(count).toBe(2);
    expect(games).toHaveLength(2);
    expect(games[0].headers.Event).toBe("Valid Game 1");
    expect(games[0].moveText).toBe("1. e4 e5 1-0");
    expect(games[1].headers.Event).toBe("Valid Game 2");
    expect(games[1].moveText).toBe("1. d4 d5 0-1");
  });

  it("returns 0 for an empty file", async () => {
    const { count, games } = await parseFixture("");

    expect(count).toBe(0);
    expect(games).toHaveLength(0);
  });
});
