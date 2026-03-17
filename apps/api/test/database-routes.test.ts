import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../src/server.js";
import { gamesDb, gamesSqlite } from "../src/db/games-db.js";
import { databaseGames } from "../src/db/games-db-schema.js";

function ensureGamesDbSchema(): void {
  gamesSqlite.exec(`
    CREATE TABLE IF NOT EXISTS database_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      white TEXT NOT NULL,
      black TEXT NOT NULL,
      white_elo INTEGER NOT NULL,
      black_elo INTEGER NOT NULL,
      result TEXT NOT NULL,
      eco TEXT,
      opening TEXT,
      date TEXT,
      time_control TEXT,
      termination TEXT,
      lichess_url TEXT NOT NULL UNIQUE,
      pgn TEXT NOT NULL
    )
  `);
}

let gameCounter = 0;

function insertTestGame(overrides: Partial<typeof databaseGames.$inferInsert> = {}) {
  gameCounter += 1;
  const defaults = {
    white: "Player_White",
    black: "Player_Black",
    whiteElo: 1500,
    blackElo: 1500,
    result: "1-0",
    eco: "B20",
    opening: "Sicilian Defense",
    date: "2024.01.15",
    timeControl: "600+0",
    termination: "Normal",
    lichessUrl: `https://lichess.org/test${Date.now()}_${gameCounter}`,
    pgn: "1. e4 c5 *",
  };
  return gamesDb
    .insert(databaseGames)
    .values({ ...defaults, ...overrides })
    .returning()
    .get();
}

function clearGamesDb(): void {
  gamesSqlite.exec("DELETE FROM database_games");
  gameCounter = 0;
}

beforeAll(() => {
  ensureGamesDbSchema();
});

let app: ReturnType<typeof buildApp>["app"];

beforeEach(async () => {
  ({ app } = buildApp());
  await app.ready();
  clearGamesDb();
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/database/games - List endpoint", () => {
  it("returns empty paginated response when the games DB has not been initialized", async () => {
    await app.close();

    const tempDir = mkdtempSync(join(tmpdir(), "chess-games-db-"));
    const tempDbPath = join(tempDir, "games.db");
    const originalGamesDbPath = process.env.GAMES_DB_PATH;

    try {
      process.env.GAMES_DB_PATH = tempDbPath;
      vi.resetModules();

      const { buildApp: buildFreshApp } = await import("../src/server.js");
      ({ app } = buildFreshApp());
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/api/database/games",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    } finally {
      if (originalGamesDbPath === undefined) {
        delete process.env.GAMES_DB_PATH;
      } else {
        process.env.GAMES_DB_PATH = originalGamesDbPath;
      }

      vi.resetModules();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns empty paginated response when no games exist", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/database/games",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  it("returns paginated games with default params", async () => {
    insertTestGame({ date: "2024.01.01" });
    insertTestGame({ date: "2024.01.02" });
    insertTestGame({ date: "2024.01.03" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games",
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.totalPages).toBe(1);
  });

  it("excludes pgn field from list results", async () => {
    insertTestGame();

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games",
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.data[0]).not.toHaveProperty("pgn");
  });

  it("paginates correctly", async () => {
    insertTestGame({ date: "2024.01.01", lichessUrl: "https://lichess.org/page1" });
    insertTestGame({ date: "2024.01.02", lichessUrl: "https://lichess.org/page2" });
    insertTestGame({ date: "2024.01.03", lichessUrl: "https://lichess.org/page3" });
    insertTestGame({ date: "2024.01.04", lichessUrl: "https://lichess.org/page4" });
    insertTestGame({ date: "2024.01.05", lichessUrl: "https://lichess.org/page5" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?page=2&limit=2",
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.page).toBe(2);
    expect(body.totalPages).toBe(3);
  });

  it("returns empty data for page beyond total", async () => {
    insertTestGame({ lichessUrl: "https://lichess.org/beyond1" });
    insertTestGame({ lichessUrl: "https://lichess.org/beyond2" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?page=100",
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.total).toBe(2);
  });

  it("filters by player name (case-insensitive, matches white or black)", async () => {
    insertTestGame({
      white: "Magnus_Carlsen",
      black: "Hikaru_Nakamura",
      lichessUrl: "https://lichess.org/player1",
    });
    insertTestGame({
      white: "Bobby_Fischer",
      black: "Boris_Spassky",
      lichessUrl: "https://lichess.org/player2",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?player=magnus",
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].white).toBe("Magnus_Carlsen");
  });

  it("filters by white player name", async () => {
    insertTestGame({ white: "Carlsen", lichessUrl: "https://lichess.org/white1" });
    insertTestGame({ white: "Anand", lichessUrl: "https://lichess.org/white2" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?white=carlsen",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].white).toBe("Carlsen");
  });

  it("filters by black player name", async () => {
    insertTestGame({ black: "Nakamura", lichessUrl: "https://lichess.org/black1" });
    insertTestGame({ black: "So", lichessUrl: "https://lichess.org/black2" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?black=nakamura",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].black).toBe("Nakamura");
  });

  it("filters by minElo (matches if either player Elo >= value)", async () => {
    insertTestGame({
      white: "HighElo",
      whiteElo: 2800,
      blackElo: 2700,
      lichessUrl: "https://lichess.org/minelo1",
    });
    insertTestGame({
      white: "LowElo",
      whiteElo: 1200,
      blackElo: 1100,
      lichessUrl: "https://lichess.org/minelo2",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?minElo=2700",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].white).toBe("HighElo");
    expect(body.data[0].whiteElo).toBe(2800);
  });

  it("filters by maxElo (matches if either player Elo <= value)", async () => {
    insertTestGame({
      white: "HighElo",
      whiteElo: 2800,
      blackElo: 2700,
      lichessUrl: "https://lichess.org/maxelo1",
    });
    insertTestGame({
      white: "LowElo",
      whiteElo: 1200,
      blackElo: 1100,
      lichessUrl: "https://lichess.org/maxelo2",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?maxElo=1200",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].white).toBe("LowElo");
    expect(body.data[0].blackElo).toBe(1100);
  });

  it("filters by result", async () => {
    insertTestGame({ result: "1-0", lichessUrl: "https://lichess.org/result1" });
    insertTestGame({ result: "0-1", lichessUrl: "https://lichess.org/result2" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?result=0-1",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].result).toBe("0-1");
  });

  it("filters by ECO prefix", async () => {
    insertTestGame({ eco: "C10", lichessUrl: "https://lichess.org/eco1" });
    insertTestGame({ eco: "B20", lichessUrl: "https://lichess.org/eco2" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?eco=C1",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].eco).toBe("C10");
  });

  it("filters by opening name (case-insensitive partial match)", async () => {
    insertTestGame({
      opening: "Sicilian Defense: Najdorf",
      lichessUrl: "https://lichess.org/opening1",
    });
    insertTestGame({
      opening: "French Defense",
      lichessUrl: "https://lichess.org/opening2",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?opening=sicilian",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
  });

  it("filters by date range", async () => {
    insertTestGame({ date: "2024.01.01", lichessUrl: "https://lichess.org/date1" });
    insertTestGame({ date: "2024.06.15", lichessUrl: "https://lichess.org/date2" });
    insertTestGame({ date: "2024.12.31", lichessUrl: "https://lichess.org/date3" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?dateFrom=2024.06.01&dateTo=2024.06.30",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].date).toBe("2024.06.15");
  });

  it("filters by timeControl (exact match)", async () => {
    insertTestGame({ timeControl: "600+0", lichessUrl: "https://lichess.org/time1" });
    insertTestGame({ timeControl: "180+2", lichessUrl: "https://lichess.org/time2" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?timeControl=180%2B2",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].timeControl).toBe("180+2");
  });

  it("filters by termination (exact match)", async () => {
    insertTestGame({ termination: "Normal", lichessUrl: "https://lichess.org/term1" });
    insertTestGame({
      termination: "Time forfeit",
      lichessUrl: "https://lichess.org/term2",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?termination=Normal",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].termination).toBe("Normal");
  });

  it("combines multiple filters", async () => {
    insertTestGame({
      white: "Carlsen",
      result: "1-0",
      eco: "C50",
      lichessUrl: "https://lichess.org/combo1",
    });
    insertTestGame({
      white: "Carlsen",
      result: "0-1",
      eco: "C50",
      lichessUrl: "https://lichess.org/combo2",
    });
    insertTestGame({
      white: "Anand",
      result: "1-0",
      eco: "C50",
      lichessUrl: "https://lichess.org/combo3",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?white=carlsen&result=1-0",
    });

    const body = response.json();
    expect(body.data).toHaveLength(1);
  });

  it("sorts by date descending by default", async () => {
    insertTestGame({ date: "2024.01.01", lichessUrl: "https://lichess.org/sortdate1" });
    insertTestGame({ date: "2024.06.15", lichessUrl: "https://lichess.org/sortdate2" });
    insertTestGame({ date: "2024.12.31", lichessUrl: "https://lichess.org/sortdate3" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games",
    });

    const body = response.json();
    expect(body.data[0].date).toBe("2024.12.31");
    expect(body.data[2].date).toBe("2024.01.01");
  });

  it("sorts by whiteElo ascending", async () => {
    insertTestGame({ whiteElo: 2800, lichessUrl: "https://lichess.org/sortelo1" });
    insertTestGame({ whiteElo: 1200, lichessUrl: "https://lichess.org/sortelo2" });
    insertTestGame({ whiteElo: 2000, lichessUrl: "https://lichess.org/sortelo3" });

    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?sort=whiteElo&order=asc",
    });

    const body = response.json();
    expect(body.data[0].whiteElo).toBe(1200);
    expect(body.data[1].whiteElo).toBe(2000);
    expect(body.data[2].whiteElo).toBe(2800);
  });

  it("rejects invalid result value", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/database/games?result=invalid",
    });

    expect(response.statusCode).toBe(400);
  });

  it("does not require authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/database/games",
    });

    expect(response.statusCode).toBe(200);
  });
});

describe("GET /api/database/games/:id - Single game endpoint", () => {
  it("returns a single game with pgn", async () => {
    const game = insertTestGame({
      pgn: "1. e4 e5 2. Nf3 Nc6 *",
      lichessUrl: "https://lichess.org/single1",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/database/games/${game.id}`,
    });

    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body).toHaveProperty("pgn");
    expect(body.pgn).toBe("1. e4 e5 2. Nf3 Nc6 *");
  });

  it("returns 404 for non-existent game", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/database/games/999999",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Game not found" });
  });

  it("does not require authentication", async () => {
    const game = insertTestGame({ lichessUrl: "https://lichess.org/single2" });

    const response = await app.inject({
      method: "GET",
      url: `/api/database/games/${game.id}`,
    });

    expect(response.statusCode).toBe(200);
  });
});
