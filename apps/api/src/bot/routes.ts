import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { BotGameRequest, BotGameResponse, ErrorResponse } from "@chess/shared";
import * as gameService from "../game/service.js";
import { GameError, type GameErrorCode } from "../game/errors.js";
import { requireAuth } from "../auth/plugin.js";
import { makeBotMove } from "./bot-player.js";
import { startClock, type TickCallback, type TimeoutCallback } from "../game/clock.js";
import * as store from "../game/store.js";

const ERROR_STATUS_MAP: Record<GameErrorCode, number> = {
  GAME_NOT_FOUND: 404,
  INVALID_STATUS: 409,
  NOT_YOUR_TURN: 403,
  NOT_A_PLAYER: 403,
  ILLEGAL_MOVE: 400,
  INVALID_INVITE_TOKEN: 400,
  CANNOT_JOIN_OWN_GAME: 400,
};

function handleGameError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof GameError) {
    const status = ERROR_STATUS_MAP[err.code];
    return reply.code(status).send({ error: err.message });
  }
  throw err;
}

const botGameBodySchema = {
  type: "object" as const,
  required: ["level"],
  additionalProperties: false,
  properties: {
    level: { type: "integer" as const, minimum: 1, maximum: 5 },
    clock: {
      type: "object" as const,
      required: ["initialTime", "increment"],
      additionalProperties: false,
      properties: {
        initialTime: { type: "number" as const, minimum: 1 },
        increment: { type: "number" as const, minimum: 0 },
      },
    },
  },
};

async function botRoutes(app: FastifyInstance) {
  app.post<{ Body: BotGameRequest; Reply: BotGameResponse | ErrorResponse }>(
    "/bot",
    { schema: { body: botGameBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const { level, clock } = request.body;

      // Validate engine is available
      if (!app.engine) {
        return reply.code(503).send({ error: "Engine is unavailable" });
      }

      try {
        const { game, humanColor, botProfile } = gameService.createBotGame(
          request.userId!,
          level,
          clock,
        );

        // Start the clock for the bot game
        const io = app.io;
        const onTick: TickCallback = (gameId, clockState) => {
          io.to(`game:${gameId}`).emit("clockUpdate", clockState);
        };
        const onTimeout: TimeoutCallback = (gameId, timedOutColor, clockState) => {
          try {
            store.updateGame(gameId, {
              clockWhiteRemaining: clockState.white,
              clockBlackRemaining: clockState.black,
            });
            const updatedGame = gameService.timeoutGame(gameId, timedOutColor);
            io.to(`game:${gameId}`).emit("gameOver", {
              status: updatedGame.status,
              result: updatedGame.result!,
              clock: clockState,
            });
          } catch {
            // Game may have already ended
          }
        };

        startClock(game.id, game.clock, "white", onTick, onTimeout);

        // If bot plays white, schedule its first move immediately
        if (humanColor === "black") {
          makeBotMove(app.engine, io, game.id, botProfile).catch((err) => {
            app.log.error(`Bot first move failed for game ${game.id}: ${err}`);
          });
        }

        return reply.code(201).send({
          gameId: game.id,
          color: humanColor,
          botProfile,
        });
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );
}

export const botRoutesPlugin = fp(botRoutes, {
  name: "bot-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
