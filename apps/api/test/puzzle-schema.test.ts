import { describe, it, expect, beforeAll } from "vitest";
import { db, sqlite } from "../src/db/index.js";
import { users, puzzleAttempts } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { ensureSchema, seedTestUser } from "./helpers.js";

beforeAll(() => {
  ensureSchema();
  sqlite.exec("DELETE FROM puzzle_attempts WHERE user_id IN (9001, 9002, 9003, 9004)");
});

describe("puzzle schema", () => {
  it("users table has puzzleRating and puzzleRatingDeviation with defaults", () => {
    seedTestUser(9001);
    const user = db.select().from(users).where(eq(users.id, 9001)).get();
    expect(user).toBeDefined();
    expect(user!.puzzleRating).toBe(1500);
    expect(user!.puzzleRatingDeviation).toBe(350);
  });

  it("puzzle_attempts table allows inserts and queries", () => {
    seedTestUser(9002);
    db.insert(puzzleAttempts)
      .values({
        userId: 9002,
        puzzleId: "test_puzzle_001",
        solved: 1,
        userRatingBefore: 1500,
        userRatingAfter: 1520,
        puzzleRating: 1400,
      })
      .run();

    const rows = db.select().from(puzzleAttempts).where(eq(puzzleAttempts.userId, 9002)).all();

    expect(rows).toHaveLength(1);
    expect(rows[0].puzzleId).toBe("test_puzzle_001");
    expect(rows[0].solved).toBe(1);
    expect(rows[0].userRatingBefore).toBe(1500);
    expect(rows[0].userRatingAfter).toBe(1520);
    expect(rows[0].puzzleRating).toBe(1400);
    expect(rows[0].createdAt).toBeGreaterThan(0);
  });

  it("puzzle_attempts createdAt defaults to current unix epoch", () => {
    seedTestUser(9003);
    const before = Math.floor(Date.now() / 1000);
    db.insert(puzzleAttempts)
      .values({
        userId: 9003,
        puzzleId: "test_puzzle_002",
        solved: 0,
        userRatingBefore: 1500,
        userRatingAfter: 1480,
        puzzleRating: 1600,
      })
      .run();
    const after = Math.floor(Date.now() / 1000);

    const row = db.select().from(puzzleAttempts).where(eq(puzzleAttempts.userId, 9003)).get();

    expect(row).toBeDefined();
    expect(row!.createdAt).toBeGreaterThanOrEqual(before);
    expect(row!.createdAt).toBeLessThanOrEqual(after);
  });

  it("multiple attempts for same user can be queried in order", () => {
    seedTestUser(9004);
    db.insert(puzzleAttempts)
      .values([
        {
          userId: 9004,
          puzzleId: "pz_a",
          solved: 1,
          userRatingBefore: 1500,
          userRatingAfter: 1520,
          puzzleRating: 1450,
        },
        {
          userId: 9004,
          puzzleId: "pz_b",
          solved: 0,
          userRatingBefore: 1520,
          userRatingAfter: 1500,
          puzzleRating: 1600,
        },
      ])
      .run();

    const rows = db.select().from(puzzleAttempts).where(eq(puzzleAttempts.userId, 9004)).all();

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.puzzleId)).toEqual(["pz_a", "pz_b"]);
  });
});
