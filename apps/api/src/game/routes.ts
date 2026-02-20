import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  CreateGameRequest,
  CreateGameResponse,
  JoinGameRequest,
  GameResponse,
  MoveRequest,
  MoveResponse,
  ErrorResponse,
  ResolveInviteResponse,
  GameListResponse,
} from "@chess/shared";
import * as gameService from "./service.js";
import { GameError, type GameErrorCode } from "./errors.js";
import { requireAuth } from "../auth/plugin.js";

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

const gameIdParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "number" as const },
  },
};

const createGameBodySchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
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

const joinGameBodySchema = {
  type: "object" as const,
  required: ["inviteToken"],
  properties: {
    inviteToken: { type: "string" as const, minLength: 1 },
  },
};

const moveBodySchema = {
  type: "object" as const,
  required: ["from", "to"],
  properties: {
    from: { type: "string" as const, minLength: 2, maxLength: 2 },
    to: { type: "string" as const, minLength: 2, maxLength: 2 },
    promotion: { type: "string" as const, minLength: 1, maxLength: 1 },
  },
};

const inviteTokenParamsSchema = {
  type: "object" as const,
  required: ["inviteToken"],
  properties: {
    inviteToken: { type: "string" as const, minLength: 1 },
  },
};

async function gameRoutes(app: FastifyInstance) {
  // Public endpoint — no authentication required
  app.get<{
    Params: { inviteToken: string };
    Reply: ResolveInviteResponse | ErrorResponse;
  }>(
    "/resolve/:inviteToken",
    { schema: { params: inviteTokenParamsSchema } },
    async (request, reply) => {
      try {
        const result = gameService.resolveInviteToken(request.params.inviteToken);
        return reply.code(200).send(result);
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );

  app.get<{ Reply: GameListResponse | ErrorResponse }>(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const games = gameService.getUserGames(request.userId!);
      return reply.code(200).send(games);
    },
  );

  app.post<{ Body: CreateGameRequest; Reply: CreateGameResponse | ErrorResponse }>(
    "/",
    { schema: { body: createGameBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const clock = request.body?.clock;
      const game = gameService.createGame(request.userId!, clock);
      const creatorColor = game.players.white?.userId === request.userId! ? "white" : "black";
      return reply.code(201).send({
        gameId: game.id,
        inviteToken: game.inviteToken,
        color: creatorColor,
      });
    },
  );

  app.post<{
    Params: { id: number };
    Body: JoinGameRequest;
    Reply: GameResponse | ErrorResponse;
  }>(
    "/:id/join",
    { schema: { params: gameIdParamsSchema, body: joinGameBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const game = gameService.joinGame(
          request.params.id,
          request.userId!,
          request.body.inviteToken,
        );
        return reply.code(200).send(game);
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );

  app.get<{ Params: { id: number }; Reply: GameResponse | ErrorResponse }>(
    "/:id",
    { schema: { params: gameIdParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const game = gameService.getGame(request.params.id);
        return reply.code(200).send(game);
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );

  app.post<{
    Params: { id: number };
    Body: MoveRequest;
    Reply: MoveResponse | ErrorResponse;
  }>(
    "/:id/moves",
    { schema: { params: gameIdParamsSchema, body: moveBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const result = gameService.makeMove(request.params.id, request.userId!, request.body);
        return reply.code(200).send(result);
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );

  app.post<{ Params: { id: number }; Reply: GameResponse | ErrorResponse }>(
    "/:id/resign",
    { schema: { params: gameIdParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const game = gameService.resignGame(request.params.id, request.userId!);
        return reply.code(200).send(game);
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );

  app.post<{ Params: { id: number }; Reply: GameResponse | ErrorResponse }>(
    "/:id/draw",
    { schema: { params: gameIdParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const game = gameService.offerOrAcceptDraw(request.params.id, request.userId!);
        return reply.code(200).send(game);
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );

  app.post<{ Params: { id: number }; Reply: GameResponse | ErrorResponse }>(
    "/:id/abort",
    { schema: { params: gameIdParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const game = gameService.abortGame(request.params.id, request.userId!);
        return reply.code(200).send(game);
      } catch (err) {
        return handleGameError(err, reply);
      }
    },
  );
}

export const gameRoutesPlugin = fp(gameRoutes, {
  name: "game-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
