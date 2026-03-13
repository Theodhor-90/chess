import { spawn, type ChildProcess } from "node:child_process";
import { Chess } from "chess.js";
import type { EvalScore, EvaluationResult, EngineLineInfo } from "@chess/shared";

export interface UciEngineConfig {
  binaryPath: string;
  defaultDepth?: number;
}

const DEFAULT_BINARY_PATH = process.env.STOCKFISH_PATH ?? "stockfish";
const DEFAULT_DEPTH = parseInt(process.env.STOCKFISH_DEPTH ?? "20", 10);

export class UciEngine {
  private readonly binaryPath: string;
  private readonly defaultDepth: number;
  private process: ChildProcess | null = null;
  private processErrorHandler: ((err: NodeJS.ErrnoException) => void) | null = null;
  private processExitHandler: ((code: number | null, signal: string | null) => void) | null = null;
  private stdoutDataHandler: ((chunk: Buffer) => void) | null = null;
  private _isReady = false;
  private evaluating = false;
  private evalResolve: ((result: EvaluationResult) => void) | null = null;
  private evalReject: ((err: Error) => void) | null = null;
  private lineBuffer = "";
  private queuedLines: string[] = [];
  private pvData = new Map<number, { depth: number; score: EvalScore; pv: string[] }>();
  private currentFen = "";
  private pendingLine: {
    predicate: (line: string) => boolean;
    resolve: (line: string) => void;
    reject: (err: Error) => void;
  } | null = null;
  private progressCallback: ((result: EvaluationResult, depth: number) => void) | null = null;
  private progressThresholds: readonly number[] = [];
  private reportedThresholds = new Set<number>();

  constructor(config?: Partial<UciEngineConfig>) {
    this.binaryPath = config?.binaryPath ?? DEFAULT_BINARY_PATH;
    this.defaultDepth = config?.defaultDepth ?? DEFAULT_DEPTH;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  async init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let initSettled = false;
      const initReject = (err: Error) => {
        if (initSettled) {
          return;
        }
        initSettled = true;

        const pendingLine = this.pendingLine;
        this.pendingLine = null;
        pendingLine?.reject(err);

        reject(err);
      };

      this.process = spawn(this.binaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });

      this.processErrorHandler = (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          initReject(new Error(`Stockfish binary not found at: ${this.binaryPath}`));
        } else {
          initReject(err);
        }
      };
      this.process.on("error", this.processErrorHandler);

      this.stdoutDataHandler = (chunk: Buffer) => {
        this.handleStdoutData(chunk);
      };
      this.process.stdout!.on("data", this.stdoutDataHandler);

      this.processExitHandler = (code, signal) => {
        this.handleProcessExit(code, signal);
      };
      this.process.on("exit", this.processExitHandler);

      this.sendCommand("uci");
      this.waitForLine((l) => l.trim() === "uciok")
        .then(() => {
          this.sendCommand("setoption name MultiPV value 3");
          this.sendCommand("isready");
          return this.waitForLine((l) => l.trim() === "readyok");
        })
        .then(() => {
          this._isReady = true;
          resolve();
        })
        .catch(initReject);
    });
  }

  async evaluate(fen: string, depth?: number): Promise<EvaluationResult> {
    if (!this._isReady) {
      throw new Error("Engine is not initialized. Call init() first.");
    }
    if (this.evaluating) {
      throw new Error("Evaluation already in progress");
    }
    if (/[\r\n]/.test(fen)) {
      throw new Error("FEN must not contain newline characters");
    }

    this.evaluating = true;
    this.currentFen = fen;
    this.pvData.clear();

    return new Promise<EvaluationResult>((resolve, reject) => {
      this.evalResolve = resolve;
      this.evalReject = reject;
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go depth ${depth ?? this.defaultDepth}`);
    });
  }

  async evaluateWithProgress(
    fen: string,
    depth: number,
    depthThresholds: readonly number[],
    onProgress: (result: EvaluationResult, depth: number) => void,
  ): Promise<EvaluationResult> {
    if (!this._isReady) {
      throw new Error("Engine is not initialized. Call init() first.");
    }
    if (this.evaluating) {
      throw new Error("Evaluation already in progress");
    }
    if (/[\r\n]/.test(fen)) {
      throw new Error("FEN must not contain newline characters");
    }

    this.evaluating = true;
    this.currentFen = fen;
    this.pvData.clear();
    this.progressCallback = onProgress;
    this.progressThresholds = depthThresholds;
    this.reportedThresholds.clear();

    return new Promise<EvaluationResult>((resolve, reject) => {
      this.evalResolve = resolve;
      this.evalReject = reject;
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go depth ${depth}`);
    });
  }

  stop(): void {
    if (this.evaluating && this.process?.stdin?.writable) {
      this.sendCommand("stop");
    }
  }

  destroy(): void {
    this._isReady = false;

    if (this.evalReject) {
      this.evalReject(new Error("Engine destroyed"));
      this.evalResolve = null;
      this.evalReject = null;
    }
    if (this.pendingLine) {
      this.pendingLine.reject(new Error("Engine destroyed"));
      this.pendingLine = null;
    }
    this.evaluating = false;

    if (this.process) {
      try {
        this.sendCommand("quit");
      } catch {
        void 0;
      }
      this.detachProcessListeners(this.process);
      this.process.kill();
      this.process = null;
    }
  }

  private waitForLine(predicate: (line: string) => boolean): Promise<string> {
    const queuedIndex = this.queuedLines.findIndex((line) => predicate(line));
    if (queuedIndex !== -1) {
      const [line] = this.queuedLines.splice(queuedIndex, 1);
      return Promise.resolve(line);
    }

    return new Promise<string>((resolve, reject) => {
      this.pendingLine = { predicate, resolve, reject };
    });
  }

  private sendCommand(cmd: string): void {
    if (!this.process || !this.process.stdin || !this.process.stdin.writable) {
      throw new Error("Engine process is not running");
    }
    this.process.stdin.write(cmd + "\n");
  }

  private handleStdoutData(chunk: Buffer): void {
    this.lineBuffer += chunk.toString();
    const lines = this.lineBuffer.split("\n");
    this.lineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    if (this.pendingLine && this.pendingLine.predicate(line)) {
      const pending = this.pendingLine;
      this.pendingLine = null;
      pending.resolve(line);
      return;
    }
    if (this.evaluating) {
      this.handleEvalLine(line);
      return;
    }
    this.queuedLines.push(line);
  }

  private handleEvalLine(line: string): void {
    if (this.isInvalidPositionLine(line)) {
      const reject = this.evalReject;
      const invalidFen = this.currentFen;
      this.evaluating = false;
      this.pvData.clear();
      this.currentFen = "";
      this.evalResolve = null;
      this.evalReject = null;
      reject?.(new Error(`Invalid FEN: ${invalidFen}`));
      return;
    }

    if (line.startsWith("bestmove")) {
      try {
        const result = this.snapshotCurrentEval();

        this.evaluating = false;
        this.pvData.clear();
        this.currentFen = "";
        this.progressCallback = null;
        this.progressThresholds = [];
        this.reportedThresholds.clear();

        const resolve = this.evalResolve;
        this.evalResolve = null;
        this.evalReject = null;
        resolve!(result);
      } catch {
        const reject = this.evalReject;
        this.evaluating = false;
        this.pvData.clear();
        this.currentFen = "";
        this.progressCallback = null;
        this.progressThresholds = [];
        this.reportedThresholds.clear();
        this.evalResolve = null;
        this.evalReject = null;
        reject?.(new Error("Invalid FEN: unable to convert engine PV to SAN"));
      }
      return;
    }

    if (line.startsWith("info ") && line.includes(" score ") && line.includes(" pv ")) {
      const depth = this.parseIntToken(line, "depth");
      if (depth === null) return;

      const score = this.parseScore(line);
      if (score === null) return;

      const pv = this.parsePv(line);
      if (pv.length === 0) return;

      const multipv = this.parseIntToken(line, "multipv") ?? 1;

      const existing = this.pvData.get(multipv);
      if (!existing || depth >= existing.depth) {
        this.pvData.set(multipv, { depth, score, pv });
      }

      if (multipv === 1 && this.progressCallback) {
        for (const threshold of this.progressThresholds) {
          if (depth >= threshold && !this.reportedThresholds.has(threshold)) {
            this.reportedThresholds.add(threshold);
            try {
              this.progressCallback(this.snapshotCurrentEval(), threshold);
            } catch {
              // Progress callback errors should not break evaluation
            }
          }
        }
      }
    }
  }

  private snapshotCurrentEval(): EvaluationResult {
    const pv1 = this.pvData.get(1);
    const score: EvalScore = pv1?.score ?? { type: "cp", value: 0 };
    const depth = pv1?.depth ?? 0;
    const bestLine = pv1 ? this.uciMovesToSan(this.currentFen, pv1.pv) : [];

    const engineLines: EngineLineInfo[] = [];
    for (let i = 1; i <= 3; i++) {
      const pvEntry = this.pvData.get(i);
      if (!pvEntry) break;
      engineLines.push({
        score: pvEntry.score,
        moves: this.uciMovesToSan(this.currentFen, pvEntry.pv),
        depth: pvEntry.depth,
      });
    }

    return { score, bestLine, depth, engineLines };
  }

  private handleProcessExit(code: number | null, signal: string | null): void {
    this._isReady = false;
    const err = new Error(
      `Stockfish process exited unexpectedly (code: ${code}, signal: ${signal})`,
    );

    if (this.evalReject) {
      this.evalReject(err);
      this.evalResolve = null;
      this.evalReject = null;
      this.evaluating = false;
    }
    if (this.pendingLine) {
      this.pendingLine.reject(err);
      this.pendingLine = null;
    }
    if (this.process) {
      this.detachProcessListeners(this.process);
    }
    this.process = null;
  }

  private detachProcessListeners(process: ChildProcess): void {
    if (this.processErrorHandler) {
      process.removeListener("error", this.processErrorHandler);
      this.processErrorHandler = null;
    }
    if (this.processExitHandler) {
      process.removeListener("exit", this.processExitHandler);
      this.processExitHandler = null;
    }
    if (this.stdoutDataHandler && process.stdout) {
      process.stdout.removeListener("data", this.stdoutDataHandler);
      this.stdoutDataHandler = null;
    }
  }

  private parseIntToken(line: string, token: string): number | null {
    const idx = line.indexOf(` ${token} `);
    if (idx === -1) return null;
    const start = idx + token.length + 2;
    const end = line.indexOf(" ", start);
    const str = end === -1 ? line.slice(start) : line.slice(start, end);
    const num = parseInt(str, 10);
    return isNaN(num) ? null : num;
  }

  private parseScore(line: string): EvalScore | null {
    const idx = line.indexOf(" score ");
    if (idx === -1) return null;
    const afterScore = line.slice(idx + 7);
    let scoreType: "cp" | "mate";
    if (afterScore.startsWith("cp ")) {
      scoreType = "cp";
    } else if (afterScore.startsWith("mate ")) {
      scoreType = "mate";
    } else {
      return null;
    }
    const valueStart = scoreType.length + 1;
    const valueEnd = afterScore.indexOf(" ", valueStart);
    const str =
      valueEnd === -1 ? afterScore.slice(valueStart) : afterScore.slice(valueStart, valueEnd);
    const value = parseInt(str, 10);
    if (isNaN(value)) return null;
    return { type: scoreType, value };
  }

  private parsePv(line: string): string[] {
    const idx = line.indexOf(" pv ");
    if (idx === -1) return [];
    return line
      .slice(idx + 4)
      .trim()
      .split(/\s+/);
  }

  private isInvalidPositionLine(line: string): boolean {
    return /(?:invalid|illegal).*(?:fen|position)|(?:fen|position).*(?:invalid|illegal)/i.test(
      line,
    );
  }

  private uciMovesToSan(fen: string, uciMoves: string[]): string[] {
    const chess = new Chess(fen);
    const san: string[] = [];

    for (const uciMove of uciMoves) {
      const from = uciMove.slice(0, 2);
      const to = uciMove.slice(2, 4);
      const promotion = uciMove[4] as "q" | "r" | "b" | "n" | undefined;

      try {
        const result = chess.move({ from, to, promotion });
        if (result) {
          san.push(result.san);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    return san;
  }
}
