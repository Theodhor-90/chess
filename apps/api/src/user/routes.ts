import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type {
  PlayerStatsResponse,
  ErrorResponse,
  UserPreferences,
  UserPreferencesResponse,
} from "@chess/shared";
import { getPlayerStats } from "../game/service.js";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const userIdParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "number" as const },
  },
};

const VALID_THEMES = ["light", "dark", "system"] as const;
const VALID_BOARD_THEMES = ["brown", "blue", "green", "ic"] as const;
const VALID_PIECE_THEMES = ["cburnett", "merida", "alpha", "california"] as const;

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "light",
  boardTheme: "brown",
  pieceTheme: "cburnett",
};

function parsePreferences(raw: string | null): UserPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      theme: (VALID_THEMES as readonly string[]).includes(parsed.theme as string)
        ? (parsed.theme as UserPreferences["theme"])
        : DEFAULT_PREFERENCES.theme,
      boardTheme: (VALID_BOARD_THEMES as readonly string[]).includes(parsed.boardTheme as string)
        ? (parsed.boardTheme as UserPreferences["boardTheme"])
        : DEFAULT_PREFERENCES.boardTheme,
      pieceTheme: (VALID_PIECE_THEMES as readonly string[]).includes(parsed.pieceTheme as string)
        ? (parsed.pieceTheme as UserPreferences["pieceTheme"])
        : DEFAULT_PREFERENCES.pieceTheme,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

const preferencesBodySchema = {
  type: "object" as const,
  required: ["preferences"],
  properties: {
    preferences: {
      type: "object" as const,
      required: ["theme", "boardTheme", "pieceTheme"],
      properties: {
        theme: { type: "string" as const, enum: ["light", "dark", "system"] },
        boardTheme: { type: "string" as const, enum: ["brown", "blue", "green", "ic"] },
        pieceTheme: {
          type: "string" as const,
          enum: ["cburnett", "merida", "alpha", "california"],
        },
      },
    },
  },
};

async function userRoutes(app: FastifyInstance) {
  // GET /me/preferences — retrieve user preferences
  app.get<{
    Reply: UserPreferencesResponse | ErrorResponse;
  }>("/me/preferences", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, request.userId!))
      .get();

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const preferences = parsePreferences(user.preferences);
    return reply.code(200).send({ preferences });
  });

  // PUT /me/preferences — update user preferences
  app.put<{
    Body: { preferences: UserPreferences };
    Reply: UserPreferencesResponse | ErrorResponse;
  }>(
    "/me/preferences",
    { schema: { body: preferencesBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const { preferences } = request.body;

      db.update(users)
        .set({ preferences: JSON.stringify(preferences) })
        .where(eq(users.id, request.userId!))
        .run();

      return reply.code(200).send({ preferences });
    },
  );

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
