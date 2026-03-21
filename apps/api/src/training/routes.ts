import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadOpenings, classifyPosition } from "@chess/shared";
import type {
  RepertoireCard,
  TrainingNextResponse,
  TrainingReviewRequest,
  TrainingReviewResponse,
  TrainingStatsResponse,
  ErrorResponse,
  RepertoireNode,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { sqlite } from "../db/index.js";
import { selectTrainingLine, countDueCards } from "./line-selection.js";
import { reviewCard, type CardDbRow } from "./fsrs.js";
import { getTrainingStats } from "./stats.js";
import type { Grade } from "ts-fsrs";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

interface RepertoireRow {
  id: number;
  user_id: number;
  name: string;
  color: string;
}

interface RepertoireMoveRow {
  id: number;
  repertoire_id: number;
  position_fen: string;
  move_san: string;
  move_uci: string;
  result_fen: string;
  is_main_line: number;
  comment: string | null;
  sort_order: number;
}

interface CardRow {
  id: number;
  repertoire_id: number;
  position_fen: string;
  move_san: string;
  move_uci: string;
  result_fen: string;
  side: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
}

interface IdParams {
  id: string;
}

const idParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "string" as const, pattern: "^\\d+$" },
  },
};

const reviewBodySchema = {
  type: "object" as const,
  required: ["cardId", "rating"],
  additionalProperties: false,
  properties: {
    cardId: { type: "integer" as const, minimum: 1 },
    rating: { type: "integer" as const, minimum: 1, maximum: 4 },
  },
};

async function trainingRoutes(app: FastifyInstance) {
  const openingsMap = loadOpenings();

  const getRepertoireByIdStmt = sqlite.prepare("SELECT * FROM repertoires WHERE id = ?");
  const getRepertoireMovesStmt = sqlite.prepare(
    "SELECT * FROM repertoire_moves WHERE repertoire_id = ? ORDER BY sort_order ASC, is_main_line DESC",
  );
  const getCardByIdStmt = sqlite.prepare("SELECT * FROM repertoire_cards WHERE id = ?");
  const updateCardStmt = sqlite.prepare(`
    UPDATE repertoire_cards
    SET due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
        learning_steps = ?, reps = ?, lapses = ?, state = ?, last_review = ?
    WHERE id = ?
  `);
  const insertReviewLogStmt = sqlite.prepare(`
    INSERT INTO review_logs (card_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function buildTree(moves: RepertoireMoveRow[]): RepertoireNode {
    const adjacencyMap = new Map<string, RepertoireMoveRow[]>();
    for (const move of moves) {
      const existing = adjacencyMap.get(move.position_fen);
      if (existing) {
        existing.push(move);
      } else {
        adjacencyMap.set(move.position_fen, [move]);
      }
    }

    for (const [_fen, fenMoves] of adjacencyMap) {
      fenMoves.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return b.is_main_line - a.is_main_line;
      });
    }

    function buildNode(
      id: number | null,
      fen: string,
      san: string | null,
      uci: string | null,
      isMainLine: boolean,
      comment: string | null,
      visited: Set<string>,
    ): RepertoireNode {
      const children: RepertoireNode[] = [];
      if (!visited.has(fen)) {
        visited.add(fen);
        const childMoves = adjacencyMap.get(fen) ?? [];
        for (const child of childMoves) {
          children.push(
            buildNode(
              child.id,
              child.result_fen,
              child.move_san,
              child.move_uci,
              child.is_main_line === 1,
              child.comment,
              visited,
            ),
          );
        }
        visited.delete(fen);
      }
      return {
        id,
        fen,
        san,
        uci,
        isMainLine,
        comment,
        opening: classifyPosition(fen, openingsMap),
        children,
      };
    }

    return buildNode(null, STARTING_FEN, null, null, true, null, new Set());
  }

  function verifyOwnership(repertoireId: number, userId: number): RepertoireRow | null {
    const row = getRepertoireByIdStmt.get(repertoireId) as RepertoireRow | undefined;
    if (!row) return null;
    if (row.user_id !== userId) return null;
    return row;
  }

  // GET /api/repertoires/:id/train/next
  app.get<{ Params: IdParams; Reply: TrainingNextResponse | ErrorResponse }>(
    "/:id/train/next",
    { schema: { params: idParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const nowUnix = Math.floor(Date.now() / 1000);

      // Build the repertoire tree
      const moves = getRepertoireMovesStmt.all(repertoireId) as RepertoireMoveRow[];
      const tree = buildTree(moves);

      // Select the best training line
      const line = selectTrainingLine(repertoireId, tree, nowUnix);

      // Count due and new cards
      const { dueCount, newCount } = countDueCards(repertoireId, nowUnix);

      return reply.code(200).send({ line, dueCount, newCount });
    },
  );

  // POST /api/repertoires/:id/train/review
  app.post<{
    Params: IdParams;
    Body: TrainingReviewRequest;
    Reply: TrainingReviewResponse | ErrorResponse;
  }>(
    "/:id/train/review",
    { schema: { params: idParamsSchema, body: reviewBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const { cardId, rating } = request.body;

      // Fetch the card
      const cardRow = getCardByIdStmt.get(cardId) as CardRow | undefined;
      if (!cardRow) {
        return reply.code(404).send({ error: "Card not found" });
      }

      // Verify the card belongs to this repertoire
      if (cardRow.repertoire_id !== repertoireId) {
        return reply.code(403).send({ error: "Card does not belong to this repertoire" });
      }

      // Convert DB row to CardDbRow for the FSRS module
      const dbRow: CardDbRow = {
        due: cardRow.due,
        stability: cardRow.stability,
        difficulty: cardRow.difficulty,
        elapsedDays: cardRow.elapsed_days,
        scheduledDays: cardRow.scheduled_days,
        learningSteps: cardRow.learning_steps,
        reps: cardRow.reps,
        lapses: cardRow.lapses,
        state: cardRow.state,
        lastReview: cardRow.last_review,
      };

      // Run FSRS scheduling
      const result = reviewCard(dbRow, rating as Grade);

      // Update card and insert review log atomically
      const reviewTransaction = sqlite.transaction(() => {
        updateCardStmt.run(
          result.card.due,
          result.card.stability,
          result.card.difficulty,
          result.card.elapsedDays,
          result.card.scheduledDays,
          result.card.learningSteps,
          result.card.reps,
          result.card.lapses,
          result.card.state,
          result.card.lastReview,
          cardId,
        );

        insertReviewLogStmt.run(
          cardId,
          result.log.rating,
          result.log.state,
          result.log.due,
          result.log.stability,
          result.log.difficulty,
          result.log.elapsedDays,
          result.log.scheduledDays,
          result.log.reviewedAt,
        );
      });
      reviewTransaction();

      // Build the response card object
      const updatedCard: RepertoireCard = {
        id: cardRow.id,
        repertoireId: cardRow.repertoire_id,
        positionFen: cardRow.position_fen,
        moveSan: cardRow.move_san,
        moveUci: cardRow.move_uci,
        resultFen: cardRow.result_fen,
        side: cardRow.side as "white" | "black",
        due: result.card.due,
        stability: result.card.stability,
        difficulty: result.card.difficulty,
        elapsedDays: result.card.elapsedDays,
        scheduledDays: result.card.scheduledDays,
        learningSteps: result.card.learningSteps,
        reps: result.card.reps,
        lapses: result.card.lapses,
        state: result.card.state,
        lastReview: result.card.lastReview,
      };

      return reply.code(200).send({
        card: updatedCard,
        nextDue: result.card.due,
        interval: result.card.scheduledDays,
      });
    },
  );

  // GET /api/repertoires/:id/train/stats
  app.get<{ Params: IdParams; Reply: TrainingStatsResponse | ErrorResponse }>(
    "/:id/train/stats",
    { schema: { params: idParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const stats = getTrainingStats(repertoireId);

      return reply.code(200).send(stats);
    },
  );
}

export const trainingRoutesPlugin = fp(trainingRoutes, {
  name: "training-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
