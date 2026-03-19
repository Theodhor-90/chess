import { db } from "../db/index.js";
import { users, puzzles } from "../db/schema.js";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { Puzzle } from "@chess/shared";

export function getNextPuzzle(userId: number): Puzzle | null {
  // 1. Get user's puzzleRating
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const userRating = user.puzzleRating;

  // 2. Try narrow window first: [rating - 200, rating + 200]
  let candidates = db
    .select()
    .from(puzzles)
    .where(and(gte(puzzles.rating, userRating - 200), lte(puzzles.rating, userRating + 200)))
    .orderBy(sql`RANDOM()`)
    .limit(10)
    .all();

  // 3. If no candidates, widen to +/- 400
  if (candidates.length === 0) {
    candidates = db
      .select()
      .from(puzzles)
      .where(and(gte(puzzles.rating, userRating - 400), lte(puzzles.rating, userRating + 400)))
      .orderBy(sql`RANDOM()`)
      .limit(10)
      .all();
  }

  // 4. If still nothing, return null
  if (candidates.length === 0) return null;

  // 5. Pick the one with highest popularity from the random sample
  candidates.sort((a, b) => b.popularity - a.popularity);
  const row = candidates[0];

  // 6. Map DB row to Puzzle type
  return {
    puzzleId: row.puzzleId,
    fen: row.fen,
    moves: row.moves.split(" "),
    rating: row.rating,
    ratingDeviation: row.ratingDeviation,
    popularity: row.popularity,
    nbPlays: row.nbPlays,
    themes: row.themes.split(" ").filter((t) => t.length > 0),
    gameUrl: row.gameUrl,
    openingTags: row.openingTags,
  };
}

export function validateAttempt(
  puzzleId: string,
  userMoves: string[],
): { correct: boolean; solution: string[] } {
  // 1. Load puzzle from DB
  const puzzle = db.select().from(puzzles).where(eq(puzzles.puzzleId, puzzleId)).get();
  if (!puzzle) {
    return { correct: false, solution: [] };
  }

  // 2. Parse moves string into array
  const allMoves = puzzle.moves.split(" ");

  // 3. Extract expected user moves (odd indices: 1, 3, 5, ...)
  const expectedUserMoves: string[] = [];
  for (let i = 1; i < allMoves.length; i += 2) {
    expectedUserMoves.push(allMoves[i]);
  }

  // 4. The full solution to return (all moves after setup)
  const solution = allMoves.slice(1);

  // 5. Compare each user move with the expected move
  if (userMoves.length !== expectedUserMoves.length) {
    return { correct: false, solution };
  }

  for (let i = 0; i < userMoves.length; i++) {
    if (userMoves[i] !== expectedUserMoves[i]) {
      return { correct: false, solution };
    }
  }

  return { correct: true, solution };
}
