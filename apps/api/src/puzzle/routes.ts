import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type {
  PuzzleNextResponse,
  PuzzleAttemptRequest,
  PuzzleAttemptResponse,
  ErrorResponse,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { puzzles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import * as puzzleService from "./service.js";

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

      // Rating update and attempt recording will be added in t03.
      // For now, return placeholder rating values.
      return reply.code(200).send({
        correct: result.correct,
        solution: result.solution,
        ratingBefore: 0,
        ratingAfter: 0,
        ratingDelta: 0,
      });
    },
  );
}

export const puzzleRoutesPlugin = fp(puzzleRoutes, {
  name: "puzzle-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
