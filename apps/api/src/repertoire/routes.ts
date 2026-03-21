import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadOpenings, classifyPosition } from "@chess/shared";
import type {
  RepertoireListItem,
  RepertoireTree,
  RepertoireNode,
  CreateRepertoireResponse,
  ErrorResponse,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { sqlite } from "../db/index.js";

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
        fen,
        san,
        uci,
        isMainLine,
        comment,
        opening: classifyPosition(fen, openingsMap),
        children,
      };
    }

    return buildNode(STARTING_FEN, null, null, true, null, new Set());
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
        deleteRepertoireMovesStmt.run(repertoireId);
        deleteRepertoireStmt.run(repertoireId);
      });
      deleteTransaction();

      return reply.code(200).send({ success: true });
    },
  );
}

export const repertoireRoutesPlugin = fp(repertoireRoutes, {
  name: "repertoire-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
