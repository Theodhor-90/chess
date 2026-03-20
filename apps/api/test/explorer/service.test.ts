import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getSpeedFromClock,
  getGameRatingBracket,
  tagGameOpening,
} from "../../src/explorer/service.js";
import { sqlite, db } from "../../src/db/index.js";
import { games } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";
import { ensureSchema, seedTestUser } from "../helpers.js";

describe("getSpeedFromClock", () => {
  it("returns 'bullet' for 1 minute clock", () => {
    expect(getSpeedFromClock({ initial: 60, increment: 0 })).toBe("bullet");
  });

  it("returns 'bullet' for 2 minute clock", () => {
    expect(getSpeedFromClock({ initial: 120, increment: 0 })).toBe("bullet");
  });

  it("returns 'blitz' for 3 minute clock", () => {
    expect(getSpeedFromClock({ initial: 180, increment: 0 })).toBe("blitz");
  });

  it("returns 'blitz' for 5 minute clock", () => {
    expect(getSpeedFromClock({ initial: 300, increment: 0 })).toBe("blitz");
  });

  it("returns 'blitz' for 10 minute clock", () => {
    expect(getSpeedFromClock({ initial: 600, increment: 0 })).toBe("blitz");
  });

  it("returns 'rapid' for 15 minute clock", () => {
    expect(getSpeedFromClock({ initial: 900, increment: 0 })).toBe("rapid");
  });

  it("returns 'rapid' for 30 minute clock", () => {
    expect(getSpeedFromClock({ initial: 1800, increment: 0 })).toBe("rapid");
  });

  it("returns 'classical' for 45 minute clock", () => {
    expect(getSpeedFromClock({ initial: 2700, increment: 0 })).toBe("classical");
  });

  it("returns 'classical' for untimed game (0 seconds)", () => {
    expect(getSpeedFromClock({ initial: 0, increment: 0 })).toBe("classical");
  });
});

describe("getGameRatingBracket", () => {
  it("returns '1400-1600' for two 1500-rated players", () => {
    expect(getGameRatingBracket(1500, 1500)).toBe("1400-1600");
  });

  it("returns '1600-1800' for 1600 vs 1800 players", () => {
    expect(getGameRatingBracket(1600, 1800)).toBe("1600-1800");
  });

  it("returns '0-1000' for two 800-rated players", () => {
    expect(getGameRatingBracket(800, 800)).toBe("0-1000");
  });

  it("returns '2200+' for two 2500-rated players", () => {
    expect(getGameRatingBracket(2500, 2500)).toBe("2200+");
  });

  it("defaults to 1500 when both ratings are 0", () => {
    expect(getGameRatingBracket(0, 0)).toBe("1400-1600");
  });

  it("uses non-zero rating when one player has 0", () => {
    expect(getGameRatingBracket(0, 2000)).toBe("2000-2200");
  });

  it("uses non-zero rating when the other player has 0", () => {
    expect(getGameRatingBracket(1200, 0)).toBe("1200-1400");
  });
});

describe("tagGameOpening", () => {
  const TEST_USER_ID = 90001;

  beforeAll(() => {
    ensureSchema();
    seedTestUser(TEST_USER_ID);

    try {
      sqlite.exec(`ALTER TABLE games ADD COLUMN opening_eco TEXT`);
    } catch {
      // already exists
    }
    try {
      sqlite.exec(`ALTER TABLE games ADD COLUMN opening_name TEXT`);
    } catch {
      // already exists
    }
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS opening_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_fen TEXT NOT NULL UNIQUE,
        eco TEXT,
        opening_name TEXT,
        master_white INTEGER NOT NULL DEFAULT 0,
        master_draws INTEGER NOT NULL DEFAULT 0,
        master_black INTEGER NOT NULL DEFAULT 0,
        master_total_games INTEGER NOT NULL DEFAULT 0,
        master_avg_rating INTEGER NOT NULL DEFAULT 0,
        platform_stats TEXT NOT NULL DEFAULT '{}'
      )
    `);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS opening_position_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_fen TEXT NOT NULL,
        move_san TEXT NOT NULL,
        move_uci TEXT NOT NULL,
        result_fen TEXT NOT NULL,
        master_white INTEGER NOT NULL DEFAULT 0,
        master_draws INTEGER NOT NULL DEFAULT 0,
        master_black INTEGER NOT NULL DEFAULT 0,
        master_total_games INTEGER NOT NULL DEFAULT 0,
        master_avg_rating INTEGER NOT NULL DEFAULT 0,
        platform_stats TEXT NOT NULL DEFAULT '{}'
      )
    `);
    sqlite.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS opening_position_moves_fen_san_idx ON opening_position_moves(position_fen, move_san)",
    );
    sqlite.exec(
      "CREATE INDEX IF NOT EXISTS opening_position_moves_fen_idx ON opening_position_moves(position_fen)",
    );
  });

  afterAll(() => {
    // Clean up test data
    sqlite.exec(
      `DELETE FROM games WHERE white_player_id = ${TEST_USER_ID} OR black_player_id = ${TEST_USER_ID}`,
    );
  });

  it("correctly identifies the Sicilian Defense after 1.e4 c5", () => {
    // Insert a test game with PGN for 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6
    const result = db
      .insert(games)
      .values({
        inviteToken: `test-tag-sicilian-${Date.now()}`,
        status: "checkmate",
        whitePlayerId: TEST_USER_ID,
        blackPlayerId: TEST_USER_ID,
        pgn: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6",
        fen: "rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6",
        currentTurn: "white",
        clockInitialTime: 600,
        clockIncrement: 0,
        resultWinner: "white",
        resultReason: "checkmate",
      })
      .returning()
      .get();

    tagGameOpening(result.id);

    const updated = db.select().from(games).where(eq(games.id, result.id)).get();
    expect(updated).toBeDefined();
    expect(updated!.openingEco).not.toBeNull();
    expect(updated!.openingName).not.toBeNull();
    // The Najdorf or Sicilian should be recognized
    expect(updated!.openingName!).toContain("Sicilian");
  });

  it("leaves columns NULL for a game with no opening match", () => {
    // Insert a game with empty PGN
    const result = db
      .insert(games)
      .values({
        inviteToken: `test-tag-empty-${Date.now()}`,
        status: "resigned",
        whitePlayerId: TEST_USER_ID,
        blackPlayerId: TEST_USER_ID,
        pgn: "",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        currentTurn: "white",
        clockInitialTime: 600,
        clockIncrement: 0,
        resultWinner: "white",
        resultReason: "resigned",
      })
      .returning()
      .get();

    tagGameOpening(result.id);

    const updated = db.select().from(games).where(eq(games.id, result.id)).get();
    expect(updated).toBeDefined();
    expect(updated!.openingEco).toBeNull();
    expect(updated!.openingName).toBeNull();
  });
});
