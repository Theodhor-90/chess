import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { Chess } from "chess.js";
import { normalizeFen, loadOpenings, classifyPosition } from "@chess/shared";
import type {
  OpeningInfo,
  ExplorerResponse,
  ExplorerMove,
  RatingBracket,
  SpeedCategory,
  PositionMoveStats,
  ErrorResponse,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { sqlite } from "../db/index.js";

const ALL_RATING_BRACKETS: RatingBracket[] = [
  "0-1000",
  "1000-1200",
  "1200-1400",
  "1400-1600",
  "1600-1800",
  "1800-2000",
  "2000-2200",
  "2200+",
];

const ALL_SPEED_CATEGORIES: SpeedCategory[] = ["bullet", "blitz", "rapid", "classical"];

interface PositionMoveRow {
  position_fen: string;
  move_san: string;
  move_uci: string;
  result_fen: string;
  master_white: number;
  master_draws: number;
  master_black: number;
  master_total_games: number;
  master_avg_rating: number;
  platform_stats: string;
}

interface PositionRow {
  eco: string | null;
  opening_name: string | null;
}

interface MastersQuery {
  fen: string;
  since?: string;
  until?: string;
}

interface PlatformQuery {
  fen: string;
  ratings?: string;
  speeds?: string;
  since?: string;
  until?: string;
}

interface PlatformStatsMap {
  [ratingBracket: string]: {
    [speedCategory: string]: PositionMoveStats;
  };
}

function validateAndNormalizeFen(fen: string): string | null {
  try {
    new Chess(fen);
    return normalizeFen(fen);
  } catch {
    const parts = fen.trim().split(/\s+/);
    if (parts.length === 4) {
      try {
        new Chess(fen + " 0 1");
        return normalizeFen(fen + " 0 1");
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseRatingBrackets(raw: string | undefined): RatingBracket[] | null {
  if (!raw) return ALL_RATING_BRACKETS;
  const parts = raw.split(",").map((s) => s.trim());
  for (const p of parts) {
    if (!(ALL_RATING_BRACKETS as string[]).includes(p)) return null;
  }
  return parts as RatingBracket[];
}

function parseSpeedCategories(raw: string | undefined): SpeedCategory[] | null {
  if (!raw) return ALL_SPEED_CATEGORIES;
  const parts = raw.split(",").map((s) => s.trim());
  for (const p of parts) {
    if (!(ALL_SPEED_CATEGORIES as string[]).includes(p)) return null;
  }
  return parts as SpeedCategory[];
}

function sumPlatformStats(
  platformStatsJson: string,
  ratings: RatingBracket[],
  speeds: SpeedCategory[],
): PositionMoveStats | null {
  let statsMap: PlatformStatsMap;
  try {
    statsMap = JSON.parse(platformStatsJson) as PlatformStatsMap;
  } catch {
    return null;
  }

  let white = 0,
    draws = 0,
    black = 0,
    totalGames = 0,
    ratingSum = 0;

  for (const bracket of ratings) {
    const bracketStats = statsMap[bracket];
    if (!bracketStats) continue;
    for (const speed of speeds) {
      const bucket = bracketStats[speed];
      if (!bucket) continue;
      white += bucket.white;
      draws += bucket.draws;
      black += bucket.black;
      totalGames += bucket.totalGames;
      ratingSum += bucket.avgRating * bucket.totalGames;
    }
  }

  if (totalGames === 0) return null;

  return {
    white,
    draws,
    black,
    totalGames,
    avgRating: Math.round(ratingSum / totalGames),
  };
}

const mastersQuerySchema = {
  type: "object" as const,
  required: ["fen"],
  properties: {
    fen: { type: "string" as const, minLength: 1 },
    since: { type: "string" as const, pattern: "^\\d{4}$" },
    until: { type: "string" as const, pattern: "^\\d{4}$" },
  },
};

const platformQuerySchema = {
  type: "object" as const,
  required: ["fen"],
  properties: {
    fen: { type: "string" as const, minLength: 1 },
    ratings: { type: "string" as const },
    speeds: { type: "string" as const },
    since: { type: "string" as const, pattern: "^\\d{4}(-\\d{2})?$" },
    until: { type: "string" as const, pattern: "^\\d{4}(-\\d{2})?$" },
  },
};

async function explorerRoutes(app: FastifyInstance) {
  const openingsMap = loadOpenings();

  const getMovesByFenStmt = sqlite.prepare(
    "SELECT * FROM opening_position_moves WHERE position_fen = ?",
  );
  const getPositionStmt = sqlite.prepare(
    "SELECT eco, opening_name FROM opening_positions WHERE position_fen = ?",
  );

  function getOpeningInfo(normalizedFen: string): OpeningInfo | null {
    const posRow = getPositionStmt.get(normalizedFen) as PositionRow | undefined;
    return posRow?.eco
      ? { eco: posRow.eco, name: posRow.opening_name ?? "" }
      : classifyPosition(normalizedFen, openingsMap);
  }

  // GET /masters
  app.get<{ Querystring: MastersQuery; Reply: ExplorerResponse | ErrorResponse }>(
    "/masters",
    { schema: { querystring: mastersQuerySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const normalizedFen = validateAndNormalizeFen(request.query.fen);
      if (normalizedFen === null) {
        return reply.code(400).send({ error: "Invalid FEN" });
      }

      const rows = getMovesByFenStmt.all(normalizedFen) as PositionMoveRow[];
      const masterRows = rows.filter((r) => r.master_total_games > 0);

      const moves: ExplorerMove[] = masterRows.map((row) => ({
        san: row.move_san,
        uci: row.move_uci,
        white: row.master_white,
        draws: row.master_draws,
        black: row.master_black,
        totalGames: row.master_total_games,
        avgRating: row.master_avg_rating,
        opening: classifyPosition(row.result_fen, openingsMap),
      }));

      moves.sort((a, b) => b.totalGames - a.totalGames);

      let totalWhite = 0,
        totalDraws = 0,
        totalBlack = 0;
      for (const m of moves) {
        totalWhite += m.white;
        totalDraws += m.draws;
        totalBlack += m.black;
      }

      return reply.code(200).send({
        opening: getOpeningInfo(normalizedFen),
        white: totalWhite,
        draws: totalDraws,
        black: totalBlack,
        moves,
        topGames: [],
      });
    },
  );

  // GET /platform
  app.get<{ Querystring: PlatformQuery; Reply: ExplorerResponse | ErrorResponse }>(
    "/platform",
    { schema: { querystring: platformQuerySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const normalizedFen = validateAndNormalizeFen(request.query.fen);
      if (normalizedFen === null) {
        return reply.code(400).send({ error: "Invalid FEN" });
      }

      const ratings = parseRatingBrackets(request.query.ratings);
      if (ratings === null) {
        return reply.code(400).send({ error: "Invalid rating bracket" });
      }

      const speeds = parseSpeedCategories(request.query.speeds);
      if (speeds === null) {
        return reply.code(400).send({ error: "Invalid speed category" });
      }

      const rows = getMovesByFenStmt.all(normalizedFen) as PositionMoveRow[];

      const moves: ExplorerMove[] = [];
      for (const row of rows) {
        const stats = sumPlatformStats(row.platform_stats, ratings, speeds);
        if (stats === null) continue;

        moves.push({
          san: row.move_san,
          uci: row.move_uci,
          white: stats.white,
          draws: stats.draws,
          black: stats.black,
          totalGames: stats.totalGames,
          avgRating: stats.avgRating,
          opening: classifyPosition(row.result_fen, openingsMap),
        });
      }

      moves.sort((a, b) => b.totalGames - a.totalGames);

      let totalWhite = 0,
        totalDraws = 0,
        totalBlack = 0;
      for (const m of moves) {
        totalWhite += m.white;
        totalDraws += m.draws;
        totalBlack += m.black;
      }

      return reply.code(200).send({
        opening: getOpeningInfo(normalizedFen),
        white: totalWhite,
        draws: totalDraws,
        black: totalBlack,
        moves,
        topGames: [],
      });
    },
  );
}

export const explorerRoutesPlugin = fp(explorerRoutes, {
  name: "explorer-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
