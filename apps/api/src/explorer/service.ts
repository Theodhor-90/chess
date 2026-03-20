import { Chess } from "chess.js";
import {
  normalizeFen,
  classifyPosition,
  classifyGame,
  loadOpenings,
  getRatingBracket,
  getSpeedCategory,
} from "@chess/shared";
import type {
  OpeningInfo,
  RatingBracket,
  SpeedCategory,
  PositionMoveStats,
  ExplorerFilter,
} from "@chess/shared";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../db/index.js";
import { games } from "../db/schema.js";

// Lazy-loaded singleton for the openings map
let _openingsMap: Map<string, OpeningInfo> | null = null;
function getOpeningsMap(): Map<string, OpeningInfo> {
  if (!_openingsMap) {
    _openingsMap = loadOpenings();
  }
  return _openingsMap;
}

export function getSpeedFromClock(clockConfig: {
  initial: number;
  increment: number;
}): SpeedCategory {
  if (clockConfig.initial === 0) return "classical";
  return getSpeedCategory(clockConfig.initial);
}

export function getGameRatingBracket(whiteRating: number, blackRating: number): RatingBracket {
  const avg =
    whiteRating === 0 && blackRating === 0
      ? 1500
      : whiteRating === 0
        ? blackRating
        : blackRating === 0
          ? whiteRating
          : Math.round((whiteRating + blackRating) / 2);
  return getRatingBracket(avg);
}

export function tagGameOpening(gameId: number): void {
  const gameRow = db.select().from(games).where(eq(games.id, gameId)).get();
  if (!gameRow) return;

  const pgn = gameRow.pgn;
  if (!pgn || pgn.trim() === "") return;

  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return;
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) return;

  // Replay to collect FENs at each position
  const replay = new Chess();
  const fens: string[] = [replay.fen()]; // include starting position
  for (const move of history) {
    replay.move(move.san);
    fens.push(replay.fen());
  }

  const openingsMap = getOpeningsMap();
  const opening = classifyGame(fens, openingsMap);

  if (opening) {
    db.update(games)
      .set({ openingEco: opening.eco, openingName: opening.name })
      .where(eq(games.id, gameId))
      .run();
  }
}

export function aggregatePlatformGame(gameId: number): void {
  const gameRow = db.select().from(games).where(eq(games.id, gameId)).get();
  if (!gameRow) return;

  const pgn = gameRow.pgn;
  if (!pgn || pgn.trim() === "") return;

  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return;
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) return;

  // Determine result string from game status
  let result: string;
  if (gameRow.resultWinner === "white") {
    result = "1-0";
  } else if (gameRow.resultWinner === "black") {
    result = "0-1";
  } else {
    // stalemate, draw, etc.
    result = "1/2-1/2";
  }

  // Determine speed category
  const speed = getSpeedFromClock({
    initial: gameRow.clockInitialTime,
    increment: gameRow.clockIncrement,
  });

  // Determine rating bracket (platform games use default 1500 since there's no Elo system yet)
  const ratingBracket = getGameRatingBracket(1500, 1500);

  // Replay moves and upsert platform stats
  const replay = new Chess();
  const openingsMap = getOpeningsMap();
  const seenPositions = new Set<string>();

  const upsertPositionStmt = sqlite.prepare(`
    INSERT INTO opening_positions (position_fen, eco, opening_name, platform_stats)
    VALUES (@positionFen, @eco, @openingName, @platformStats)
    ON CONFLICT(position_fen) DO UPDATE SET
      eco = COALESCE(opening_positions.eco, excluded.eco),
      opening_name = COALESCE(opening_positions.opening_name, excluded.opening_name),
      platform_stats = @mergedPlatformStats
  `);

  const upsertMoveStmt = sqlite.prepare(`
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, platform_stats)
    VALUES (@positionFen, @moveSan, @moveUci, @resultFen, @platformStats)
    ON CONFLICT(position_fen, move_san) DO UPDATE SET
      platform_stats = @mergedPlatformStats
  `);

  sqlite.transaction(() => {
    for (let i = 0; i < history.length && i < 60; i++) {
      const beforeFen = normalizeFen(replay.fen());
      const move = history[i];
      replay.move(move.san);
      const afterFen = normalizeFen(replay.fen());
      const moveUci = move.from + move.to + (move.promotion ?? "");

      // Upsert position stats (only once per unique position per game)
      if (!seenPositions.has(beforeFen)) {
        seenPositions.add(beforeFen);
        const opening = classifyPosition(beforeFen, openingsMap);
        upsertPlatformPositionStats(
          upsertPositionStmt,
          beforeFen,
          opening,
          result,
          ratingBracket,
          speed,
        );
      }

      // Also index the result position of the last move
      if (i === history.length - 1 || i === 59) {
        if (!seenPositions.has(afterFen)) {
          seenPositions.add(afterFen);
          const opening = classifyPosition(afterFen, openingsMap);
          upsertPlatformPositionStats(
            upsertPositionStmt,
            afterFen,
            opening,
            result,
            ratingBracket,
            speed,
          );
        }
      }

      // Upsert move stats
      upsertPlatformMoveStats(
        upsertMoveStmt,
        beforeFen,
        move.san,
        moveUci,
        afterFen,
        result,
        ratingBracket,
        speed,
      );
    }
  })();
}

interface PlatformStatsMap {
  [ratingBracket: string]: {
    [speedCategory: string]: PositionMoveStats;
  };
}

function readExistingPlatformStats(
  positionFen: string,
  table: "opening_positions" | "opening_position_moves",
  moveSan?: string,
): PlatformStatsMap {
  let row: { platform_stats: string } | undefined;
  if (table === "opening_positions") {
    row = sqlite
      .prepare("SELECT platform_stats FROM opening_positions WHERE position_fen = ?")
      .get(positionFen) as { platform_stats: string } | undefined;
  } else {
    row = sqlite
      .prepare(
        "SELECT platform_stats FROM opening_position_moves WHERE position_fen = ? AND move_san = ?",
      )
      .get(positionFen, moveSan!) as { platform_stats: string } | undefined;
  }
  if (!row) return {};
  try {
    return JSON.parse(row.platform_stats) as PlatformStatsMap;
  } catch {
    return {};
  }
}

function mergePlatformStats(
  existing: PlatformStatsMap,
  result: string,
  ratingBracket: RatingBracket,
  speed: SpeedCategory,
): string {
  const stats = { ...existing };
  if (!stats[ratingBracket]) {
    stats[ratingBracket] = {};
  }
  if (!stats[ratingBracket][speed]) {
    stats[ratingBracket][speed] = { white: 0, draws: 0, black: 0, totalGames: 0, avgRating: 1500 };
  }

  const bucket = stats[ratingBracket][speed];
  if (result === "1-0") bucket.white += 1;
  else if (result === "0-1") bucket.black += 1;
  else bucket.draws += 1;
  bucket.totalGames += 1;
  // avgRating stays at 1500 for now since platform doesn't have Elo yet

  return JSON.stringify(stats);
}

function upsertPlatformPositionStats(
  stmt: Database.Statement,
  positionFen: string,
  opening: OpeningInfo | null,
  result: string,
  ratingBracket: RatingBracket,
  speed: SpeedCategory,
): void {
  const existing = readExistingPlatformStats(positionFen, "opening_positions");
  const mergedJson = mergePlatformStats(existing, result, ratingBracket, speed);
  const freshJson = mergePlatformStats({}, result, ratingBracket, speed);

  stmt.run({
    positionFen,
    eco: opening?.eco ?? null,
    openingName: opening?.name ?? null,
    platformStats: freshJson,
    mergedPlatformStats: mergedJson,
  });
}

function upsertPlatformMoveStats(
  stmt: Database.Statement,
  positionFen: string,
  moveSan: string,
  moveUci: string,
  resultFen: string,
  result: string,
  ratingBracket: RatingBracket,
  speed: SpeedCategory,
): void {
  const existing = readExistingPlatformStats(positionFen, "opening_position_moves", moveSan);
  const mergedJson = mergePlatformStats(existing, result, ratingBracket, speed);
  const freshJson = mergePlatformStats({}, result, ratingBracket, speed);

  stmt.run({
    positionFen,
    moveSan,
    moveUci,
    resultFen,
    platformStats: freshJson,
    mergedPlatformStats: mergedJson,
  });
}

export function getPlatformMoveStats(
  positionFen: string,
  moveSan: string,
  filters: ExplorerFilter,
): PositionMoveStats | null {
  const row = sqlite
    .prepare(
      "SELECT platform_stats FROM opening_position_moves WHERE position_fen = ? AND move_san = ?",
    )
    .get(positionFen, moveSan) as { platform_stats: string } | undefined;

  if (!row) return null;

  let statsMap: PlatformStatsMap;
  try {
    statsMap = JSON.parse(row.platform_stats) as PlatformStatsMap;
  } catch {
    return null;
  }

  // Aggregate across requested rating brackets and speed categories
  const ratings = filters.ratings ?? (Object.keys(statsMap) as RatingBracket[]);
  const speeds = filters.speeds ?? (["bullet", "blitz", "rapid", "classical"] as SpeedCategory[]);

  let white = 0;
  let draws = 0;
  let black = 0;
  let totalGames = 0;
  let ratingSum = 0;

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
