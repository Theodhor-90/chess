import { UciEngine, type UciEngineConfig } from "./uci-engine.js";
import type { EvaluationResult } from "@chess/shared";

export interface EnginePoolConfig {
  poolSize: number;
  binaryPath: string;
  defaultDepth: number;
}

const DEFAULT_POOL_SIZE = parseInt(process.env.STOCKFISH_POOL_SIZE ?? "2", 10);
const DEFAULT_BINARY_PATH = process.env.STOCKFISH_PATH ?? "stockfish";
const DEFAULT_DEPTH = parseInt(process.env.STOCKFISH_DEPTH ?? "20", 10);

interface QueuedRequest {
  fen: string;
  depth: number | undefined;
  resolve: (result: EvaluationResult) => void;
  reject: (err: Error) => void;
}

interface EngineEntry {
  engine: UciEngine;
  busy: boolean;
}

export class EnginePool {
  private readonly config: EnginePoolConfig;
  private engines: EngineEntry[] = [];
  private queue: QueuedRequest[] = [];
  private initialized = false;
  private shuttingDown = false;

  constructor(config?: Partial<EnginePoolConfig>) {
    this.config = {
      poolSize: config?.poolSize ?? DEFAULT_POOL_SIZE,
      binaryPath: config?.binaryPath ?? DEFAULT_BINARY_PATH,
      defaultDepth: config?.defaultDepth ?? DEFAULT_DEPTH,
    };
  }

  get size(): number {
    return this.engines.length;
  }

  get pendingRequests(): number {
    return this.queue.length;
  }

  async init(): Promise<void> {
    const entries: EngineEntry[] = [];
    const engineConfig: Partial<UciEngineConfig> = {
      binaryPath: this.config.binaryPath,
      defaultDepth: this.config.defaultDepth,
    };

    for (let i = 0; i < this.config.poolSize; i++) {
      entries.push({ engine: new UciEngine(engineConfig), busy: false });
    }

    const results = await Promise.allSettled(entries.map((entry) => entry.engine.init()));
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (failure) {
      for (const entry of entries) {
        if (entry.engine.isReady) {
          entry.engine.destroy();
        }
      }
      throw failure.reason;
    }

    this.engines = entries;
    this.initialized = true;
  }

  async evaluate(fen: string, depth?: number): Promise<EvaluationResult> {
    if (this.shuttingDown) {
      throw new Error("Engine pool is shutting down");
    }
    if (!this.initialized) {
      throw new Error("Engine pool is not initialized. Call init() first.");
    }

    const idle = this.engines.find((entry) => !entry.busy && entry.engine.isReady);
    if (idle) {
      return this.runOnEngine(idle, fen, depth);
    }

    return new Promise<EvaluationResult>((resolve, reject) => {
      this.queue.push({ fen, depth, resolve, reject });
      if (this.queue.length > 50) {
        console.warn(
          `Engine pool: queue depth is ${this.queue.length} (exceeds 50 pending requests)`,
        );
      }
    });
  }

  shutdown(): void {
    this.shuttingDown = true;
    this.initialized = false;

    const pendingQueue = this.queue.splice(0);
    const shutdownError = new Error("Engine pool is shutting down");
    for (const request of pendingQueue) {
      request.reject(shutdownError);
    }

    for (const entry of this.engines) {
      try {
        entry.engine.destroy();
      } catch {
        void 0;
      }
    }
    this.engines = [];
  }

  private async runOnEngine(
    entry: EngineEntry,
    fen: string,
    depth: number | undefined,
  ): Promise<EvaluationResult> {
    entry.busy = true;
    try {
      const result = await entry.engine.evaluate(fen, depth);
      return result;
    } catch (err) {
      if (!entry.engine.isReady && !this.shuttingDown) {
        this.replaceEngine(entry);
      }
      throw err;
    } finally {
      entry.busy = false;
      this.drainQueue();
    }
  }

  private drainQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    const idle = this.engines.find((entry) => !entry.busy && entry.engine.isReady);
    if (!idle) {
      return;
    }

    const request = this.queue.shift()!;
    this.runOnEngine(idle, request.fen, request.depth).then(request.resolve, request.reject);
  }

  private replaceEngine(entry: EngineEntry): void {
    try {
      entry.engine.destroy();
    } catch {
      void 0;
    }

    const newEngine = new UciEngine({
      binaryPath: this.config.binaryPath,
      defaultDepth: this.config.defaultDepth,
    });

    newEngine
      .init()
      .then(() => {
        if (this.shuttingDown) {
          try {
            newEngine.destroy();
          } catch {
            void 0;
          }
          return;
        }

        entry.engine = newEngine;
        this.drainQueue();
      })
      .catch((err) => {
        console.warn("Engine pool: failed to respawn engine after crash:", err);
        const idx = this.engines.indexOf(entry);
        if (idx !== -1) {
          this.engines.splice(idx, 1);
        }
      });
  }
}
