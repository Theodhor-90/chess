import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Chess } from "chess.js";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MATE_FEN = "6k1/5ppp/8/8/8/8/1Q6/K7 w - - 0 1";

let lastMockWorker: MockWorker;

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  terminate = vi.fn();

  private storedFen = "";

  constructor(_url: URL, _opts?: { type: string }) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastMockWorker = this;
    queueMicrotask(() => {
      this.onmessage?.({ data: { type: "ready" } } as MessageEvent);
    });
  }

  postMessage(msg: { type: string; command: string }): void {
    if (msg.type !== "uci-command") return;

    if (msg.command.startsWith("position fen ")) {
      this.storedFen = msg.command.slice(13);
      return;
    }

    if (msg.command.startsWith("go depth")) {
      queueMicrotask(() => this.simulateEval());
      return;
    }
  }

  private simulateEval(): void {
    if (this.isMatePosition()) {
      this.emitUci("info depth 18 multipv 1 score mate 2 pv b2f6 g8f8 f6f7");
      this.emitUci("info depth 18 multipv 2 score mate 4 pv b2b7 g8f8 b7f7");
      this.emitUci("bestmove b2f6");
    } else {
      this.emitUci("info depth 18 multipv 1 score cp 25 pv e2e4 e7e5 g1f3");
      this.emitUci("info depth 18 multipv 2 score cp 20 pv d2d4 d7d5 c2c4");
      this.emitUci("info depth 18 multipv 3 score cp 15 pv g1f3 d7d5 d2d4");
      this.emitUci("bestmove e2e4");
    }
  }

  private isMatePosition(): boolean {
    return this.storedFen.startsWith("6k1/5ppp/8/8/8/8/1Q6/K7");
  }

  private emitUci(line: string): void {
    this.onmessage?.({ data: { type: "uci-output", data: line } } as MessageEvent);
  }
}

describe("StockfishService", () => {
  let service: InstanceType<typeof import("../src/services/stockfish.js").StockfishService>;

  beforeEach(async () => {
    vi.stubGlobal("Worker", MockWorker);
    const mod = await import("../src/services/stockfish.js");
    service = new mod.StockfishService();
  });

  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
  });

  it("initializes and becomes ready", async () => {
    await expect(service.ready).resolves.toBeUndefined();
  });

  it("evaluates the starting position and returns a centipawn score", async () => {
    const result = await service.evaluate(STARTING_FEN);
    expect(result.score).toEqual({ type: "cp", value: 25 });
  });

  it("returns bestLine containing valid SAN moves", async () => {
    const result = await service.evaluate(STARTING_FEN);
    expect(result.bestLine).toEqual(["e4", "e5", "Nf3"]);

    const chess = new Chess(STARTING_FEN);
    for (const san of result.bestLine) {
      const move = chess.move(san);
      expect(move).not.toBeNull();
    }
  });

  it("returns depth 18", async () => {
    const result = await service.evaluate(STARTING_FEN);
    expect(result.depth).toBe(18);
  });

  it("evaluates a forced-mate position and returns a mate score", async () => {
    const result = await service.evaluate(MATE_FEN);
    expect(result.score).toEqual({ type: "mate", value: 2 });
  });

  it("returns engineLines with 3 entries for a normal position", async () => {
    const result = await service.evaluate(STARTING_FEN);
    expect(result.engineLines).toBeDefined();
    expect(result.engineLines).toHaveLength(3);
  });

  it("engineLines[0] matches score and bestLine", async () => {
    const result = await service.evaluate(STARTING_FEN);
    expect(result.engineLines![0].score).toEqual(result.score);
    expect(result.engineLines![0].moves).toEqual(result.bestLine);
    expect(result.engineLines![0].depth).toBe(result.depth);
  });

  it("engineLines contain valid SAN moves and decreasing scores", async () => {
    const result = await service.evaluate(STARTING_FEN);
    const lines = result.engineLines!;

    expect(lines[0].score).toEqual({ type: "cp", value: 25 });
    expect(lines[1].score).toEqual({ type: "cp", value: 20 });
    expect(lines[2].score).toEqual({ type: "cp", value: 15 });

    expect(lines[0].moves).toEqual(["e4", "e5", "Nf3"]);
    expect(lines[1].moves).toEqual(["d4", "d5", "c4"]);
    expect(lines[2].moves).toEqual(["Nf3", "d5", "d4"]);
  });

  it("returns fewer engineLines when fewer PVs available", async () => {
    const result = await service.evaluate(MATE_FEN);
    expect(result.engineLines).toBeDefined();
    expect(result.engineLines).toHaveLength(2);
    expect(result.engineLines![0].score).toEqual({ type: "mate", value: 2 });
    expect(result.engineLines![1].score).toEqual({ type: "mate", value: 4 });
  });

  it("destroy() terminates cleanly", () => {
    service.destroy();
    expect(lastMockWorker.terminate).toHaveBeenCalledOnce();
  });
});
