import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sql, and, or, like, gte, lte, eq, asc, desc } from "drizzle-orm";
import type {
  DatabaseGame,
  DatabaseGameFilter,
  DatabaseGameSortField,
  SortOrder,
  PaginatedResponse,
  ErrorResponse,
} from "@chess/shared";
import { gamesDb, gamesSqlite } from "../db/games-db.js";
import { databaseGames } from "../db/games-db-schema.js";

const VALID_SORT_FIELDS: DatabaseGameSortField[] = [
  "date",
  "whiteElo",
  "blackElo",
  "opening",
  "eco",
];
const VALID_SORT_ORDERS: SortOrder[] = ["asc", "desc"];
const VALID_RESULTS = ["1-0", "0-1", "1/2-1/2"];
const DATABASE_GAMES_TABLE_NAME = "database_games";

const databaseGamesQuerySchema = {
  type: "object" as const,
  properties: {
    page: { type: "integer" as const, minimum: 1, default: 1 },
    limit: { type: "integer" as const, minimum: 1, maximum: 100, default: 20 },
    player: { type: "string" as const, minLength: 1 },
    white: { type: "string" as const, minLength: 1 },
    black: { type: "string" as const, minLength: 1 },
    minElo: { type: "integer" as const, minimum: 0 },
    maxElo: { type: "integer" as const, minimum: 0 },
    result: { type: "string" as const, enum: VALID_RESULTS },
    eco: { type: "string" as const, minLength: 1 },
    opening: { type: "string" as const, minLength: 1 },
    dateFrom: { type: "string" as const, minLength: 1 },
    dateTo: { type: "string" as const, minLength: 1 },
    timeControl: { type: "string" as const, minLength: 1 },
    termination: { type: "string" as const, minLength: 1 },
    sort: { type: "string" as const, enum: VALID_SORT_FIELDS, default: "date" },
    order: { type: "string" as const, enum: VALID_SORT_ORDERS, default: "desc" },
  },
};

const gameIdParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "integer" as const, minimum: 1 },
  },
};

interface DatabaseGamesQuery extends DatabaseGameFilter {
  page: number;
  limit: number;
  sort: DatabaseGameSortField;
  order: SortOrder;
}

function buildWhereConditions(query: DatabaseGamesQuery) {
  const conditions = [];

  if (query.player) {
    const pattern = `%${query.player}%`;
    conditions.push(or(like(databaseGames.white, pattern), like(databaseGames.black, pattern)));
  }

  if (query.white) {
    conditions.push(like(databaseGames.white, `%${query.white}%`));
  }

  if (query.black) {
    conditions.push(like(databaseGames.black, `%${query.black}%`));
  }

  if (query.minElo !== undefined) {
    conditions.push(
      or(gte(databaseGames.whiteElo, query.minElo), gte(databaseGames.blackElo, query.minElo)),
    );
  }

  if (query.maxElo !== undefined) {
    conditions.push(
      or(lte(databaseGames.whiteElo, query.maxElo), lte(databaseGames.blackElo, query.maxElo)),
    );
  }

  if (query.result) {
    conditions.push(eq(databaseGames.result, query.result));
  }

  if (query.eco) {
    conditions.push(like(databaseGames.eco, `${query.eco}%`));
  }

  if (query.opening) {
    conditions.push(like(databaseGames.opening, `%${query.opening}%`));
  }

  if (query.dateFrom) {
    conditions.push(gte(databaseGames.date, query.dateFrom));
  }

  if (query.dateTo) {
    conditions.push(lte(databaseGames.date, query.dateTo));
  }

  if (query.timeControl) {
    conditions.push(eq(databaseGames.timeControl, query.timeControl));
  }

  if (query.termination) {
    conditions.push(eq(databaseGames.termination, query.termination));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function getSortColumn(field: DatabaseGameSortField) {
  const map = {
    date: databaseGames.date,
    whiteElo: databaseGames.whiteElo,
    blackElo: databaseGames.blackElo,
    opening: databaseGames.opening,
    eco: databaseGames.eco,
  } as const;
  return map[field];
}

function hasDatabaseGamesTable(): boolean {
  const table = gamesSqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(DATABASE_GAMES_TABLE_NAME);

  return table !== undefined;
}

async function databaseRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: DatabaseGamesQuery;
    Reply: PaginatedResponse<Omit<DatabaseGame, "pgn">> | ErrorResponse;
  }>("/games", { schema: { querystring: databaseGamesQuerySchema } }, async (request, reply) => {
    if (!hasDatabaseGamesTable()) {
      return reply.code(200).send({
        data: [],
        total: 0,
        page: request.query.page,
        limit: request.query.limit,
        totalPages: 0,
      });
    }

    const query = request.query;
    const where = buildWhereConditions(query);
    const offset = (query.page - 1) * query.limit;

    const sortCol = getSortColumn(query.sort);
    const orderFn = query.order === "asc" ? asc : desc;

    const rows = gamesDb
      .select({
        id: databaseGames.id,
        white: databaseGames.white,
        black: databaseGames.black,
        whiteElo: databaseGames.whiteElo,
        blackElo: databaseGames.blackElo,
        result: databaseGames.result,
        eco: databaseGames.eco,
        opening: databaseGames.opening,
        date: databaseGames.date,
        timeControl: databaseGames.timeControl,
        termination: databaseGames.termination,
        lichessUrl: databaseGames.lichessUrl,
      })
      .from(databaseGames)
      .where(where)
      .orderBy(orderFn(sortCol))
      .limit(query.limit)
      .offset(offset)
      .all();

    const countResult = gamesDb
      .select({ count: sql<number>`count(*)` })
      .from(databaseGames)
      .where(where)
      .get();

    const total = countResult?.count ?? 0;
    const totalPages = Math.ceil(total / query.limit);

    return reply.code(200).send({
      data: rows,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    });
  });

  app.get<{
    Params: { id: number };
    Reply: DatabaseGame | ErrorResponse;
  }>("/games/:id", { schema: { params: gameIdParamsSchema } }, async (request, reply) => {
    if (!hasDatabaseGamesTable()) {
      return reply.code(404).send({ error: "Game not found" });
    }

    const row = gamesDb
      .select()
      .from(databaseGames)
      .where(eq(databaseGames.id, request.params.id))
      .get();

    if (!row) {
      return reply.code(404).send({ error: "Game not found" });
    }

    return reply.code(200).send(row);
  });
}

export const databaseRoutesPlugin = fp(databaseRoutes, {
  name: "database-routes",
  encapsulate: true,
});
