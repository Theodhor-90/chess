import type { Socket } from "socket.io";
import type { FastifyInstance } from "fastify";
import { Chess } from "chess.js";
import { eq, or, and, asc, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ServerSocketData,
  AnalyzedPosition,
  MoveClassification,
  SerializedAnalysisNode,
  EvaluationResult,
} from "@chess/shared";
import {
  ANALYSIS_DEPTH_THRESHOLDS,
  classifyMove,
  computeAccuracy,
  evalToAbsoluteCp,
} from "@chess/shared";
import type { TypedSocketServer } from "./index.js";
import { db } from "../db/index.js";
import { games, moves, gameAnalyses } from "../db/schema.js";

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  ServerSocketData
>;

const TERMINAL_STATUSES = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

const activeAnalyses = new Map<number, AbortController>();

function hasActiveGame(userId: number): boolean {
  const row = db
    .select({ id: games.id })
    .from(games)
    .where(
      and(
        or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
        inArray(games.status, ["active", "waiting"]),
      ),
    )
    .limit(1)
    .get();
  return row !== undefined;
}

function buildAnalyzedPosition(
  fens: string[],
  positions: (AnalyzedPosition | undefined)[],
  playedMoves: string[],
  index: number,
  evaluation: AnalyzedPosition["evaluation"],
): AnalyzedPosition {
  let classification: MoveClassification | null = null;
  let centipawnLoss: number | null = null;

  if (index > 0 && positions[index - 1]) {
    const prevEval = positions[index - 1]!.evaluation;
    const isWhiteMove = index % 2 === 1;
    classification = classifyMove(
      prevEval.score,
      evaluation.score,
      prevEval.bestLine[0] ?? "",
      playedMoves[index - 1],
      isWhiteMove,
    );
    const cpBefore = evalToAbsoluteCp(prevEval.score, isWhiteMove);
    const cpAfter = evalToAbsoluteCp(evaluation.score, !isWhiteMove);
    const loss = isWhiteMove ? cpBefore - cpAfter : cpAfter - cpBefore;
    centipawnLoss = Math.max(0, loss);
  }

  return { fen: fens[index], evaluation, classification, centipawnLoss };
}

function computeAccuracies(positions: (AnalyzedPosition | undefined)[]): {
  whiteAccuracy: number;
  blackAccuracy: number;
} {
  const whiteLosses: number[] = [];
  const blackLosses: number[] = [];
  for (let i = 1; i < positions.length; i++) {
    const pos = positions[i];
    if (!pos || pos.centipawnLoss === null) continue;
    if (i % 2 === 1) whiteLosses.push(pos.centipawnLoss);
    else blackLosses.push(pos.centipawnLoss);
  }
  return {
    whiteAccuracy: computeAccuracy(whiteLosses),
    blackAccuracy: computeAccuracy(blackLosses),
  };
}

function positionsToAnalysisTree(
  fens: string[],
  playedMoves: string[],
  positions: AnalyzedPosition[],
): SerializedAnalysisNode {
  const root: SerializedAnalysisNode = {
    fen: fens[0],
    san: null,
    evaluation: positions[0].evaluation,
    classification: null,
    children: [],
  };

  let current = root;
  for (let i = 0; i < playedMoves.length; i++) {
    const child: SerializedAnalysisNode = {
      fen: fens[i + 1],
      san: playedMoves[i],
      evaluation: positions[i + 1].evaluation,
      classification: positions[i + 1].classification,
      children: [],
    };
    current.children.push(child);
    current = child;
  }

  return root;
}

export function registerAnalysisHandlers(
  _io: TypedSocketServer,
  socket: TypedSocket,
  app: FastifyInstance,
): void {
  socket.on("startAnalysis", async (data) => {
    const userId = socket.data.userId;
    const gameId = data.gameId;

    if (!app.hasDecorator("engine")) {
      socket.emit("analysisError", { gameId, error: "Engine analysis is currently unavailable." });
      return;
    }

    if (activeAnalyses.has(gameId)) {
      socket.emit("analysisError", {
        gameId,
        error: "Analysis already in progress for this game.",
      });
      return;
    }

    const game = db.select().from(games).where(eq(games.id, gameId)).get();
    if (!game) {
      socket.emit("analysisError", { gameId, error: "Game not found" });
      return;
    }

    if (game.whitePlayerId !== userId && game.blackPlayerId !== userId) {
      socket.emit("analysisError", { gameId, error: "You are not a player in this game" });
      return;
    }

    if (!TERMINAL_STATUSES.includes(game.status)) {
      socket.emit("analysisError", { gameId, error: "Game is not completed" });
      return;
    }

    if (hasActiveGame(userId)) {
      socket.emit("analysisError", {
        gameId,
        error: "Cannot analyze while in an active game",
      });
      return;
    }

    const moveRows = db
      .select({ san: moves.san })
      .from(moves)
      .where(eq(moves.gameId, gameId))
      .orderBy(asc(moves.moveNumber))
      .all();

    const chess = new Chess();
    const fens: string[] = [chess.fen()];
    const playedMoves: string[] = [];

    for (const row of moveRows) {
      try {
        chess.move(row.san);
      } catch {
        socket.emit("analysisError", { gameId, error: "Failed to replay game moves" });
        return;
      }
      fens.push(chess.fen());
      playedMoves.push(row.san);
    }

    const abortController = new AbortController();
    activeAnalyses.set(gameId, abortController);

    const targetDepth = ANALYSIS_DEPTH_THRESHOLDS[ANALYSIS_DEPTH_THRESHOLDS.length - 1];
    const rawEvals: (EvaluationResult | undefined)[] = new Array(fens.length);
    let completedCount = 0;

    try {
      // Evaluate all positions in parallel through the engine pool
      const evalPromises = fens.map((fen, i) =>
        app.engine.evaluate(fen, targetDepth).then((result) => {
          if (abortController.signal.aborted) return;
          rawEvals[i] = result;
          completedCount++;
          socket.emit("analysisProgress", {
            gameId,
            positions: [],
            whiteAccuracy: 0,
            blackAccuracy: 0,
            completedPositions: completedCount,
            totalPositions: fens.length,
          });
        }),
      );

      await Promise.all(evalPromises);
      if (abortController.signal.aborted) return;

      // Build classified positions sequentially (instant, no engine needed)
      const finalPositions: AnalyzedPosition[] = [];
      for (let i = 0; i < fens.length; i++) {
        const evaluation = rawEvals[i]!;
        finalPositions.push(
          buildAnalyzedPosition(fens, finalPositions, playedMoves, i, evaluation),
        );
      }
      const { whiteAccuracy, blackAccuracy } = computeAccuracies(finalPositions);

      const analysisTree = JSON.stringify(
        positionsToAnalysisTree(fens, playedMoves, finalPositions),
      );

      db.insert(gameAnalyses)
        .values({
          gameId,
          analysisTree,
          whiteAccuracy,
          blackAccuracy,
          engineDepth: finalPositions[0]?.evaluation.depth ?? targetDepth,
        })
        .onConflictDoUpdate({
          target: gameAnalyses.gameId,
          set: {
            analysisTree,
            whiteAccuracy,
            blackAccuracy,
            engineDepth: finalPositions[0]?.evaluation.depth ?? targetDepth,
            createdAt: sql`(unixepoch())`,
          },
        })
        .run();

      socket.emit("analysisComplete", {
        gameId,
        positions: finalPositions,
        whiteAccuracy,
        blackAccuracy,
        completedPositions: fens.length,
        totalPositions: fens.length,
      });
    } catch (err) {
      if (!abortController.signal.aborted) {
        socket.emit("analysisError", {
          gameId,
          error: err instanceof Error ? err.message : "Analysis failed",
        });
      }
    } finally {
      activeAnalyses.delete(gameId);
    }
  });

  socket.on("cancelAnalysis", (data) => {
    const controller = activeAnalyses.get(data.gameId);
    if (controller) {
      controller.abort();
      activeAnalyses.delete(data.gameId);
    }
  });

  socket.on("disconnect", () => {
    // Clean up any active analyses for this socket's user
    for (const [gameId, controller] of activeAnalyses) {
      controller.abort();
      activeAnalyses.delete(gameId);
    }
  });
}
