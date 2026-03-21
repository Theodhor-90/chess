import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Chess } from "chess.js";
import { normalizeFen, loadOpenings, classifyPosition, getSpeedCategory } from "@chess/shared";
import type {
  OpeningInfo,
  ExplorerResponse,
  ExplorerMove,
  ExplorerTopGame,
  RatingBracket,
  SpeedCategory,
  PositionMoveStats,
  ErrorResponse,
  ExplorerEngineResponse,
  ExplorerPlayerResponse,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { sqlite } from "../db/index.js";
import { gamesSqlite } from "../db/games-db.js";
import { backfillPlayerStats } from "./player-stats.js";

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
  const getPlayerStatsByFenStmt = sqlite.prepare(
    "SELECT move_san, move_uci, result_fen, white, draws, black, total_games, avg_opponent_rating FROM opening_player_stats WHERE user_id = ? AND position_fen = ? AND color = ?",
  );

  function getOpeningInfo(normalizedFen: string): OpeningInfo | null {
    const posRow = getPositionStmt.get(normalizedFen) as PositionRow | undefined;
    return posRow?.eco
      ? { eco: posRow.eco, name: posRow.opening_name ?? "" }
      : classifyPosition(normalizedFen, openingsMap);
  }

  interface DatabaseGameRow {
    id: number;
    white: string;
    black: string;
    white_elo: number;
    black_elo: number;
    result: string;
    date: string | null;
    pgn: string;
  }

  const gamesDbAvailable = (() => {
    try {
      const row = gamesSqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'database_games'")
        .get();
      return row !== undefined;
    } catch {
      return false;
    }
  })();

  function getMastersTopGames(
    normalizedFen: string,
    openingsMap: Map<string, OpeningInfo>,
  ): ExplorerTopGame[] {
    if (!gamesDbAvailable) return [];

    const posRow = getPositionStmt.get(normalizedFen) as PositionRow | undefined;
    const eco = posRow?.eco ?? classifyPosition(normalizedFen, openingsMap)?.eco;
    if (!eco) return [];

    const candidates = gamesSqlite
      .prepare(
        `SELECT id, white, black, white_elo, black_elo, result, date, pgn
         FROM database_games
         WHERE eco = ?
         ORDER BY (white_elo + black_elo) DESC
         LIMIT 100`,
      )
      .all(eco) as DatabaseGameRow[];

    const confirmed: ExplorerTopGame[] = [];
    for (const game of candidates) {
      if (confirmed.length >= 8) break;
      if (!game.pgn || game.pgn.trim() === "") continue;

      const chess = new Chess();
      try {
        chess.loadPgn(game.pgn);
      } catch {
        continue;
      }

      const history = chess.history({ verbose: true });
      const replay = new Chess();
      let found = false;

      for (let i = 0; i < history.length; i++) {
        if (normalizeFen(replay.fen()) === normalizedFen) {
          found = true;
          break;
        }
        try {
          replay.move(history[i].san);
        } catch {
          break;
        }
      }
      if (!found && normalizeFen(replay.fen()) === normalizedFen) {
        found = true;
      }

      if (found) {
        const year = game.date ? parseInt(game.date.split(".")[0], 10) : 0;
        confirmed.push({
          id: game.id,
          white: game.white,
          black: game.black,
          whiteRating: game.white_elo,
          blackRating: game.black_elo,
          result: game.result,
          year: isNaN(year) ? 0 : year,
        });
      }
    }

    return confirmed;
  }

  function getPlatformTopGames(normalizedFen: string): ExplorerTopGame[] {
    const terminalStatuses = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

    const candidates = sqlite
      .prepare(
        `SELECT g.id, g.white_player_id, g.black_player_id, g.result_winner, g.pgn, g.created_at,
                wu.username AS white_username, bu.username AS black_username
         FROM games g
         LEFT JOIN users wu ON wu.id = g.white_player_id
         LEFT JOIN users bu ON bu.id = g.black_player_id
         WHERE g.status IN (${terminalStatuses.map(() => "?").join(",")})
           AND g.pgn != ''
         ORDER BY g.created_at DESC
         LIMIT 100`,
      )
      .all(...terminalStatuses) as {
      id: number;
      white_player_id: number;
      black_player_id: number;
      result_winner: string | null;
      pgn: string;
      created_at: number;
      white_username: string | null;
      black_username: string | null;
    }[];

    const confirmed: ExplorerTopGame[] = [];
    for (const game of candidates) {
      if (confirmed.length >= 8) break;

      const chess = new Chess();
      try {
        chess.loadPgn(game.pgn);
      } catch {
        continue;
      }

      const history = chess.history({ verbose: true });
      const replay = new Chess();
      let found = false;

      for (let i = 0; i < history.length; i++) {
        if (normalizeFen(replay.fen()) === normalizedFen) {
          found = true;
          break;
        }
        try {
          replay.move(history[i].san);
        } catch {
          break;
        }
      }
      if (!found && normalizeFen(replay.fen()) === normalizedFen) {
        found = true;
      }

      if (found) {
        let resultStr: string;
        if (game.result_winner === "white") resultStr = "1-0";
        else if (game.result_winner === "black") resultStr = "0-1";
        else resultStr = "1/2-1/2";

        const year = new Date(game.created_at * 1000).getFullYear();

        confirmed.push({
          id: game.id,
          white: game.white_username ?? `User #${game.white_player_id}`,
          black: game.black_username ?? `User #${game.black_player_id}`,
          whiteRating: 0,
          blackRating: 0,
          result: resultStr,
          year,
        });
      }
    }

    return confirmed;
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
        topGames: getMastersTopGames(normalizedFen, openingsMap),
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
        topGames: getPlatformTopGames(normalizedFen),
      });
    },
  );

  // ---------------------------------------------------------------------------
  // Player Explorer
  // ---------------------------------------------------------------------------

  interface PlayerQuery {
    fen: string;
    userId: string;
    color: string;
    speeds?: string;
    since?: string;
    until?: string;
  }

  const playerQuerySchema = {
    type: "object" as const,
    required: ["fen", "userId", "color"],
    properties: {
      fen: { type: "string" as const, minLength: 1 },
      userId: { type: "string" as const, pattern: "^\\d+$" },
      color: { type: "string" as const, enum: ["white", "black"] },
      speeds: { type: "string" as const },
      since: { type: "string" as const, pattern: "^\\d{4}(-\\d{2})?$" },
      until: { type: "string" as const, pattern: "^\\d{4}(-\\d{2})?$" },
    },
  };

  interface PersonalQuery {
    fen: string;
    color: string;
    speeds?: string;
    since?: string;
    until?: string;
  }

  const personalQuerySchema = {
    type: "object" as const,
    required: ["fen", "color"],
    properties: {
      fen: { type: "string" as const, minLength: 1 },
      color: { type: "string" as const, enum: ["white", "black"] },
      speeds: { type: "string" as const },
      since: { type: "string" as const, pattern: "^\\d{4}(-\\d{2})?$" },
      until: { type: "string" as const, pattern: "^\\d{4}(-\\d{2})?$" },
    },
  };

  interface PlayerStatsRow {
    move_san: string;
    move_uci: string;
    result_fen: string;
    white: number;
    draws: number;
    black: number;
    total_games: number;
    avg_opponent_rating: number;
  }

  const PLAYER_GAME_LIMIT = 500;

  // GET /player
  app.get<{ Querystring: PlayerQuery; Reply: ExplorerPlayerResponse | ErrorResponse }>(
    "/player",
    { schema: { querystring: playerQuerySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const normalizedFen = validateAndNormalizeFen(request.query.fen);
      if (normalizedFen === null) {
        return reply.code(400).send({ error: "Invalid FEN" });
      }

      const userId = parseInt(request.query.userId, 10);
      const color = request.query.color as "white" | "black";

      const speeds = parseSpeedCategories(request.query.speeds);
      if (speeds === null) {
        return reply.code(400).send({ error: "Invalid speed category" });
      }

      const queriedUserId = parseInt(request.query.userId, 10);
      const isSelfQuery = request.userId !== null && queriedUserId === request.userId;
      const hasPlayerFilters =
        request.query.speeds !== undefined ||
        request.query.since !== undefined ||
        request.query.until !== undefined;

      if (isSelfQuery && !hasPlayerFilters) {
        const selfRow = sqlite
          .prepare("SELECT player_stats_indexed FROM users WHERE id = ?")
          .get(queriedUserId) as { player_stats_indexed: number } | undefined;

        if (selfRow && selfRow.player_stats_indexed === 1) {
          const rows = getPlayerStatsByFenStmt.all(
            queriedUserId,
            normalizedFen,
            color,
          ) as PlayerStatsRow[];

          const fastMoves: ExplorerMove[] = rows.map((row) => {
            let wins: number, losses: number;
            if (color === "white") {
              wins = row.white;
              losses = row.black;
            } else {
              wins = row.black;
              losses = row.white;
            }
            return {
              san: row.move_san,
              uci: row.move_uci,
              white: wins,
              draws: row.draws,
              black: losses,
              totalGames: row.total_games,
              avgRating: row.avg_opponent_rating,
              opening: classifyPosition(row.result_fen, openingsMap),
            };
          });

          fastMoves.sort((a, b) => b.totalGames - a.totalGames);

          let totalWhite = 0,
            totalDraws = 0,
            totalBlack = 0;
          for (const m of fastMoves) {
            totalWhite += m.white;
            totalDraws += m.draws;
            totalBlack += m.black;
          }

          const topGames = getPersonalTopGames(queriedUserId, normalizedFen, color);

          return reply.code(200).send({
            opening: getOpeningInfo(normalizedFen),
            white: totalWhite,
            draws: totalDraws,
            black: totalBlack,
            moves: fastMoves,
            topGames,
            partial: false,
          });
        }
      }

      const terminalStatuses = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

      let sqlQuery = `
        SELECT g.id, g.pgn, g.result_winner, g.clock_initial_time, g.clock_increment, g.created_at,
               wu.username AS white_username, bu.username AS black_username,
               g.white_player_id, g.black_player_id
        FROM games g
        LEFT JOIN users wu ON wu.id = g.white_player_id
        LEFT JOIN users bu ON bu.id = g.black_player_id
        WHERE g.status IN (${terminalStatuses.map(() => "?").join(",")})
      `;
      const params: (string | number)[] = [...terminalStatuses];

      if (color === "white") {
        sqlQuery += ` AND g.white_player_id = ?`;
      } else {
        sqlQuery += ` AND g.black_player_id = ?`;
      }
      params.push(userId);

      if (request.query.since) {
        const sinceParts = request.query.since.split("-");
        const sinceYear = parseInt(sinceParts[0], 10);
        const sinceMonth = sinceParts.length > 1 ? parseInt(sinceParts[1], 10) - 1 : 0;
        const sinceTimestamp = Math.floor(new Date(sinceYear, sinceMonth, 1).getTime() / 1000);
        sqlQuery += ` AND g.created_at >= ?`;
        params.push(sinceTimestamp);
      }
      if (request.query.until) {
        const untilParts = request.query.until.split("-");
        const untilYear = parseInt(untilParts[0], 10);
        const untilMonth = untilParts.length > 1 ? parseInt(untilParts[1], 10) : 12;
        const untilTimestamp = Math.floor(
          new Date(untilYear, untilMonth, 0, 23, 59, 59).getTime() / 1000,
        );
        sqlQuery += ` AND g.created_at <= ?`;
        params.push(untilTimestamp);
      }

      sqlQuery += ` ORDER BY g.created_at DESC LIMIT ?`;
      params.push(PLAYER_GAME_LIMIT + 1);

      interface PlayerGameRow {
        id: number;
        pgn: string;
        result_winner: string | null;
        clock_initial_time: number;
        clock_increment: number;
        created_at: number;
        white_username: string | null;
        black_username: string | null;
        white_player_id: number;
        black_player_id: number;
      }

      const gameRows = sqlite.prepare(sqlQuery).all(...params) as PlayerGameRow[];

      const partial = gameRows.length > PLAYER_GAME_LIMIT;
      const gamesToProcess = gameRows.slice(0, PLAYER_GAME_LIMIT);

      const filteredGames = gamesToProcess.filter((g) => {
        const speed = getSpeedCategory(g.clock_initial_time);
        return speeds.includes(speed);
      });

      interface MoveAccum {
        white: number;
        draws: number;
        black: number;
        totalGames: number;
        uci: string;
      }

      const moveStats = new Map<string, MoveAccum>();
      const topGameCandidates: ExplorerTopGame[] = [];

      for (const gameRow of filteredGames) {
        if (!gameRow.pgn || gameRow.pgn.trim() === "") continue;

        const chess = new Chess();
        try {
          chess.loadPgn(gameRow.pgn);
        } catch {
          continue;
        }

        const history = chess.history({ verbose: true });
        if (history.length === 0) continue;

        const replay = new Chess();

        for (let i = 0; i < history.length; i++) {
          const currentFen = normalizeFen(replay.fen());

          if (currentFen === normalizedFen) {
            const move = history[i];
            const san = move.san;
            const uci = move.from + move.to + (move.promotion ?? "");

            let resultType: "white" | "draws" | "black";
            if (gameRow.result_winner === null) {
              resultType = "draws";
            } else if (gameRow.result_winner === color) {
              resultType = "white";
            } else {
              resultType = "black";
            }

            const existing = moveStats.get(san);
            if (existing) {
              existing[resultType] += 1;
              existing.totalGames += 1;
            } else {
              const accum: MoveAccum = {
                white: 0,
                draws: 0,
                black: 0,
                totalGames: 0,
                uci,
              };
              accum[resultType] = 1;
              accum.totalGames = 1;
              moveStats.set(san, accum);
            }

            if (topGameCandidates.length < 8) {
              let resultStr: string;
              if (gameRow.result_winner === "white") resultStr = "1-0";
              else if (gameRow.result_winner === "black") resultStr = "0-1";
              else resultStr = "1/2-1/2";

              topGameCandidates.push({
                id: gameRow.id,
                white: gameRow.white_username ?? `User #${gameRow.white_player_id}`,
                black: gameRow.black_username ?? `User #${gameRow.black_player_id}`,
                whiteRating: 0,
                blackRating: 0,
                result: resultStr,
                year: new Date(gameRow.created_at * 1000).getFullYear(),
              });
            }

            break;
          }

          try {
            replay.move(history[i].san);
          } catch {
            break;
          }
        }
      }

      const explorerMoves: ExplorerMove[] = [];
      for (const [san, accum] of moveStats) {
        const tempChess = new Chess(normalizedFen + " 0 1");
        let resultFen: string | null = null;
        try {
          tempChess.move(san);
          resultFen = normalizeFen(tempChess.fen());
        } catch {
          resultFen = null;
        }

        explorerMoves.push({
          san,
          uci: accum.uci,
          white: accum.white,
          draws: accum.draws,
          black: accum.black,
          totalGames: accum.totalGames,
          avgRating: 0,
          opening: resultFen ? classifyPosition(resultFen, openingsMap) : null,
        });
      }

      explorerMoves.sort((a, b) => b.totalGames - a.totalGames);

      let totalWhite = 0,
        totalDraws = 0,
        totalBlack = 0;
      for (const m of explorerMoves) {
        totalWhite += m.white;
        totalDraws += m.draws;
        totalBlack += m.black;
      }

      return reply.code(200).send({
        opening: getOpeningInfo(normalizedFen),
        white: totalWhite,
        draws: totalDraws,
        black: totalBlack,
        moves: explorerMoves,
        topGames: topGameCandidates,
        partial,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // Personal Explorer
  // ---------------------------------------------------------------------------

  function getPersonalTopGames(
    userId: number,
    normalizedFen: string,
    color: "white" | "black",
  ): ExplorerTopGame[] {
    const terminalStatuses = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

    const colorFilter = color === "white" ? "g.white_player_id = ?" : "g.black_player_id = ?";

    const candidates = sqlite
      .prepare(
        `SELECT g.id, g.white_player_id, g.black_player_id, g.result_winner, g.pgn, g.created_at,
                wu.username AS white_username, bu.username AS black_username
         FROM games g
         LEFT JOIN users wu ON wu.id = g.white_player_id
         LEFT JOIN users bu ON bu.id = g.black_player_id
         WHERE g.status IN (${terminalStatuses.map(() => "?").join(",")})
           AND ${colorFilter}
           AND g.pgn != ''
         ORDER BY g.created_at DESC
         LIMIT 50`,
      )
      .all(...terminalStatuses, userId) as {
      id: number;
      white_player_id: number;
      black_player_id: number;
      result_winner: string | null;
      pgn: string;
      created_at: number;
      white_username: string | null;
      black_username: string | null;
    }[];

    const confirmed: ExplorerTopGame[] = [];
    for (const game of candidates) {
      if (confirmed.length >= 8) break;

      const chess = new Chess();
      try {
        chess.loadPgn(game.pgn);
      } catch {
        continue;
      }

      const history = chess.history({ verbose: true });
      const replay = new Chess();
      let found = false;

      for (let i = 0; i < history.length; i++) {
        if (normalizeFen(replay.fen()) === normalizedFen) {
          found = true;
          break;
        }
        try {
          replay.move(history[i].san);
        } catch {
          break;
        }
      }
      if (!found && normalizeFen(replay.fen()) === normalizedFen) {
        found = true;
      }

      if (found) {
        let resultStr: string;
        if (game.result_winner === "white") resultStr = "1-0";
        else if (game.result_winner === "black") resultStr = "0-1";
        else resultStr = "1/2-1/2";

        const year = new Date(game.created_at * 1000).getFullYear();

        confirmed.push({
          id: game.id,
          white: game.white_username ?? `User #${game.white_player_id}`,
          black: game.black_username ?? `User #${game.black_player_id}`,
          whiteRating: 0,
          blackRating: 0,
          result: resultStr,
          year,
        });
      }
    }

    return confirmed;
  }

  async function replayPersonalStats(
    request: FastifyRequest<{ Querystring: PersonalQuery }>,
    reply: FastifyReply,
    userId: number,
    normalizedFen: string,
    color: "white" | "black",
    speeds: SpeedCategory[],
    openingsMap: Map<string, OpeningInfo>,
  ): Promise<void> {
    const terminalStatuses = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

    let sqlQuery = `
      SELECT g.id, g.pgn, g.result_winner, g.clock_initial_time, g.clock_increment, g.created_at,
             wu.username AS white_username, bu.username AS black_username,
             g.white_player_id, g.black_player_id
      FROM games g
      LEFT JOIN users wu ON wu.id = g.white_player_id
      LEFT JOIN users bu ON bu.id = g.black_player_id
      WHERE g.status IN (${terminalStatuses.map(() => "?").join(",")})
    `;
    const params: (string | number)[] = [...terminalStatuses];

    if (color === "white") {
      sqlQuery += ` AND g.white_player_id = ?`;
    } else {
      sqlQuery += ` AND g.black_player_id = ?`;
    }
    params.push(userId);

    if (request.query.since) {
      const sinceParts = request.query.since.split("-");
      const sinceYear = parseInt(sinceParts[0], 10);
      const sinceMonth = sinceParts.length > 1 ? parseInt(sinceParts[1], 10) - 1 : 0;
      const sinceTimestamp = Math.floor(new Date(sinceYear, sinceMonth, 1).getTime() / 1000);
      sqlQuery += ` AND g.created_at >= ?`;
      params.push(sinceTimestamp);
    }
    if (request.query.until) {
      const untilParts = request.query.until.split("-");
      const untilYear = parseInt(untilParts[0], 10);
      const untilMonth = untilParts.length > 1 ? parseInt(untilParts[1], 10) : 12;
      const untilTimestamp = Math.floor(
        new Date(untilYear, untilMonth, 0, 23, 59, 59).getTime() / 1000,
      );
      sqlQuery += ` AND g.created_at <= ?`;
      params.push(untilTimestamp);
    }

    sqlQuery += ` ORDER BY g.created_at DESC LIMIT 501`;

    interface ReplayGameRow {
      id: number;
      pgn: string;
      result_winner: string | null;
      clock_initial_time: number;
      clock_increment: number;
      created_at: number;
      white_username: string | null;
      black_username: string | null;
      white_player_id: number;
      black_player_id: number;
    }

    const gameRows = sqlite.prepare(sqlQuery).all(...params) as ReplayGameRow[];
    const gamesToProcess = gameRows.slice(0, 500);

    const filteredGames = gamesToProcess.filter((g) => {
      const speed = getSpeedCategory(g.clock_initial_time);
      return speeds.includes(speed);
    });

    interface MoveAccum {
      white: number;
      draws: number;
      black: number;
      totalGames: number;
      uci: string;
    }

    const moveStats = new Map<string, MoveAccum>();
    const topGameCandidates: ExplorerTopGame[] = [];

    for (const gameRow of filteredGames) {
      if (!gameRow.pgn || gameRow.pgn.trim() === "") continue;

      const chess = new Chess();
      try {
        chess.loadPgn(gameRow.pgn);
      } catch {
        continue;
      }

      const history = chess.history({ verbose: true });
      if (history.length === 0) continue;

      const replay = new Chess();

      for (let i = 0; i < history.length; i++) {
        const currentFen = normalizeFen(replay.fen());

        if (currentFen === normalizedFen) {
          const move = history[i];
          const san = move.san;
          const uci = move.from + move.to + (move.promotion ?? "");

          let resultType: "white" | "draws" | "black";
          if (gameRow.result_winner === null) {
            resultType = "draws";
          } else if (gameRow.result_winner === color) {
            resultType = "white";
          } else {
            resultType = "black";
          }

          const existing = moveStats.get(san);
          if (existing) {
            existing[resultType] += 1;
            existing.totalGames += 1;
          } else {
            const accum: MoveAccum = {
              white: 0,
              draws: 0,
              black: 0,
              totalGames: 0,
              uci,
            };
            accum[resultType] = 1;
            accum.totalGames = 1;
            moveStats.set(san, accum);
          }

          if (topGameCandidates.length < 8) {
            let resultStr: string;
            if (gameRow.result_winner === "white") resultStr = "1-0";
            else if (gameRow.result_winner === "black") resultStr = "0-1";
            else resultStr = "1/2-1/2";

            topGameCandidates.push({
              id: gameRow.id,
              white: gameRow.white_username ?? `User #${gameRow.white_player_id}`,
              black: gameRow.black_username ?? `User #${gameRow.black_player_id}`,
              whiteRating: 0,
              blackRating: 0,
              result: resultStr,
              year: new Date(gameRow.created_at * 1000).getFullYear(),
            });
          }

          break;
        }

        try {
          replay.move(history[i].san);
        } catch {
          break;
        }
      }
    }

    const explorerMoves: ExplorerMove[] = [];
    for (const [san, accum] of moveStats) {
      const tempChess = new Chess(normalizedFen + " 0 1");
      let resultFen: string | null = null;
      try {
        tempChess.move(san);
        resultFen = normalizeFen(tempChess.fen());
      } catch {
        resultFen = null;
      }

      explorerMoves.push({
        san,
        uci: accum.uci,
        white: accum.white,
        draws: accum.draws,
        black: accum.black,
        totalGames: accum.totalGames,
        avgRating: 0,
        opening: resultFen ? classifyPosition(resultFen, openingsMap) : null,
      });
    }

    explorerMoves.sort((a, b) => b.totalGames - a.totalGames);

    let totalWhite = 0,
      totalDraws = 0,
      totalBlack = 0;
    for (const m of explorerMoves) {
      totalWhite += m.white;
      totalDraws += m.draws;
      totalBlack += m.black;
    }

    return reply.code(200).send({
      opening: getOpeningInfo(normalizedFen),
      white: totalWhite,
      draws: totalDraws,
      black: totalBlack,
      moves: explorerMoves,
      topGames: topGameCandidates,
    });
  }

  // GET /personal
  app.get<{ Querystring: PersonalQuery; Reply: ExplorerResponse | ErrorResponse }>(
    "/personal",
    { schema: { querystring: personalQuerySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const normalizedFen = validateAndNormalizeFen(request.query.fen);
      if (normalizedFen === null) {
        return reply.code(400).send({ error: "Invalid FEN" });
      }

      const color = request.query.color as "white" | "black";

      const speeds = parseSpeedCategories(request.query.speeds);
      if (speeds === null) {
        return reply.code(400).send({ error: "Invalid speed category" });
      }

      const userRow = sqlite
        .prepare("SELECT player_stats_indexed FROM users WHERE id = ?")
        .get(userId) as { player_stats_indexed: number } | undefined;

      if (!userRow) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      if (userRow.player_stats_indexed !== 1) {
        await backfillPlayerStats(userId);
      }

      const hasFilters =
        request.query.speeds !== undefined ||
        request.query.since !== undefined ||
        request.query.until !== undefined;

      if (hasFilters) {
        return replayPersonalStats(
          request,
          reply,
          userId,
          normalizedFen,
          color,
          speeds,
          openingsMap,
        );
      }

      const rows = getPlayerStatsByFenStmt.all(userId, normalizedFen, color) as PlayerStatsRow[];

      const moves: ExplorerMove[] = rows.map((row) => {
        let wins: number, losses: number;
        if (color === "white") {
          wins = row.white;
          losses = row.black;
        } else {
          wins = row.black;
          losses = row.white;
        }

        return {
          san: row.move_san,
          uci: row.move_uci,
          white: wins,
          draws: row.draws,
          black: losses,
          totalGames: row.total_games,
          avgRating: row.avg_opponent_rating,
          opening: classifyPosition(row.result_fen, openingsMap),
        };
      });

      moves.sort((a, b) => b.totalGames - a.totalGames);

      let totalWhite = 0,
        totalDraws = 0,
        totalBlack = 0;
      for (const m of moves) {
        totalWhite += m.white;
        totalDraws += m.draws;
        totalBlack += m.black;
      }

      const topGames = getPersonalTopGames(userId, normalizedFen, color);

      return reply.code(200).send({
        opening: getOpeningInfo(normalizedFen),
        white: totalWhite,
        draws: totalDraws,
        black: totalBlack,
        moves,
        topGames,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // Engine Evaluation
  // ---------------------------------------------------------------------------

  interface EngineBody {
    fen: string;
    depth?: number;
  }

  const engineBodySchema = {
    type: "object" as const,
    required: ["fen"],
    additionalProperties: false,
    properties: {
      fen: { type: "string" as const, minLength: 1 },
      depth: { type: "integer" as const, minimum: 1, maximum: 25 },
    },
  };

  // POST /engine
  app.post<{ Body: EngineBody; Reply: ExplorerEngineResponse | ErrorResponse }>(
    "/engine",
    { schema: { body: engineBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        new Chess(request.body.fen);
      } catch {
        return reply.code(400).send({ error: "Invalid FEN" });
      }

      if (!app.hasDecorator("engine")) {
        return reply.code(503).send({ error: "Engine not available" });
      }

      const depth = request.body.depth ?? 20;
      const result = await app.engine.evaluate(request.body.fen, depth);

      return reply.code(200).send({
        score: result.score,
        lines: result.engineLines ?? [],
        depth: result.depth,
      });
    },
  );
}

export const explorerRoutesPlugin = fp(explorerRoutes, {
  name: "explorer-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
