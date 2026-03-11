import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { PlayerStatsResponse, ErrorResponse } from "@chess/shared";
import { getPlayerStats } from "../game/service.js";
import { requireAuth } from "../auth/plugin.js";

const userIdParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "number" as const },
  },
};

async function userRoutes(app: FastifyInstance) {
  app.get<{
    Params: { id: number };
    Reply: PlayerStatsResponse | ErrorResponse;
  }>(
    "/:id/stats",
    { schema: { params: userIdParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const result = getPlayerStats(request.params.id);
      if (!result) {
        return reply.code(404).send({ error: "User not found" });
      }
      return reply.code(200).send(result);
    },
  );
}

export const userRoutesPlugin = fp(userRoutes, {
  name: "user-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
