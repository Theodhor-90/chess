import type { Socket } from "socket.io";
import { Chess } from "chess.js";
import type { FastifyInstance } from "fastify";
import type { ClientToServerEvents, ServerToClientEvents, ServerSocketData } from "@chess/shared";
import { ANALYSIS_DEPTH_THRESHOLDS } from "@chess/shared";
import type { TypedSocketServer } from "./index.js";

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  ServerSocketData
>;

const activeEvaluations = new Map<string, AbortController>();

export function registerEvaluateHandlers(
  _io: TypedSocketServer,
  socket: TypedSocket,
  app: FastifyInstance,
): void {
  socket.on("evaluatePosition", async (data) => {
    const { fen, requestId } = data;

    if (!app.hasDecorator("engine")) {
      socket.emit("positionEvalError", {
        requestId,
        error: "Engine analysis is currently unavailable.",
      });
      return;
    }

    try {
      new Chess(fen);
    } catch {
      socket.emit("positionEvalError", { requestId, error: "Invalid FEN" });
      return;
    }

    // Cancel any previous evaluation for this requestId
    const existing = activeEvaluations.get(requestId);
    if (existing) {
      existing.abort();
      activeEvaluations.delete(requestId);
    }

    const abortController = new AbortController();
    activeEvaluations.set(requestId, abortController);

    const targetDepth = ANALYSIS_DEPTH_THRESHOLDS[ANALYSIS_DEPTH_THRESHOLDS.length - 1];

    try {
      const result = await app.engine.evaluateWithProgress(
        fen,
        targetDepth,
        ANALYSIS_DEPTH_THRESHOLDS,
        (progressResult, depth) => {
          if (abortController.signal.aborted) return;
          socket.emit("positionEvaluation", {
            requestId,
            result: progressResult,
            depth,
            final: false,
          });
        },
      );

      if (abortController.signal.aborted) return;

      socket.emit("positionEvaluation", {
        requestId,
        result,
        depth: result.depth,
        final: true,
      });
    } catch (err) {
      if (!abortController.signal.aborted) {
        socket.emit("positionEvalError", {
          requestId,
          error: err instanceof Error ? err.message : "Evaluation failed",
        });
      }
    } finally {
      activeEvaluations.delete(requestId);
    }
  });

  socket.on("cancelEvaluation", (data) => {
    const controller = activeEvaluations.get(data.requestId);
    if (controller) {
      controller.abort();
      activeEvaluations.delete(data.requestId);
    }
  });

  socket.on("disconnect", () => {
    for (const [requestId, controller] of activeEvaluations) {
      controller.abort();
      activeEvaluations.delete(requestId);
    }
  });
}
