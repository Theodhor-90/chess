import { describe, it, expect, beforeAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { EvaluationResult } from "@chess/shared";
import { db } from "../src/db/index.js";
import { games, moves } from "../src/db/schema.js";
import { registerAnalysisHandlers } from "../src/socket/analysis-handler.js";
import type { TypedSocketServer } from "../src/socket/index.js";
import { ensureSchema, seedTestUser } from "./helpers.js";

type SocketHandler = (data?: unknown) => void | Promise<void>;

class FakeSocket {
  id: string;
  data: { userId: number; rtt: number };
  handlers = new Map<string, SocketHandler>();
  emitted: Array<{ event: string; data: unknown }> = [];

  constructor(id: string, userId: number) {
    this.id = id;
    this.data = { userId, rtt: 0 };
  }

  on(event: string, handler: SocketHandler) {
    this.handlers.set(event, handler);
    return this;
  }

  emit(event: string, data: unknown) {
    this.emitted.push({ event, data });
    return true;
  }

  trigger(event: string, data?: unknown) {
    const handler = this.handlers.get(event);
    if (!handler) {
      throw new Error(`No handler registered for ${event}`);
    }
    return handler(data);
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeEvaluationResult(): EvaluationResult {
  return {
    score: { type: "cp", value: 20 },
    bestLine: ["e4"],
    depth: 20,
    engineLines: [],
  };
}

function createAnalysisApp(deferreds: Array<ReturnType<typeof createDeferred<EvaluationResult>>>) {
  return {
    hasDecorator: (name: string) => name === "engine",
    engine: {
      evaluate: vi.fn(() => {
        const deferred = createDeferred<EvaluationResult>();
        deferreds.push(deferred);
        return deferred.promise;
      }),
    },
  } as unknown as FastifyInstance;
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeAll(() => {
  ensureSchema();
});

describe("registerAnalysisHandlers disconnect cleanup", () => {
  it("disconnect only aborts PGN analyses owned by the disconnecting socket", async () => {
    const deferreds: Array<ReturnType<typeof createDeferred<EvaluationResult>>> = [];
    const app = createAnalysisApp(deferreds);
    const socketA = new FakeSocket("socket-a", 1001);
    const socketB = new FakeSocket("socket-b", 1002);

    registerAnalysisHandlers({} as TypedSocketServer, socketA as never, app);
    registerAnalysisHandlers({} as TypedSocketServer, socketB as never, app);

    const analysisA = socketA.trigger("analyzePgn", { pgn: "1. e4 e5", requestId: "req-a" });
    const analysisB = socketB.trigger("analyzePgn", { pgn: "1. d4 d5", requestId: "req-b" });

    socketA.trigger("disconnect");

    expect(deferreds).toHaveLength(6);

    for (const deferred of deferreds) {
      deferred.resolve(makeEvaluationResult());
    }

    await Promise.all([analysisA, analysisB]);
    await flushAsyncWork();

    expect(socketA.emitted.some(({ event }) => event === "pgnAnalysisComplete")).toBe(false);
    expect(socketB.emitted.some(({ event }) => event === "pgnAnalysisComplete")).toBe(true);
    expect(socketB.emitted.some(({ event }) => event === "pgnAnalysisError")).toBe(false);
  });

  it("disconnect only aborts saved-game analyses owned by the disconnecting socket", async () => {
    seedTestUser(2001);
    seedTestUser(2002);
    seedTestUser(2003);
    seedTestUser(2004);

    const runId = Date.now();
    const insertedGames = db
      .insert(games)
      .values([
        {
          inviteToken: `analysis-handler-g1-${runId}`,
          status: "checkmate",
          whitePlayerId: 2001,
          blackPlayerId: 2002,
          pgn: "1. e4 e5",
        },
        {
          inviteToken: `analysis-handler-g2-${runId}`,
          status: "checkmate",
          whitePlayerId: 2003,
          blackPlayerId: 2004,
          pgn: "1. d4 d5",
        },
      ])
      .returning({ id: games.id })
      .all();

    db.insert(moves)
      .values([
        { gameId: insertedGames[0].id, moveNumber: 1, san: "e4" },
        { gameId: insertedGames[0].id, moveNumber: 2, san: "e5" },
        { gameId: insertedGames[1].id, moveNumber: 1, san: "d4" },
        { gameId: insertedGames[1].id, moveNumber: 2, san: "d5" },
      ])
      .run();

    const deferreds: Array<ReturnType<typeof createDeferred<EvaluationResult>>> = [];
    const app = createAnalysisApp(deferreds);
    const socketA = new FakeSocket("socket-c", 2001);
    const socketB = new FakeSocket("socket-d", 2003);

    registerAnalysisHandlers({} as TypedSocketServer, socketA as never, app);
    registerAnalysisHandlers({} as TypedSocketServer, socketB as never, app);

    const analysisA = socketA.trigger("startAnalysis", { gameId: insertedGames[0].id });
    const analysisB = socketB.trigger("startAnalysis", { gameId: insertedGames[1].id });

    socketA.trigger("disconnect");

    expect(deferreds).toHaveLength(6);

    for (const deferred of deferreds) {
      deferred.resolve(makeEvaluationResult());
    }

    await Promise.all([analysisA, analysisB]);
    await flushAsyncWork();

    expect(socketA.emitted.some(({ event }) => event === "analysisComplete")).toBe(false);
    expect(socketB.emitted.some(({ event }) => event === "analysisComplete")).toBe(true);
    expect(socketB.emitted.some(({ event }) => event === "analysisError")).toBe(false);
  });
});
