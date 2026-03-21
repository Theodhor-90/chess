import { sqlite } from "../db/index.js";
import { createNewCard, type CardDbRow } from "./fsrs.js";

interface RepertoireMoveRow {
  id: number;
  repertoire_id: number;
  position_fen: string;
  move_san: string;
  move_uci: string;
  result_fen: string;
}

interface RepertoireRow {
  id: number;
  color: string;
}

interface ExistingCardRow {
  id: number;
  positionFen: string;
  moveSan: string;
}

/**
 * Full sync: reads all repertoire moves, determines which are "own side" moves,
 * creates missing cards, and deletes orphaned cards.
 *
 * "Own side" logic: if the repertoire color is 'white', cards are created for
 * positions where it is white's turn to move (FEN side-to-move = 'w').
 * If the repertoire color is 'black', cards are created for positions where
 * it is black's turn to move (FEN side-to-move = 'b').
 *
 * Idempotent: calling multiple times produces the same result.
 * Does NOT modify existing cards' scheduling state.
 */
export function syncCardsForRepertoire(repertoireId: number): void {
  // Fetch the repertoire to get its color
  const repertoire = sqlite
    .prepare("SELECT id, color FROM repertoires WHERE id = ?")
    .get(repertoireId) as RepertoireRow | undefined;

  if (!repertoire) return;

  const side = repertoire.color; // 'white' or 'black'
  const sideToMove = side === "white" ? "w" : "b";

  // Fetch all moves in the repertoire
  const allMoves = sqlite
    .prepare("SELECT * FROM repertoire_moves WHERE repertoire_id = ?")
    .all(repertoireId) as RepertoireMoveRow[];

  // Filter to own-side moves: moves from positions where it's our turn
  const ownSideMoves = allMoves.filter((m) => {
    const parts = m.position_fen.split(" ");
    return parts[1] === sideToMove;
  });

  // Build a set of expected cards as "positionFen|moveSan" keys
  const expectedKeys = new Set<string>();
  for (const move of ownSideMoves) {
    expectedKeys.add(`${move.position_fen}|${move.move_san}`);
  }

  // Fetch existing cards
  const existingCards = sqlite
    .prepare(
      "SELECT id, position_fen as positionFen, move_san as moveSan FROM repertoire_cards WHERE repertoire_id = ?",
    )
    .all(repertoireId) as ExistingCardRow[];

  const existingKeys = new Set<string>();
  const orphanedCardIds: number[] = [];
  for (const card of existingCards) {
    const key = `${card.positionFen}|${card.moveSan}`;
    existingKeys.add(key);
    if (!expectedKeys.has(key)) {
      orphanedCardIds.push(card.id);
    }
  }

  // Determine which cards need to be created
  const movesToCreate = ownSideMoves.filter(
    (m) => !existingKeys.has(`${m.position_fen}|${m.move_san}`),
  );

  // Execute in a transaction
  const syncTransaction = sqlite.transaction(() => {
    // Delete orphaned cards and their review logs
    if (orphanedCardIds.length > 0) {
      const deleteLogsStmt = sqlite.prepare("DELETE FROM review_logs WHERE card_id = ?");
      const deleteCardStmt = sqlite.prepare("DELETE FROM repertoire_cards WHERE id = ?");
      for (const cardId of orphanedCardIds) {
        deleteLogsStmt.run(cardId);
        deleteCardStmt.run(cardId);
      }
    }

    // Create missing cards
    if (movesToCreate.length > 0) {
      const insertStmt = sqlite.prepare(`
        INSERT INTO repertoire_cards
          (repertoire_id, position_fen, move_san, move_uci, result_fen, side, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const move of movesToCreate) {
        const card: CardDbRow = createNewCard();
        insertStmt.run(
          repertoireId,
          move.position_fen,
          move.move_san,
          move.move_uci,
          move.result_fen,
          side,
          card.due,
          card.stability,
          card.difficulty,
          card.elapsedDays,
          card.scheduledDays,
          card.learningSteps,
          card.reps,
          card.lapses,
          card.state,
          card.lastReview,
        );
      }
    }
  });

  syncTransaction();
}

/**
 * Create a single card for a specific repertoire move.
 * Used when a single move is added to a repertoire.
 * No-ops if the card already exists (due to unique constraint).
 */
export function createCardForMove(
  repertoireId: number,
  move: { positionFen: string; moveSan: string; moveUci: string; resultFen: string },
  side: "white" | "black",
): void {
  const card: CardDbRow = createNewCard();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO repertoire_cards
        (repertoire_id, position_fen, move_san, move_uci, result_fen, side, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      repertoireId,
      move.positionFen,
      move.moveSan,
      move.moveUci,
      move.resultFen,
      side,
      card.due,
      card.stability,
      card.difficulty,
      card.elapsedDays,
      card.scheduledDays,
      card.learningSteps,
      card.reps,
      card.lapses,
      card.state,
      card.lastReview,
    );
}

/**
 * Delete a card and its review logs for a specific move in a repertoire.
 * Used when a move is deleted from a repertoire.
 */
export function deleteCardsForMove(
  repertoireId: number,
  positionFen: string,
  moveSan: string,
): void {
  const deleteTransaction = sqlite.transaction(() => {
    // Find the card first
    const card = sqlite
      .prepare(
        "SELECT id FROM repertoire_cards WHERE repertoire_id = ? AND position_fen = ? AND move_san = ?",
      )
      .get(repertoireId, positionFen, moveSan) as { id: number } | undefined;

    if (card) {
      sqlite.prepare("DELETE FROM review_logs WHERE card_id = ?").run(card.id);
      sqlite.prepare("DELETE FROM repertoire_cards WHERE id = ?").run(card.id);
    }
  });
  deleteTransaction();
}

/**
 * Delete all cards and review logs for an entire repertoire.
 * Used when a repertoire is deleted.
 */
export function deleteAllCardsForRepertoire(repertoireId: number): void {
  const deleteTransaction = sqlite.transaction(() => {
    // Delete review logs for all cards in this repertoire
    sqlite
      .prepare(
        "DELETE FROM review_logs WHERE card_id IN (SELECT id FROM repertoire_cards WHERE repertoire_id = ?)",
      )
      .run(repertoireId);
    // Delete all cards
    sqlite.prepare("DELETE FROM repertoire_cards WHERE repertoire_id = ?").run(repertoireId);
  });
  deleteTransaction();
}
