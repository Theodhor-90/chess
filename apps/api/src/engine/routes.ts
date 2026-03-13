import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply } from "fastify";
import { Chess } from "chess.js";
import { eq, or, and, asc, inArray, sql } from "drizzle-orm";
import type {
  EvaluationResult,
  AnalyzedPosition,
  MoveClassification,
  ErrorResponse,
  ServerEvaluateRequest,
  ServerAnalyzeResponse,
  SerializedAnalysisNode,
} from "@chess/shared";
import { classifyMove, computeAccuracy, evalToAbsoluteCp } from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { games, moves, gameAnalyses } from "../db/schema.js";

const evaluateBodySchema = {
  type: "object" as const,
  required: ["fen"],
  additionalProperties: false,
  properties: {
    fen: { type: "string" as const, minLength: 1 },
    depth: { type: "integer" as const, minimum: 1, maximum: 25 },
  },
};

const gameIdParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "number" as const },
  },
};

function ensureEngineAvailable(app: FastifyInstance, reply: FastifyReply): boolean {
  if (!app.hasDecorator("engine")) {
    reply.code(503).send({ error: "Engine not available" });
    return false;
  }
  return true;
}

function hasActiveGame(userId: number): boolean {
  const row = db
    .select({ id: games.id })
    .from(games)
    .where(
      and(
        or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
        inArray(games.status, ["active", "waiting"]),
      ),
    )
    .limit(1)
    .get();
  return row !== undefined;
}

const TERMINAL_STATUSES = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

function positionsToAnalysisTree(
  fens: string[],
  playedMoves: string[],
  positions: AnalyzedPosition[],
): SerializedAnalysisNode {
  const root: SerializedAnalysisNode = {
    fen: fens[0],
    san: null,
    evaluation: positions[0].evaluation,
    classification: null,
    children: [],
  };

  let current = root;
  for (let i = 0; i < playedMoves.length; i++) {
    const child: SerializedAnalysisNode = {
      fen: fens[i + 1],
      san: playedMoves[i],
      evaluation: positions[i + 1].evaluation,
      classification: positions[i + 1].classification,
      children: [],
    };
    current.children.push(child);
    current = child;
  }

  return root;
}

async function engineEvaluateRoutes(app: FastifyInstance) {
  app.post<{
    Body: ServerEvaluateRequest;
    Reply: EvaluationResult | ErrorResponse;
  }>(
    "/evaluate",
    {
      schema: { body: evaluateBodySchema },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      if (!ensureEngineAvailable(app, reply)) return;

      try {
        new Chess(request.body.fen);
      } catch {
        return reply.code(400).send({ error: "Invalid FEN" });
      }

      const depth = request.body.depth;
      const result = await app.engine.evaluate(request.body.fen, depth);
      return reply.code(200).send(result);
    },
  );
}

export const engineEvaluatePlugin = fp(engineEvaluateRoutes, {
  name: "engine-evaluate-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});

async function engineAnalyzeRoutes(app: FastifyInstance) {
  app.post<{
    Params: { id: number };
    Reply: ServerAnalyzeResponse | ErrorResponse;
  }>(
    "/:id/server-analyze",
    {
      schema: { params: gameIdParamsSchema },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      if (!ensureEngineAvailable(app, reply)) return;

      const userId = request.userId!;
      const gameId = request.params.id;

      const game = db.select().from(games).where(eq(games.id, gameId)).get();
      if (!game) {
        return reply.code(404).send({ error: "Game not found" });
      }

      if (game.whitePlayerId !== userId && game.blackPlayerId !== userId) {
        return reply.code(403).send({ error: "You are not a player in this game" });
      }

      if (!TERMINAL_STATUSES.includes(game.status)) {
        return reply.code(400).send({ error: "Game is not completed" });
      }

      if (hasActiveGame(userId)) {
        return reply.code(403).send({ error: "Cannot analyze while in an active game" });
      }

      const moveRows = db
        .select({ san: moves.san })
        .from(moves)
        .where(eq(moves.gameId, gameId))
        .orderBy(asc(moves.moveNumber))
        .all();

      const chess = new Chess();
      const fens: string[] = [chess.fen()];
      const playedMoves: string[] = [];

      for (const row of moveRows) {
        try {
          chess.move(row.san);
        } catch {
          return reply.code(400).send({ error: "Failed to replay game moves" });
        }
        fens.push(chess.fen());
        playedMoves.push(row.san);
      }

      const positions: AnalyzedPosition[] = [];
      const whiteLosses: number[] = [];
      const blackLosses: number[] = [];

      for (let i = 0; i < fens.length; i++) {
        const evaluation = await app.engine.evaluate(fens[i]);

        let classification: MoveClassification | null = null;
        let centipawnLoss: number | null = null;

        if (i > 0) {
          const prevEval = positions[i - 1].evaluation;
          const isWhiteMove = i % 2 === 1;
          classification = classifyMove(
            prevEval.score,
            evaluation.score,
            prevEval.bestLine[0] ?? "",
            playedMoves[i - 1],
            isWhiteMove,
          );

          const cpBefore = evalToAbsoluteCp(prevEval.score, isWhiteMove);
          const cpAfter = evalToAbsoluteCp(evaluation.score, !isWhiteMove);
          const loss = isWhiteMove ? cpBefore - cpAfter : cpAfter - cpBefore;
          centipawnLoss = Math.max(0, loss);

          if (isWhiteMove) {
            whiteLosses.push(centipawnLoss);
          } else {
            blackLosses.push(centipawnLoss);
          }
        }

        positions.push({ fen: fens[i], evaluation, classification, centipawnLoss });
      }

      const whiteAccuracy = computeAccuracy(whiteLosses);
      const blackAccuracy = computeAccuracy(blackLosses);

      const analysisTree = JSON.stringify(positionsToAnalysisTree(fens, playedMoves, positions));

      db.insert(gameAnalyses)
        .values({
          gameId,
          analysisTree,
          whiteAccuracy,
          blackAccuracy,
          engineDepth: positions[0]?.evaluation.depth ?? 20,
        })
        .onConflictDoUpdate({
          target: gameAnalyses.gameId,
          set: {
            analysisTree,
            whiteAccuracy,
            blackAccuracy,
            engineDepth: positions[0]?.evaluation.depth ?? 20,
            createdAt: sql`(unixepoch())`,
          },
        })
        .run();

      return reply.code(200).send({ positions, whiteAccuracy, blackAccuracy });
    },
  );
}

export const engineAnalyzePlugin = fp(engineAnalyzeRoutes, {
  name: "engine-analyze-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
