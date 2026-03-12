import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluationResult } from "@chess/shared";

interface MockUciEngine {
  init: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  isReady: boolean;
  _setReady: (ready: boolean) => void;
}

function createMockUciEngine(): MockUciEngine {
  let ready = false;
  return {
    init: vi.fn(async () => {
      ready = true;
    }),
    evaluate: vi.fn(),
    destroy: vi.fn(() => {
      ready = false;
    }),
    stop: vi.fn(),
    get isReady() {
      return ready;
    },
    _setReady(r: boolean) {
      ready = r;
    },
  };
}

const mockEngines: MockUciEngine[] = [];

vi.mock("../src/engine/uci-engine.js", () => ({
  UciEngine: vi.fn().mockImplementation(() => {
    const engine = createMockUciEngine();
    mockEngines.push(engine);
    return engine;
  }),
}));

import { EnginePool } from "../src/engine/engine-pool.js";

beforeEach(() => {
  mockEngines.length = 0;
  vi.clearAllMocks();
});

function makeEvalResult(cpValue: number): EvaluationResult {
  return {
    score: { type: "cp", value: cpValue },
    bestLine: ["e4"],
    depth: 20,
    engineLines: [],
  };
}

async function createPool(poolSize = 2): Promise<EnginePool> {
  const pool = new EnginePool({ poolSize, binaryPath: "stockfish", defaultDepth: 20 });
  await pool.init();
  return pool;
}

describe("init", () => {
  it("creates and initializes the configured number of engines", async () => {
    const pool = new EnginePool({ poolSize: 3, binaryPath: "stockfish", defaultDepth: 20 });

    await pool.init();

    expect(mockEngines).toHaveLength(3);
    expect(mockEngines[0].init).toHaveBeenCalledTimes(1);
    expect(mockEngines[1].init).toHaveBeenCalledTimes(1);
    expect(mockEngines[2].init).toHaveBeenCalledTimes(1);
    expect(pool.size).toBe(3);
  });

  it("fails if any engine fails to start and destroys successful engines", async () => {
    let callCount = 0;
    let resolveDelayedInit!: () => void;
    const { UciEngine } = await import("../src/engine/uci-engine.js");
    vi.mocked(UciEngine).mockImplementation(() => {
      const engine = createMockUciEngine();
      callCount++;
      if (callCount === 1) {
        engine.init = vi.fn(async () => {
          engine._setReady(true);
        });
      }
      if (callCount === 2) {
        engine.init = vi.fn().mockRejectedValue(new Error("binary not found"));
      }
      if (callCount === 3) {
        engine.init = vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveDelayedInit = () => {
                engine._setReady(true);
                resolve();
              };
            }),
        );
      }
      mockEngines.push(engine);
      return engine as never;
    });

    const pool = new EnginePool({ poolSize: 3, binaryPath: "stockfish", defaultDepth: 20 });
    let settled = false;
    const initPromise = pool.init().catch((err: unknown) => {
      settled = true;
      throw err;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    resolveDelayedInit();

    await expect(initPromise).rejects.toThrow("binary not found");

    expect(mockEngines[0].destroy).toHaveBeenCalled();
    expect(mockEngines[2].destroy).toHaveBeenCalled();
  });

  it("throws if evaluate is called before init", async () => {
    const pool = new EnginePool({ poolSize: 1, binaryPath: "stockfish", defaultDepth: 20 });

    await expect(pool.evaluate("fen")).rejects.toThrow(
      "Engine pool is not initialized. Call init() first.",
    );
  });
});

describe("evaluate - request distribution", () => {
  it("dispatches request to an idle engine", async () => {
    const pool = await createPool(2);
    mockEngines[0].evaluate.mockResolvedValue(makeEvalResult(35));

    const result = await pool.evaluate("fen", 20);

    expect(result).toEqual(makeEvalResult(35));
    expect(mockEngines[0].evaluate).toHaveBeenCalledWith("fen", 20);
  });

  it("distributes requests across engines", async () => {
    const pool = await createPool(2);

    let resolve0!: (r: EvaluationResult) => void;
    let resolve1!: (r: EvaluationResult) => void;
    mockEngines[0].evaluate.mockReturnValue(
      new Promise<EvaluationResult>((r) => {
        resolve0 = r;
      }),
    );
    mockEngines[1].evaluate.mockReturnValue(
      new Promise<EvaluationResult>((r) => {
        resolve1 = r;
      }),
    );

    const p0 = pool.evaluate("fen0");
    const p1 = pool.evaluate("fen1");

    expect(mockEngines[0].evaluate).toHaveBeenCalledWith("fen0", undefined);
    expect(mockEngines[1].evaluate).toHaveBeenCalledWith("fen1", undefined);

    resolve0(makeEvalResult(10));
    resolve1(makeEvalResult(20));

    await expect(p0).resolves.toEqual(makeEvalResult(10));
    await expect(p1).resolves.toEqual(makeEvalResult(20));
  });
});

describe("evaluate - queuing", () => {
  it("queues requests when all engines are busy and processes them in FIFO order", async () => {
    const pool = await createPool(1);

    const resolvers: ((r: EvaluationResult) => void)[] = [];
    mockEngines[0].evaluate.mockImplementation(() => {
      return new Promise<EvaluationResult>((r) => {
        resolvers.push(r);
      });
    });

    const p1 = pool.evaluate("fen1");
    const p2 = pool.evaluate("fen2");
    const p3 = pool.evaluate("fen3");

    expect(pool.pendingRequests).toBe(2);
    expect(mockEngines[0].evaluate).toHaveBeenCalledTimes(1);

    resolvers[0](makeEvalResult(1));
    await p1;
    await Promise.resolve();

    expect(mockEngines[0].evaluate).toHaveBeenCalledTimes(2);
    expect(pool.pendingRequests).toBe(1);

    resolvers[1](makeEvalResult(2));
    await p2;
    await Promise.resolve();

    expect(mockEngines[0].evaluate).toHaveBeenCalledTimes(3);
    expect(pool.pendingRequests).toBe(0);

    resolvers[2](makeEvalResult(3));
    await expect(p3).resolves.toEqual(makeEvalResult(3));
  });

  it("logs warning when queue exceeds 50 pending requests", async () => {
    const pool = await createPool(1);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let rejectInFlight!: (err: Error) => void;
    mockEngines[0].evaluate.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectInFlight = reject;
      }),
    );

    const promises: Promise<EvaluationResult>[] = [];
    for (let i = 0; i < 52; i++) {
      promises.push(pool.evaluate(`fen${i}`).catch(() => makeEvalResult(0)));
    }

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("exceeds 50 pending requests"));

    pool.shutdown();
    rejectInFlight(new Error("Engine destroyed"));
    await Promise.allSettled(promises);
    warnSpy.mockRestore();
  });
});

describe("shutdown", () => {
  it("destroys all engines on shutdown", async () => {
    const pool = await createPool(3);

    pool.shutdown();

    expect(mockEngines[0].destroy).toHaveBeenCalled();
    expect(mockEngines[1].destroy).toHaveBeenCalled();
    expect(mockEngines[2].destroy).toHaveBeenCalled();
    expect(pool.size).toBe(0);
  });

  it("rejects queued requests on shutdown", async () => {
    const pool = await createPool(1);

    let rejectFirst!: (err: Error) => void;
    mockEngines[0].evaluate.mockReturnValue(
      new Promise<EvaluationResult>((_res, rej) => {
        rejectFirst = rej;
      }),
    );

    const p1 = pool.evaluate("fen1");
    const p2 = pool.evaluate("fen2");
    const p3 = pool.evaluate("fen3");

    pool.shutdown();

    await expect(p2).rejects.toThrow("Engine pool is shutting down");
    await expect(p3).rejects.toThrow("Engine pool is shutting down");

    rejectFirst(new Error("Engine destroyed"));
    await expect(p1).rejects.toThrow("Engine destroyed");
  });

  it("rejects new evaluations after shutdown", async () => {
    const pool = await createPool(2);

    pool.shutdown();

    await expect(pool.evaluate("fen")).rejects.toThrow("Engine pool is shutting down");
  });
});

describe("crash recovery", () => {
  it("replaces a crashed engine and continues processing", async () => {
    const pool = await createPool(2);
    const initialEngineCount = mockEngines.length;

    mockEngines[0].evaluate.mockImplementation(async () => {
      mockEngines[0]._setReady(false);
      throw new Error("Stockfish process exited unexpectedly (code: 1, signal: null)");
    });

    await expect(pool.evaluate("fen")).rejects.toThrow("Stockfish process exited unexpectedly");

    await new Promise((r) => setTimeout(r, 10));

    expect(mockEngines.length).toBe(initialEngineCount + 1);
    expect(mockEngines[2].init).toHaveBeenCalled();

    mockEngines[2].evaluate.mockResolvedValue(makeEvalResult(42));
    const result = await pool.evaluate("fen2");
    expect(result).toEqual(makeEvalResult(42));
  });

  it("does not dispatch queued requests to a crashed engine during replacement", async () => {
    const pool = await createPool(1);

    const { UciEngine } = await import("../src/engine/uci-engine.js");
    vi.mocked(UciEngine).mockImplementationOnce(() => {
      const engine = createMockUciEngine();
      engine.evaluate.mockResolvedValue(makeEvalResult(99));
      mockEngines.push(engine);
      return engine as never;
    });

    mockEngines[0].evaluate.mockImplementation(async () => {
      mockEngines[0]._setReady(false);
      throw new Error("process exited");
    });

    const p1 = pool.evaluate("fen1");
    const p2 = pool.evaluate("fen2");

    await expect(p1).rejects.toThrow("process exited");

    expect(mockEngines[0].evaluate).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 10));

    await expect(p2).resolves.toEqual(makeEvalResult(99));
  });

  it("removes engine from pool if respawn also fails", async () => {
    const pool = await createPool(2);

    mockEngines[0].evaluate.mockImplementation(async () => {
      mockEngines[0]._setReady(false);
      throw new Error("process exited");
    });

    const { UciEngine } = await import("../src/engine/uci-engine.js");
    vi.mocked(UciEngine).mockImplementationOnce(() => {
      const engine = createMockUciEngine();
      engine.init = vi.fn().mockRejectedValue(new Error("binary not found"));
      mockEngines.push(engine);
      return engine as never;
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(pool.evaluate("fen")).rejects.toThrow("process exited");

    await new Promise((r) => setTimeout(r, 10));

    expect(pool.size).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to respawn engine after crash"),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it("destroys a replacement engine if shutdown starts before respawn completes", async () => {
    const pool = await createPool(1);

    let resolveReplacementInit!: () => void;
    const { UciEngine } = await import("../src/engine/uci-engine.js");
    vi.mocked(UciEngine).mockImplementationOnce(() => {
      const engine = createMockUciEngine();
      engine.init = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveReplacementInit = () => {
              engine._setReady(true);
              resolve();
            };
          }),
      );
      mockEngines.push(engine);
      return engine as never;
    });

    mockEngines[0].evaluate.mockImplementation(async () => {
      mockEngines[0]._setReady(false);
      throw new Error("process exited");
    });

    await expect(pool.evaluate("fen")).rejects.toThrow("process exited");

    expect(mockEngines).toHaveLength(2);

    pool.shutdown();
    resolveReplacementInit();
    await Promise.resolve();

    expect(mockEngines[1].destroy).toHaveBeenCalled();
    expect(pool.size).toBe(0);
  });
});
