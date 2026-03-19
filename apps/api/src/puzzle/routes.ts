import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type {
  PuzzleNextResponse,
  PuzzleAttemptRequest,
  PuzzleAttemptResponse,
  PuzzleStatsResponse,
  PuzzleAttemptSummary,
  ErrorResponse,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { db, sqlite } from "../db/index.js";
import { puzzles, users, puzzleAttempts } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import * as puzzleService from "./service.js";
import { computeRatingUpdate } from "./rating.js";

const puzzleIdParamsSchema = {
  type: "object" as const,
  required: ["puzzleId"],
  properties: {
    puzzleId: { type: "string" as const, minLength: 1 },
  },
};

const attemptBodySchema = {
  type: "object" as const,
  required: ["moves"],
  additionalProperties: false,
  properties: {
    moves: {
      type: "array" as const,
      items: { type: "string" as const },
      minItems: 1,
    },
  },
};

async function puzzleRoutes(app: FastifyInstance) {
  // GET /next — serve a puzzle matched to user's rating
  app.get<{
    Reply: PuzzleNextResponse | ErrorResponse;
  }>("/next", { preHandler: [requireAuth] }, async (request, reply) => {
    const puzzle = puzzleService.getNextPuzzle(request.userId!);
    if (!puzzle) {
      return reply.code(404).send({ error: "No puzzles available" });
    }
    return reply.code(200).send({ puzzle });
  });

  // POST /:puzzleId/attempt — validate a puzzle solution attempt
  app.post<{
    Params: { puzzleId: string };
    Body: PuzzleAttemptRequest;
    Reply: PuzzleAttemptResponse | ErrorResponse;
  }>(
    "/:puzzleId/attempt",
    {
      schema: { params: puzzleIdParamsSchema, body: attemptBodySchema },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const { puzzleId } = request.params;
      const { moves } = request.body;

      // Verify puzzle exists
      const puzzleRow = db.select().from(puzzles).where(eq(puzzles.puzzleId, puzzleId)).get();
      if (!puzzleRow) {
        return reply.code(404).send({ error: "Puzzle not found" });
      }

      const result = puzzleService.validateAttempt(puzzleId, moves);

      // Fetch user's current puzzle rating
      const user = db.select().from(users).where(eq(users.id, request.userId!)).get();
      if (!user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const { newRating, newRD, delta } = computeRatingUpdate(
        user.puzzleRating,
        user.puzzleRatingDeviation,
        puzzleRow.rating,
        result.correct,
      );

      // Atomic: insert attempt + update user rating
      sqlite.transaction(() => {
        db.insert(puzzleAttempts)
          .values({
            userId: request.userId!,
            puzzleId,
            solved: result.correct ? 1 : 0,
            userRatingBefore: user.puzzleRating,
            userRatingAfter: newRating,
            puzzleRating: puzzleRow.rating,
          })
          .run();

        db.update(users)
          .set({
            puzzleRating: newRating,
            puzzleRatingDeviation: newRD,
          })
          .where(eq(users.id, request.userId!))
          .run();
      })();

      return reply.code(200).send({
        correct: result.correct,
        solution: result.solution,
        ratingBefore: user.puzzleRating,
        ratingAfter: newRating,
        ratingDelta: delta,
      });
    },
  );

  // GET /stats — puzzle rating and solve statistics
  app.get<{
    Reply: PuzzleStatsResponse | ErrorResponse;
  }>("/stats", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = db.select().from(users).where(eq(users.id, request.userId!)).get();
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    // Aggregate stats
    const statsRow = sqlite
      .prepare(
        "SELECT COUNT(*) as total, COALESCE(SUM(solved), 0) as solved FROM puzzle_attempts WHERE user_id = ?",
      )
      .get(request.userId!) as { total: number; solved: number };

    const totalAttempts = statsRow.total;
    const totalSolved = statsRow.solved;
    const solveRate =
      totalAttempts > 0 ? Math.round((totalSolved / totalAttempts) * 10000) / 10000 : 0;

    // Recent attempts (last 20, newest first)
    const recentRows = db
      .select({
        puzzleId: puzzleAttempts.puzzleId,
        puzzleRating: puzzleAttempts.puzzleRating,
        solved: puzzleAttempts.solved,
        userRatingAfter: puzzleAttempts.userRatingAfter,
        createdAt: puzzleAttempts.createdAt,
      })
      .from(puzzleAttempts)
      .where(eq(puzzleAttempts.userId, request.userId!))
      .orderBy(desc(puzzleAttempts.createdAt))
      .limit(20)
      .all();

    const recentAttempts: PuzzleAttemptSummary[] = recentRows.map((r) => ({
      puzzleId: r.puzzleId,
      puzzleRating: r.puzzleRating,
      solved: r.solved === 1,
      ratingAfter: r.userRatingAfter,
      attemptedAt: r.createdAt,
    }));

    return reply.code(200).send({
      rating: user.puzzleRating,
      ratingDeviation: user.puzzleRatingDeviation,
      totalAttempts,
      totalSolved,
      solveRate,
      recentAttempts,
    });
  });
}

export const puzzleRoutesPlugin = fp(puzzleRoutes, {
  name: "puzzle-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
