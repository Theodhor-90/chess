import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockProcess {
  stdin: { write: ReturnType<typeof vi.fn>; writable: boolean };
  stdout: EventEmitter & {
    on: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  stderr: EventEmitter;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  eventHandlers: Map<string, ((...args: unknown[]) => void)[]>;
}

let mockProcess: MockProcess;

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { UciEngine } from "../src/engine/uci-engine.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function createMockProcess(): MockProcess {
  const eventHandlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const stdout = new EventEmitter() as MockProcess["stdout"];
  const stdoutOn = stdout.on.bind(stdout);
  const stdoutRemoveListener = stdout.removeListener.bind(stdout);

  stdout.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    stdoutOn(event, handler);
    return stdout;
  });
  stdout.removeListener = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    stdoutRemoveListener(event, handler);
    return stdout;
  });

  const proc: MockProcess = {
    stdin: {
      write: vi.fn(),
      writable: true,
    },
    stdout,
    stderr: new EventEmitter(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
      return proc;
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const handlers = eventHandlers.get(event);
      if (!handlers) {
        return proc;
      }
      eventHandlers.set(
        event,
        handlers.filter((existingHandler) => existingHandler !== handler),
      );
      return proc;
    }),
    kill: vi.fn(),
    eventHandlers,
  };

  return proc;
}

function emitLine(proc: MockProcess, line: string): void {
  proc.stdout.emit("data", Buffer.from(line + "\n"));
}

function emitLines(proc: MockProcess, lines: string[]): void {
  proc.stdout.emit("data", Buffer.from(lines.join("\n") + "\n"));
}

function triggerExit(proc: MockProcess, code: number | null, signal: string | null): void {
  const handlers = proc.eventHandlers.get("exit") ?? [];
  for (const handler of handlers) {
    handler(code, signal);
  }
}

function triggerError(proc: MockProcess, err: Error & { code?: string }): void {
  const handlers = proc.eventHandlers.get("error") ?? [];
  for (const handler of handlers) {
    handler(err);
  }
}

beforeEach(() => {
  vi.mocked(spawn).mockReset();
  vi.mocked(spawn).mockImplementation(() => {
    mockProcess = createMockProcess();
    return mockProcess as unknown as ChildProcess;
  });
});

async function initEngine(
  config?: Partial<{ binaryPath: string; defaultDepth: number }>,
): Promise<UciEngine> {
  const engine = new UciEngine(config);
  const initPromise = engine.init();
  emitLine(mockProcess, "uciok");
  emitLine(mockProcess, "readyok");
  await initPromise;
  return engine;
}

describe("init", () => {
  it("completes UCI handshake successfully", async () => {
    const engine = new UciEngine({ binaryPath: "/usr/bin/stockfish" });
    const initPromise = engine.init();

    emitLine(mockProcess, "uciok");
    emitLine(mockProcess, "readyok");

    await expect(initPromise).resolves.toBeUndefined();
    expect(engine.isReady).toBe(true);
    expect(mockProcess.stdin.write).toHaveBeenNthCalledWith(1, "uci\n");
    expect(mockProcess.stdin.write).toHaveBeenNthCalledWith(2, "setoption name MultiPV value 3\n");
    expect(mockProcess.stdin.write).toHaveBeenNthCalledWith(3, "isready\n");
  });

  it("throws clear error when binary is not found", async () => {
    const engine = new UciEngine({ binaryPath: "/nonexistent/stockfish" });
    const initPromise = engine.init();

    triggerError(mockProcess, Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

    await expect(initPromise).rejects.toThrow(
      "Stockfish binary not found at: /nonexistent/stockfish",
    );
  });

  it("isReady is false before init completes", () => {
    const engine = new UciEngine();
    expect(engine.isReady).toBe(false);
  });

  it("cleans up pendingLine when ENOENT fires after waitForLine is set up", async () => {
    const engine = new UciEngine({ binaryPath: "/bad/path" });
    const initPromise = engine.init();

    await Promise.resolve();
    triggerError(mockProcess, Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

    await expect(initPromise).rejects.toThrow("Stockfish binary not found at: /bad/path");
  });
});

describe("evaluate", () => {
  it("parses UCI output and returns correct EvaluationResult for starting position", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 10);

    emitLines(mockProcess, [
      "info depth 10 seldepth 13 multipv 1 score cp 35 nodes 13456 nps 1345600 time 10 pv e2e4 e7e5 g1f3 b8c6 f1b5",
      "info depth 10 seldepth 12 multipv 2 score cp 28 nodes 13456 nps 1345600 time 10 pv d2d4 d7d5 c2c4 e7e6",
      "info depth 10 seldepth 11 multipv 3 score cp 22 nodes 13456 nps 1345600 time 10 pv g1f3 d7d5 d2d4 g8f6",
      "bestmove e2e4 ponder e7e5",
    ]);

    await expect(evaluationPromise).resolves.toEqual({
      score: { type: "cp", value: 35 },
      depth: 10,
      bestLine: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
      engineLines: [
        {
          score: { type: "cp", value: 35 },
          moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
          depth: 10,
        },
        {
          score: { type: "cp", value: 28 },
          moves: ["d4", "d5", "c4", "e6"],
          depth: 10,
        },
        {
          score: { type: "cp", value: 22 },
          moves: ["Nf3", "d5", "d4", "Nf6"],
          depth: 10,
        },
      ],
    });
  });

  it("parses mate score correctly", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 12);

    emitLines(mockProcess, [
      "info depth 12 seldepth 16 multipv 1 score mate 3 nodes 2000 nps 200000 time 10 pv e2e4 e7e5 d1h5",
      "bestmove e2e4",
    ]);

    await expect(evaluationPromise).resolves.toEqual({
      score: { type: "mate", value: 3 },
      depth: 12,
      bestLine: ["e4", "e5", "Qh5"],
      engineLines: [
        {
          score: { type: "mate", value: 3 },
          moves: ["e4", "e5", "Qh5"],
          depth: 12,
        },
      ],
    });
  });

  it("sends correct UCI commands during evaluation", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 15);

    emitLine(mockProcess, "bestmove e2e4");
    await evaluationPromise;

    expect(mockProcess.stdin.write).toHaveBeenCalledWith(`position fen ${START_FEN}\n`);
    expect(mockProcess.stdin.write).toHaveBeenCalledWith("go depth 15\n");
  });

  it("uses defaultDepth when depth parameter is omitted", async () => {
    const engine = await initEngine({ defaultDepth: 18 });
    const evaluationPromise = engine.evaluate(START_FEN);

    emitLine(mockProcess, "bestmove e2e4");
    await evaluationPromise;

    expect(mockProcess.stdin.write).toHaveBeenCalledWith("go depth 18\n");
  });

  it("keeps highest depth per PV when multiple depths reported", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 10);

    emitLines(mockProcess, [
      "info depth 5 seldepth 6 multipv 1 score cp 12 nodes 1000 nps 100000 time 10 pv e2e4 e7e5",
      "info depth 10 seldepth 12 multipv 1 score cp 30 nodes 2000 nps 200000 time 10 pv d2d4 d7d5",
      "bestmove d2d4",
    ]);

    await expect(evaluationPromise).resolves.toEqual({
      score: { type: "cp", value: 30 },
      depth: 10,
      bestLine: ["d4", "d5"],
      engineLines: [
        {
          score: { type: "cp", value: 30 },
          moves: ["d4", "d5"],
          depth: 10,
        },
      ],
    });
  });

  it("throws when evaluate is called concurrently", async () => {
    const engine = await initEngine();
    const firstPromise = engine.evaluate(START_FEN, 10);

    await expect(engine.evaluate(START_FEN, 10)).rejects.toThrow("Evaluation already in progress");

    emitLine(mockProcess, "bestmove e2e4");
    await firstPromise;
  });

  it("throws when evaluate is called before init", async () => {
    const engine = new UciEngine();
    await expect(engine.evaluate(START_FEN)).rejects.toThrow(
      "Engine is not initialized. Call init() first.",
    );
  });

  it("rejects FEN input containing newlines", async () => {
    const engine = await initEngine();
    const maliciousFen = `${START_FEN}\nquit`;

    await expect(engine.evaluate(maliciousFen, 10)).rejects.toThrow(
      "FEN must not contain newline characters",
    );
    expect(mockProcess.stdin.write).not.toHaveBeenCalledWith(`position fen ${maliciousFen}\n`);
    expect(mockProcess.stdin.write).not.toHaveBeenCalledWith("go depth 10\n");
  });

  it("handles chunked/partial lines from stdout correctly", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 5);

    mockProcess.stdout.emit(
      "data",
      Buffer.from(
        "info depth 5 seldepth 6 multipv 1 score cp 30 nodes 1000 nps 100000 time 10 pv e2e4 e7",
      ),
    );
    mockProcess.stdout.emit("data", Buffer.from("e5\nbestmove e2e4\n"));

    await expect(evaluationPromise).resolves.toEqual({
      score: { type: "cp", value: 30 },
      depth: 5,
      bestLine: ["e4", "e5"],
      engineLines: [
        {
          score: { type: "cp", value: 30 },
          moves: ["e4", "e5"],
          depth: 5,
        },
      ],
    });
  });

  it("rejects cleanly when engine reports an invalid position", async () => {
    const engine = await initEngine();
    const invalidFen = "invalid fen";
    const evaluationPromise = engine.evaluate(invalidFen, 10);

    emitLine(mockProcess, "info string Illegal position");

    await expect(evaluationPromise).rejects.toThrow(`Invalid FEN: ${invalidFen}`);
  });
});

describe("stop", () => {
  it("sends stop command when evaluation is in progress", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 10);

    engine.stop();

    expect(mockProcess.stdin.write).toHaveBeenCalledWith("stop\n");

    emitLine(mockProcess, "bestmove e2e4");
    await evaluationPromise;
  });

  it("does nothing when no evaluation is in progress", async () => {
    const engine = await initEngine();

    engine.stop();

    expect(mockProcess.stdin.write).not.toHaveBeenCalledWith("stop\n");
  });
});

describe("destroy", () => {
  it("sends quit and kills the process", async () => {
    const engine = await initEngine();

    engine.destroy();

    expect(mockProcess.stdin.write).toHaveBeenCalledWith("quit\n");
    expect(mockProcess.removeListener).toHaveBeenCalledWith("error", expect.any(Function));
    expect(mockProcess.removeListener).toHaveBeenCalledWith("exit", expect.any(Function));
    expect(mockProcess.stdout.removeListener).toHaveBeenCalledWith("data", expect.any(Function));
    expect(mockProcess.kill).toHaveBeenCalled();
    expect(engine.isReady).toBe(false);
  });

  it("rejects pending evaluation on destroy", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 10);

    engine.destroy();

    await expect(evaluationPromise).rejects.toThrow("Engine destroyed");
  });
});

describe("process crash during evaluation", () => {
  it("rejects pending evaluation when process exits", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 10);

    triggerExit(mockProcess, 1, null);

    await expect(evaluationPromise).rejects.toThrow("Stockfish process exited unexpectedly");
    expect(engine.isReady).toBe(false);
  });
});

describe("UCI line parsing edge cases", () => {
  it("ignores info lines without score or pv", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 10);

    emitLines(mockProcess, [
      "info depth 10 seldepth 12 nodes 5000 nps 500000 time 10",
      "info depth 10 seldepth 12 multipv 1 score cp 18 nodes 6000 nps 600000 time 10 pv e2e4 e7e5",
      "bestmove e2e4",
    ]);

    await expect(evaluationPromise).resolves.toEqual({
      score: { type: "cp", value: 18 },
      depth: 10,
      bestLine: ["e4", "e5"],
      engineLines: [
        {
          score: { type: "cp", value: 18 },
          moves: ["e4", "e5"],
          depth: 10,
        },
      ],
    });
  });

  it("handles bestmove with no prior info lines", async () => {
    const engine = await initEngine();
    const evaluationPromise = engine.evaluate(START_FEN, 10);

    emitLine(mockProcess, "bestmove e2e4");

    await expect(evaluationPromise).resolves.toEqual({
      score: { type: "cp", value: 0 },
      depth: 0,
      bestLine: [],
      engineLines: [],
    });
  });
});
