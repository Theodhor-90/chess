import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply } from "fastify";
import { eq, sql } from "drizzle-orm";
import type {
  SaveAnalysisRequest,
  SaveAnalysisResponse,
  GetAnalysisResponse,
  ErrorResponse,
} from "@chess/shared";
import { db } from "../db/index.js";
import { games, gameAnalyses } from "../db/schema.js";
import { GameError, type GameErrorCode } from "../game/errors.js";
import { AnalysisError, ANALYSIS_ERROR_STATUS_MAP } from "./errors.js";
import { requireAuth } from "../auth/plugin.js";

const GAME_ERROR_STATUS_MAP: Partial<Record<GameErrorCode, number>> = {
  GAME_NOT_FOUND: 404,
  NOT_A_PLAYER: 403,
};

function handleError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof GameError) {
    const status = GAME_ERROR_STATUS_MAP[err.code];
    if (status !== undefined) {
      return reply.code(status).send({ error: err.message });
    }
  }
  if (err instanceof AnalysisError) {
    const status = ANALYSIS_ERROR_STATUS_MAP[err.code];
    return reply.code(status).send({ error: err.message });
  }
  throw err;
}

function getGameAndVerifyParticipant(gameId: number, userId: number): void {
  const game = db.select().from(games).where(eq(games.id, gameId)).get();
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.whitePlayerId !== userId && game.blackPlayerId !== userId) {
    throw new GameError("NOT_A_PLAYER", "You are not a player in this game");
  }
}

const gameIdParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "number" as const },
  },
};

const saveAnalysisBodySchema = {
  type: "object" as const,
  required: ["analysisTree", "whiteAccuracy", "blackAccuracy", "engineDepth"],
  additionalProperties: false,
  properties: {
    analysisTree: { type: "object" as const },
    whiteAccuracy: { type: "number" as const },
    blackAccuracy: { type: "number" as const },
    engineDepth: { type: "integer" as const },
  },
};

async function analysisRoutes(app: FastifyInstance) {
  app.post<{
    Params: { id: number };
    Body: SaveAnalysisRequest;
    Reply: SaveAnalysisResponse | ErrorResponse;
  }>(
    "/:id/analysis",
    {
      schema: { params: gameIdParamsSchema, body: saveAnalysisBodySchema },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      try {
        getGameAndVerifyParticipant(request.params.id, request.userId!);

        const row = db
          .insert(gameAnalyses)
          .values({
            gameId: request.params.id,
            analysisTree: JSON.stringify(request.body.analysisTree),
            whiteAccuracy: request.body.whiteAccuracy,
            blackAccuracy: request.body.blackAccuracy,
            engineDepth: request.body.engineDepth,
          })
          .onConflictDoUpdate({
            target: gameAnalyses.gameId,
            set: {
              analysisTree: JSON.stringify(request.body.analysisTree),
              whiteAccuracy: request.body.whiteAccuracy,
              blackAccuracy: request.body.blackAccuracy,
              engineDepth: request.body.engineDepth,
              createdAt: sql`(unixepoch())`,
            },
          })
          .returning()
          .get();

        return reply.code(200).send({
          gameId: row.gameId,
          createdAt: row.createdAt,
        });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  app.get<{
    Params: { id: number };
    Reply: GetAnalysisResponse | ErrorResponse;
  }>(
    "/:id/analysis",
    { schema: { params: gameIdParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        getGameAndVerifyParticipant(request.params.id, request.userId!);

        const row = db
          .select()
          .from(gameAnalyses)
          .where(eq(gameAnalyses.gameId, request.params.id))
          .get();

        if (!row) {
          throw new AnalysisError("ANALYSIS_NOT_FOUND", "No analysis found for this game");
        }

        return reply.code(200).send({
          gameId: row.gameId,
          analysisTree: JSON.parse(row.analysisTree),
          whiteAccuracy: row.whiteAccuracy,
          blackAccuracy: row.blackAccuracy,
          engineDepth: row.engineDepth,
          createdAt: row.createdAt,
        });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}

export const analysisRoutesPlugin = fp(analysisRoutes, {
  name: "analysis-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
