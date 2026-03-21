import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { Chess } from "chess.js";
import { loadOpenings, classifyPosition, normalizeFen } from "@chess/shared";
import type {
  RepertoireListItem,
  RepertoireTree,
  RepertoireNode,
  CreateRepertoireResponse,
  AddRepertoireMoveResponse,
  DeleteRepertoireMoveResponse,
  RepertoireImportResponse,
  RepertoireExportResponse,
  ErrorResponse,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { sqlite } from "../db/index.js";
import { reconstructFullFen, getDescendantFens } from "./tree-ops.js";
import { parsePgnToMoves, treeToMoves } from "./pgn-utils.js";
import {
  createCardForMove,
  deleteCardsForMove,
  deleteAllCardsForRepertoire,
  syncCardsForRepertoire,
} from "../training/card-sync.js";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

interface RepertoireRow {
  id: number;
  user_id: number;
  name: string;
  color: string;
  description: string | null;
  created_at: number;
  updated_at: number;
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

interface MoveCountRow {
  repertoire_id: number;
  move_count: number;
}

const createBodySchema = {
  type: "object" as const,
  required: ["name", "color"],
  additionalProperties: false,
  properties: {
    name: { type: "string" as const, minLength: 1, maxLength: 100 },
    color: { type: "string" as const, enum: ["white", "black"] },
    description: { type: "string" as const, maxLength: 500 },
  },
};

const updateBodySchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    name: { type: "string" as const, minLength: 1, maxLength: 100 },
    description: { type: "string" as const, maxLength: 500 },
  },
};

const idParamsSchema = {
  type: "object" as const,
  required: ["id"],
  properties: {
    id: { type: "string" as const, pattern: "^\\d+$" },
  },
};

const moveIdParamsSchema = {
  type: "object" as const,
  required: ["id", "moveId"],
  properties: {
    id: { type: "string" as const, pattern: "^\\d+$" },
    moveId: { type: "string" as const, pattern: "^\\d+$" },
  },
};

const addMoveBodySchema = {
  type: "object" as const,
  required: ["positionFen", "moveSan"],
  additionalProperties: false,
  properties: {
    positionFen: { type: "string" as const, minLength: 1 },
    moveSan: { type: "string" as const, minLength: 1, maxLength: 10 },
    isMainLine: { type: "boolean" as const },
    comment: { type: "string" as const, maxLength: 1000 },
  },
};

const updateMoveBodySchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    isMainLine: { type: "boolean" as const },
    comment: { type: "string" as const, maxLength: 1000 },
    sortOrder: { type: "integer" as const, minimum: 0 },
  },
};

interface IdParams {
  id: string;
}

interface CreateBody {
  name: string;
  color: "white" | "black";
  description?: string;
}

interface UpdateBody {
  name?: string;
  description?: string;
}

interface MoveIdParams {
  id: string;
  moveId: string;
}

interface AddMoveBody {
  positionFen: string;
  moveSan: string;
  isMainLine?: boolean;
  comment?: string;
}

interface UpdateMoveBody {
  isMainLine?: boolean;
  comment?: string;
  sortOrder?: number;
}

const importBodySchema = {
  type: "object" as const,
  required: ["pgn"],
  additionalProperties: false,
  properties: {
    pgn: { type: "string" as const, minLength: 1, maxLength: 100000 },
  },
};

interface ImportBody {
  pgn: string;
}

async function repertoireRoutes(app: FastifyInstance) {
  const openingsMap = loadOpenings();

  // Prepared statements
  const insertRepertoireStmt = sqlite.prepare(
    "INSERT INTO repertoires (user_id, name, color, description) VALUES (?, ?, ?, ?)",
  );
  const getRepertoireByIdStmt = sqlite.prepare("SELECT * FROM repertoires WHERE id = ?");
  const listRepertoiresByUserStmt = sqlite.prepare(
    "SELECT * FROM repertoires WHERE user_id = ? ORDER BY updated_at DESC",
  );
  const moveCountsByUserStmt = sqlite.prepare(
    "SELECT rm.repertoire_id, COUNT(*) as move_count FROM repertoire_moves rm JOIN repertoires r ON r.id = rm.repertoire_id WHERE r.user_id = ? GROUP BY rm.repertoire_id",
  );
  const getRepertoireMovesStmt = sqlite.prepare(
    "SELECT * FROM repertoire_moves WHERE repertoire_id = ? ORDER BY sort_order ASC, is_main_line DESC",
  );
  const updateRepertoireStmt = sqlite.prepare(
    "UPDATE repertoires SET name = ?, description = ?, updated_at = unixepoch() WHERE id = ?",
  );
  const deleteRepertoireMovesStmt = sqlite.prepare(
    "DELETE FROM repertoire_moves WHERE repertoire_id = ?",
  );
  const deleteRepertoireStmt = sqlite.prepare("DELETE FROM repertoires WHERE id = ?");
  const getMoveByIdStmt = sqlite.prepare(
    "SELECT * FROM repertoire_moves WHERE id = ? AND repertoire_id = ?",
  );
  const deleteMoveByIdStmt = sqlite.prepare("DELETE FROM repertoire_moves WHERE id = ?");
  const deleteMovesByPositionStmt = sqlite.prepare(
    "DELETE FROM repertoire_moves WHERE repertoire_id = ? AND position_fen = ?",
  );
  const updateRepertoireTimestampStmt = sqlite.prepare(
    "UPDATE repertoires SET updated_at = unixepoch() WHERE id = ?",
  );
  const unsetSiblingsMainLineStmt = sqlite.prepare(
    "UPDATE repertoire_moves SET is_main_line = 0 WHERE repertoire_id = ? AND position_fen = ? AND id != ?",
  );

  function buildTree(moves: RepertoireMoveRow[]): RepertoireNode {
    // Build an adjacency map: positionFen -> array of moves from that position
    const adjacencyMap = new Map<string, RepertoireMoveRow[]>();
    for (const move of moves) {
      const existing = adjacencyMap.get(move.position_fen);
      if (existing) {
        existing.push(move);
      } else {
        adjacencyMap.set(move.position_fen, [move]);
      }
    }

    // Sort children at each position: by sortOrder ascending, then isMainLine descending (main line first)
    for (const [_fen, fenMoves] of adjacencyMap) {
      fenMoves.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return b.is_main_line - a.is_main_line; // main line (1) before sideline (0)
      });
    }

    // Recursive tree builder with cycle detection
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

  app.post<{ Body: CreateBody; Reply: CreateRepertoireResponse | ErrorResponse }>(
    "/",
    { schema: { body: createBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const { name, color, description } = request.body;

      const result = insertRepertoireStmt.run(userId, name, color, description ?? null);
      const id = Number(result.lastInsertRowid);

      const row = getRepertoireByIdStmt.get(id) as RepertoireRow;

      return reply.code(201).send({
        id: row.id,
        name: row.name,
        color: row.color as "white" | "black",
        description: row.description,
        createdAt: row.created_at,
      });
    },
  );

  app.get<{ Reply: RepertoireListItem[] | ErrorResponse }>(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;

      const repertoires = listRepertoiresByUserStmt.all(userId) as RepertoireRow[];
      const moveCounts = moveCountsByUserStmt.all(userId) as MoveCountRow[];

      const moveCountMap = new Map<number, number>();
      for (const mc of moveCounts) {
        moveCountMap.set(mc.repertoire_id, mc.move_count);
      }

      const items: RepertoireListItem[] = repertoires.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color as "white" | "black",
        description: r.description,
        moveCount: moveCountMap.get(r.id) ?? 0,
        updatedAt: r.updated_at,
      }));

      return reply.code(200).send(items);
    },
  );

  app.get<{ Params: IdParams; Reply: RepertoireTree | ErrorResponse }>(
    "/:id",
    { schema: { params: idParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const moves = getRepertoireMovesStmt.all(repertoireId) as RepertoireMoveRow[];
      const tree = buildTree(moves);

      return reply.code(200).send({
        id: row.id,
        name: row.name,
        color: row.color as "white" | "black",
        description: row.description,
        tree,
      });
    },
  );

  app.put<{ Params: IdParams; Body: UpdateBody; Reply: { success: true } | ErrorResponse }>(
    "/:id",
    { schema: { params: idParamsSchema, body: updateBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const name = request.body.name ?? row.name;
      const description =
        request.body.description !== undefined ? request.body.description : row.description;

      updateRepertoireStmt.run(name, description, repertoireId);

      return reply.code(200).send({ success: true });
    },
  );

  app.delete<{ Params: IdParams; Reply: { success: true } | ErrorResponse }>(
    "/:id",
    { schema: { params: idParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const deleteTransaction = sqlite.transaction(() => {
        deleteAllCardsForRepertoire(repertoireId);
        deleteRepertoireMovesStmt.run(repertoireId);
        deleteRepertoireStmt.run(repertoireId);
      });
      deleteTransaction();

      return reply.code(200).send({ success: true });
    },
  );

  app.post<{
    Params: IdParams;
    Body: AddMoveBody;
    Reply: AddRepertoireMoveResponse | ErrorResponse;
  }>(
    "/:id/moves",
    { schema: { params: idParamsSchema, body: addMoveBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const { positionFen, moveSan, isMainLine, comment } = request.body;

      // Reconstruct full FEN for chess.js
      const fullFen = reconstructFullFen(positionFen);

      // Validate the move
      let chess: InstanceType<typeof Chess>;
      try {
        chess = new Chess(fullFen);
      } catch {
        return reply.code(400).send({ error: "Invalid position FEN" });
      }

      let moveResult;
      try {
        moveResult = chess.move(moveSan);
      } catch {
        return reply.code(400).send({ error: "Invalid move" });
      }

      // Compute UCI from the move result
      const moveUci = moveResult.from + moveResult.to + (moveResult.promotion ?? "");

      // Compute normalized result FEN
      const resultFen = normalizeFen(chess.fen());

      // Determine isMainLine and sortOrder
      const isMainLineValue = isMainLine !== undefined ? (isMainLine ? 1 : 0) : 1;
      const commentValue = comment ?? null;

      // Upsert: INSERT or UPDATE on conflict
      const upsertStmt = sqlite.prepare(`
        INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen, is_main_line, comment, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT (repertoire_id, position_fen, move_san)
        DO UPDATE SET is_main_line = excluded.is_main_line, comment = excluded.comment
      `);
      upsertStmt.run(
        repertoireId,
        positionFen,
        moveSan,
        moveUci,
        resultFen,
        isMainLineValue,
        commentValue,
      );

      // Fetch the inserted/updated row
      const insertedRow = sqlite
        .prepare(
          "SELECT * FROM repertoire_moves WHERE repertoire_id = ? AND position_fen = ? AND move_san = ?",
        )
        .get(repertoireId, positionFen, moveSan) as RepertoireMoveRow;

      // Update repertoire timestamp
      updateRepertoireTimestampStmt.run(repertoireId);

      // Create SRS card if this is an own-side move
      const sideToMove = positionFen.split(" ")[1];
      const repColor = row.color;
      if (
        (repColor === "white" && sideToMove === "w") ||
        (repColor === "black" && sideToMove === "b")
      ) {
        createCardForMove(
          repertoireId,
          {
            positionFen,
            moveSan,
            moveUci,
            resultFen,
          },
          repColor as "white" | "black",
        );
      }

      return reply.code(201).send({
        id: insertedRow.id,
        positionFen: insertedRow.position_fen,
        moveSan: insertedRow.move_san,
        moveUci: insertedRow.move_uci,
        resultFen: insertedRow.result_fen,
        isMainLine: insertedRow.is_main_line === 1,
        comment: insertedRow.comment,
      });
    },
  );

  app.delete<{ Params: MoveIdParams; Reply: DeleteRepertoireMoveResponse | ErrorResponse }>(
    "/:id/moves/:moveId",
    { schema: { params: moveIdParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);
      const moveId = parseInt(request.params.moveId, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const moveRow = getMoveByIdStmt.get(moveId, repertoireId) as RepertoireMoveRow | undefined;
      if (!moveRow) {
        return reply.code(404).send({ error: "Move not found" });
      }

      // Collect all descendant FENs from the result position of this move
      const descendantFens = getDescendantFens(repertoireId, moveRow.result_fen);

      // Collect all position/move pairs that will be deleted, for SRS card cleanup
      const cardDeletePairs: Array<{ positionFen: string; moveSan: string }> = [
        { positionFen: moveRow.position_fen, moveSan: moveRow.move_san },
      ];
      // Direct children at result_fen
      const childMoves = sqlite
        .prepare(
          "SELECT position_fen, move_san FROM repertoire_moves WHERE repertoire_id = ? AND position_fen = ?",
        )
        .all(repertoireId, moveRow.result_fen) as { position_fen: string; move_san: string }[];
      for (const cm of childMoves) {
        cardDeletePairs.push({ positionFen: cm.position_fen, moveSan: cm.move_san });
      }
      // Descendants
      for (const fen of descendantFens) {
        const descMoves = sqlite
          .prepare(
            "SELECT position_fen, move_san FROM repertoire_moves WHERE repertoire_id = ? AND position_fen = ?",
          )
          .all(repertoireId, fen) as { position_fen: string; move_san: string }[];
        for (const dm of descMoves) {
          cardDeletePairs.push({ positionFen: dm.position_fen, moveSan: dm.move_san });
        }
      }

      // Delete in a transaction and count total deleted
      const deleteTransaction = sqlite.transaction(() => {
        let totalDeleted = 0;

        // Delete the target move itself
        const info = deleteMoveByIdStmt.run(moveId);
        totalDeleted += info.changes;

        // Delete direct children (moves whose position_fen equals the deleted move's result_fen)
        const startInfo = deleteMovesByPositionStmt.run(repertoireId, moveRow.result_fen);
        totalDeleted += startInfo.changes;

        // Delete all moves at descendant positions
        for (const fen of descendantFens) {
          const delInfo = deleteMovesByPositionStmt.run(repertoireId, fen);
          totalDeleted += delInfo.changes;
        }

        return totalDeleted;
      });
      const deleted = deleteTransaction();

      // Clean up SRS cards for deleted moves
      for (const pair of cardDeletePairs) {
        deleteCardsForMove(repertoireId, pair.positionFen, pair.moveSan);
      }

      // Update repertoire timestamp
      updateRepertoireTimestampStmt.run(repertoireId);

      return reply.code(200).send({ deleted });
    },
  );

  app.put<{
    Params: MoveIdParams;
    Body: UpdateMoveBody;
    Reply: AddRepertoireMoveResponse | ErrorResponse;
  }>(
    "/:id/moves/:moveId",
    {
      schema: { params: moveIdParamsSchema, body: updateMoveBodySchema },
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);
      const moveId = parseInt(request.params.moveId, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const moveRow = getMoveByIdStmt.get(moveId, repertoireId) as RepertoireMoveRow | undefined;
      if (!moveRow) {
        return reply.code(404).send({ error: "Move not found" });
      }

      const { isMainLine, comment, sortOrder } = request.body;

      // Build partial update
      const newIsMainLine = isMainLine !== undefined ? (isMainLine ? 1 : 0) : moveRow.is_main_line;
      const newComment = comment !== undefined ? comment : moveRow.comment;
      const newSortOrder = sortOrder !== undefined ? sortOrder : moveRow.sort_order;

      const updateMoveTransaction = sqlite.transaction(() => {
        // If setting isMainLine = true, unset all siblings at the same position
        if (isMainLine === true) {
          unsetSiblingsMainLineStmt.run(repertoireId, moveRow.position_fen, moveId);
        }

        sqlite
          .prepare(
            "UPDATE repertoire_moves SET is_main_line = ?, comment = ?, sort_order = ? WHERE id = ?",
          )
          .run(newIsMainLine, newComment, newSortOrder, moveId);
      });
      updateMoveTransaction();

      // Update repertoire timestamp
      updateRepertoireTimestampStmt.run(repertoireId);

      // Fetch and return the updated move
      const updated = getMoveByIdStmt.get(moveId, repertoireId) as RepertoireMoveRow;

      return reply.code(200).send({
        id: updated.id,
        positionFen: updated.position_fen,
        moveSan: updated.move_san,
        moveUci: updated.move_uci,
        resultFen: updated.result_fen,
        isMainLine: updated.is_main_line === 1,
        comment: updated.comment,
      });
    },
  );

  app.post<{ Params: IdParams; Body: ImportBody; Reply: RepertoireImportResponse | ErrorResponse }>(
    "/:id/import",
    { schema: { params: idParamsSchema, body: importBodySchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const { pgn } = request.body;

      let parsedMoves;
      try {
        parsedMoves = parsePgnToMoves(pgn);
      } catch {
        return reply.code(400).send({ error: "Invalid PGN" });
      }

      if (parsedMoves.length === 0) {
        return reply.code(400).send({ error: "Invalid PGN" });
      }

      // Upsert all moves in a transaction
      const upsertStmt = sqlite.prepare(`
        INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen, is_main_line, comment, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT (repertoire_id, position_fen, move_san)
        DO UPDATE SET is_main_line = excluded.is_main_line, comment = COALESCE(excluded.comment, repertoire_moves.comment)
      `);

      const importTransaction = sqlite.transaction(() => {
        let imported = 0;
        for (const move of parsedMoves) {
          const info = upsertStmt.run(
            repertoireId,
            move.positionFen,
            move.moveSan,
            move.moveUci,
            move.resultFen,
            move.isMainLine ? 1 : 0,
            move.comment,
          );
          imported += info.changes;
        }
        return imported;
      });

      const imported = importTransaction();

      // Sync SRS cards after bulk import
      syncCardsForRepertoire(repertoireId);

      // Update repertoire timestamp
      updateRepertoireTimestampStmt.run(repertoireId);

      return reply.code(200).send({ imported });
    },
  );

  app.get<{ Params: IdParams; Reply: RepertoireExportResponse | ErrorResponse }>(
    "/:id/export",
    { schema: { params: idParamsSchema }, preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const repertoireId = parseInt(request.params.id, 10);

      const row = verifyOwnership(repertoireId, userId);
      if (!row) {
        return reply.code(404).send({ error: "Repertoire not found" });
      }

      const moves = getRepertoireMovesStmt.all(repertoireId) as RepertoireMoveRow[];
      const tree = buildTree(moves);

      // Build PGN headers
      const headers = [
        `[Event "Repertoire: ${row.name}"]`,
        `[Site ""]`,
        `[Date ""]`,
        `[Result "*"]`,
      ];

      // Serialize tree to PGN move text
      const moveText = treeToMoves(tree);

      const pgn = headers.join("\n") + "\n\n" + moveText + (moveText ? " *" : "*");

      return reply.code(200).send({ pgn });
    },
  );
}

export const repertoireRoutesPlugin = fp(repertoireRoutes, {
  name: "repertoire-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
