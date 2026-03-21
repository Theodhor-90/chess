import { Chess } from "chess.js";
import { normalizeFen } from "@chess/shared";
import { db, sqlite } from "../db/index.js";
import { games, users } from "../db/schema.js";
import { eq } from "drizzle-orm";

let _upsertStmt: ReturnType<typeof sqlite.prepare> | null = null;

function getUpsertStmt(): ReturnType<typeof sqlite.prepare> {
  if (!_upsertStmt) {
    _upsertStmt = sqlite.prepare(`
      INSERT INTO opening_player_stats (user_id, position_fen, move_san, move_uci, result_fen, color, white, draws, black, total_games, avg_opponent_rating)
      VALUES (@userId, @positionFen, @moveSan, @moveUci, @resultFen, @color, @whiteVal, @drawsVal, @blackVal, 1, @opponentRating)
      ON CONFLICT(user_id, position_fen, move_san, color) DO UPDATE SET
        white = opening_player_stats.white + excluded.white,
        draws = opening_player_stats.draws + excluded.draws,
        black = opening_player_stats.black + excluded.black,
        total_games = opening_player_stats.total_games + 1,
        avg_opponent_rating = CAST(ROUND(
          (opening_player_stats.avg_opponent_rating * opening_player_stats.total_games + excluded.avg_opponent_rating)
          / (opening_player_stats.total_games + 1.0)
        ) AS INTEGER)
    `);
  }
  return _upsertStmt;
}

export function upsertPlayerMoveStats(
  userId: number,
  positionFen: string,
  moveSan: string,
  moveUci: string,
  resultFen: string,
  color: "white" | "black",
  result: "1-0" | "0-1" | "1/2-1/2",
  opponentRating: number,
): void {
  const whiteVal = result === "1-0" ? 1 : 0;
  const drawsVal = result === "1/2-1/2" ? 1 : 0;
  const blackVal = result === "0-1" ? 1 : 0;
  getUpsertStmt().run({
    userId,
    positionFen,
    moveSan,
    moveUci,
    resultFen,
    color,
    whiteVal,
    drawsVal,
    blackVal,
    opponentRating,
  });
}

function _aggregatePlayerGameCore(userId: number, gameId: number): void {
  const gameRow = db.select().from(games).where(eq(games.id, gameId)).get();
  if (!gameRow || !gameRow.pgn) return;

  const chess = new Chess();
  try {
    chess.loadPgn(gameRow.pgn);
  } catch {
    return;
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) return;

  let color: "white" | "black";
  if (gameRow.whitePlayerId === userId) {
    color = "white";
  } else if (gameRow.blackPlayerId === userId) {
    color = "black";
  } else {
    return;
  }

  let result: "1-0" | "0-1" | "1/2-1/2";
  if (gameRow.resultWinner === "white") {
    result = "1-0";
  } else if (gameRow.resultWinner === "black") {
    result = "0-1";
  } else {
    result = "1/2-1/2";
  }

  const opponentRating = 1500;
  const MAX_HALF_MOVES = 30;
  const replay = new Chess();

  for (let i = 0; i < history.length && i < MAX_HALF_MOVES; i++) {
    const beforeFen = normalizeFen(replay.fen());
    const move = history[i];
    const moveUci = move.from + move.to + (move.promotion ?? "");
    replay.move(move.san);
    const afterFen = normalizeFen(replay.fen());

    const isWhiteMove = i % 2 === 0;
    if ((isWhiteMove && color === "white") || (!isWhiteMove && color === "black")) {
      upsertPlayerMoveStats(
        userId,
        beforeFen,
        move.san,
        moveUci,
        afterFen,
        color,
        result,
        opponentRating,
      );
    }
  }
}

export function aggregatePlayerGame(userId: number, gameId: number): void {
  sqlite.transaction(() => {
    _aggregatePlayerGameCore(userId, gameId);
  })();
}

export async function backfillPlayerStats(userId: number): Promise<void> {
  const query = `
    SELECT id FROM games
    WHERE status IN ('checkmate', 'stalemate', 'resigned', 'draw', 'timeout')
      AND (white_player_id = ? OR black_player_id = ?)
    ORDER BY id ASC
  `;
  const gameIds = sqlite.prepare(query).all(userId, userId) as { id: number }[];

  const BATCH_SIZE = 50;
  for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
    const batch = gameIds.slice(i, i + BATCH_SIZE);
    sqlite.transaction(() => {
      for (const { id } of batch) {
        _aggregatePlayerGameCore(userId, id);
      }
    })();
  }

  db.update(users).set({ playerStatsIndexed: 1 }).where(eq(users.id, userId)).run();
}

export function aggregatePlayerGameIfIndexed(userId: number, gameId: number): void {
  const user = sqlite.prepare("SELECT player_stats_indexed FROM users WHERE id = ?").get(userId) as
    | { player_stats_indexed: number }
    | undefined;
  if (!user || user.player_stats_indexed !== 1) return;
  aggregatePlayerGame(userId, gameId);
}
