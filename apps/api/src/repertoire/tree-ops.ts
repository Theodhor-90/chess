import { sqlite } from "../db/index.js";

/**
 * Reconstruct a full 6-part FEN from a normalized 4-part FEN.
 * Normalized FENs have: pieces, side, castling, enPassant.
 * Appends " 0 1" (halfmove clock = 0, fullmove = 1) to make it valid for chess.js.
 *
 * Trade-off: the halfmove clock and fullmove number are arbitrary (0 and 1),
 * but these fields do not affect move legality in chess.js, so this is safe
 * for move validation purposes.
 */
export function reconstructFullFen(normalizedFen: string): string {
  return `${normalizedFen} 0 1`;
}

interface MoveRow {
  result_fen: string;
}

/**
 * BFS through repertoire_moves to collect all FENs reachable from startFen.
 * Used for cascade delete — finds all descendants of a deleted move.
 * Returns an array of FENs (not including startFen's parent position).
 * Cap at 1000 iterations to prevent infinite loops on corrupted data.
 */
export function getDescendantFens(repertoireId: number, startFen: string): string[] {
  const stmt = sqlite.prepare(
    "SELECT result_fen FROM repertoire_moves WHERE repertoire_id = ? AND position_fen = ?",
  );

  const visited = new Set<string>();
  const queue: string[] = [startFen];
  const result: string[] = [];
  let iterations = 0;

  while (queue.length > 0 && iterations < 1000) {
    const currentFen = queue.shift()!;
    iterations++;

    if (visited.has(currentFen)) continue;
    visited.add(currentFen);

    const rows = stmt.all(repertoireId, currentFen) as MoveRow[];
    for (const row of rows) {
      result.push(row.result_fen);
      if (!visited.has(row.result_fen)) {
        queue.push(row.result_fen);
      }
    }
  }

  return result;
}
