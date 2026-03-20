import { Chess } from "chess.js";
import { normalizeFen } from "@chess/shared";
import type { OpeningInfo } from "@chess/shared";
import type Database from "better-sqlite3";

export interface PositionMovePair {
  positionFen: string;
  moveSan: string;
  moveUci: string;
  resultFen: string;
}

export function aggregateMastersGame(
  pgn: string,
  _whiteElo: number,
  _blackElo: number,
  _result: string,
): PositionMovePair[] {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    return [];
  }

  const history = chess.history({ verbose: true });
  const pairs: PositionMovePair[] = [];

  const replay = new Chess();
  for (let i = 0; i < history.length && i < 60; i++) {
    const beforeFen = normalizeFen(replay.fen());
    const move = history[i];
    replay.move(move.san);
    const afterFen = normalizeFen(replay.fen());

    pairs.push({
      positionFen: beforeFen,
      moveSan: move.san,
      moveUci: move.from + move.to + (move.promotion ?? ""),
      resultFen: afterFen,
    });
  }

  return pairs;
}

export function upsertMastersPositionStats(
  db: Database.Database,
  positionFen: string,
  opening: OpeningInfo | null,
  result: string,
  avgElo: number,
): void {
  const whiteWin = result === "1-0" ? 1 : 0;
  const blackWin = result === "0-1" ? 1 : 0;
  const draw = result === "1/2-1/2" ? 1 : 0;

  db.prepare(
    `
    INSERT INTO opening_positions (position_fen, eco, opening_name, master_white, master_draws, master_black, master_total_games, master_avg_rating)
    VALUES (@positionFen, @eco, @openingName, @white, @draws, @black, @totalGames, @avgRating)
    ON CONFLICT(position_fen) DO UPDATE SET
      eco = COALESCE(opening_positions.eco, excluded.eco),
      opening_name = COALESCE(opening_positions.opening_name, excluded.opening_name),
      master_white = opening_positions.master_white + excluded.master_white,
      master_draws = opening_positions.master_draws + excluded.master_draws,
      master_black = opening_positions.master_black + excluded.master_black,
      master_total_games = opening_positions.master_total_games + excluded.master_total_games,
      master_avg_rating = CAST(
        ROUND(
          (opening_positions.master_avg_rating * opening_positions.master_total_games + excluded.master_avg_rating * excluded.master_total_games)
          * 1.0 / (opening_positions.master_total_games + excluded.master_total_games)
        ) AS INTEGER
      )
  `,
  ).run({
    positionFen,
    eco: opening?.eco ?? null,
    openingName: opening?.name ?? null,
    white: whiteWin,
    draws: draw,
    black: blackWin,
    totalGames: 1,
    avgRating: avgElo,
  });
}

export function upsertMastersMoveStats(
  db: Database.Database,
  positionFen: string,
  moveSan: string,
  moveUci: string,
  resultFen: string,
  result: string,
  avgElo: number,
): void {
  const whiteWin = result === "1-0" ? 1 : 0;
  const blackWin = result === "0-1" ? 1 : 0;
  const draw = result === "1/2-1/2" ? 1 : 0;

  db.prepare(
    `
    INSERT INTO opening_position_moves (position_fen, move_san, move_uci, result_fen, master_white, master_draws, master_black, master_total_games, master_avg_rating)
    VALUES (@positionFen, @moveSan, @moveUci, @resultFen, @white, @draws, @black, @totalGames, @avgRating)
    ON CONFLICT(position_fen, move_san) DO UPDATE SET
      master_white = opening_position_moves.master_white + excluded.master_white,
      master_draws = opening_position_moves.master_draws + excluded.master_draws,
      master_black = opening_position_moves.master_black + excluded.master_black,
      master_total_games = opening_position_moves.master_total_games + excluded.master_total_games,
      master_avg_rating = CAST(
        ROUND(
          (opening_position_moves.master_avg_rating * opening_position_moves.master_total_games + excluded.master_avg_rating * excluded.master_total_games)
          * 1.0 / (opening_position_moves.master_total_games + excluded.master_total_games)
        ) AS INTEGER
      )
  `,
  ).run({
    positionFen,
    moveSan,
    moveUci,
    resultFen,
    white: whiteWin,
    draws: draw,
    black: blackWin,
    totalGames: 1,
    avgRating: avgElo,
  });
}
