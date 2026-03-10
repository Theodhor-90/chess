import { Chess } from "chess.js";
import type { EvalScore, EvaluationResult, EngineLineInfo } from "@chess/shared";

export class StockfishService {
  readonly ready: Promise<void>;

  private worker: Worker;
  private evaluating = false;
  private onUciOutput: ((line: string) => void) | null = null;
  private readyResolve!: () => void;
  private readyReject!: (err: Error) => void;
  private evalReject: ((err: Error) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("../workers/stockfish.worker.ts", import.meta.url), {
      type: "module",
    });

    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; data?: string; message?: string };
      switch (msg.type) {
        case "ready":
          this.readyResolve();
          break;
        case "uci-output":
          if (this.onUciOutput && msg.data) {
            this.onUciOutput(msg.data);
          }
          break;
        case "error":
          this.readyReject(new Error(msg.message ?? "Stockfish error"));
          if (this.evalReject) {
            this.evalReject(new Error(msg.message ?? "Stockfish error"));
            this.evalReject = null;
            this.onUciOutput = null;
            this.evaluating = false;
          }
          break;
      }
    };
  }

  async evaluate(fen: string): Promise<EvaluationResult> {
    await this.ready;

    if (this.evaluating) {
      throw new Error("Evaluation already in progress");
    }

    this.evaluating = true;

    return new Promise<EvaluationResult>((resolve, reject) => {
      this.evalReject = reject;

      const pvData = new Map<number, { depth: number; score: EvalScore; pv: string[] }>();

      this.onUciOutput = (line: string) => {
        if (line.startsWith("bestmove")) {
          this.onUciOutput = null;
          this.evalReject = null;
          this.evaluating = false;

          const top = pvData.get(1);
          const bestScore: EvalScore = top?.score ?? { type: "cp", value: 0 };
          const bestLine = top ? this.pvToSan(fen, top.pv) : [];
          const bestDepth = top?.depth ?? 0;

          const engineLines: EngineLineInfo[] = [];
          for (let i = 1; i <= 3; i++) {
            const entry = pvData.get(i);
            if (!entry) break;
            engineLines.push({
              score: entry.score,
              moves: this.pvToSan(fen, entry.pv),
              depth: entry.depth,
            });
          }

          resolve({ score: bestScore, bestLine, depth: bestDepth, engineLines });
          return;
        }

        if (!line.startsWith("info") || !line.includes(" score ") || !line.includes(" pv ")) {
          return;
        }

        const depth = this.parseIntAfter(line, "depth");
        if (depth === null) {
          return;
        }

        const scoreType = this.parseScoreType(line);
        const scoreValue = this.parseScoreValue(line);
        if (scoreType === null || scoreValue === null) {
          return;
        }

        const pv = this.parsePv(line);
        if (pv.length === 0) {
          return;
        }

        let multipvIndex = this.parseIntAfter(line, "multipv");
        if (multipvIndex === null) {
          multipvIndex = 1;
        }

        const existing = pvData.get(multipvIndex);
        if (existing && depth < existing.depth) {
          return;
        }

        pvData.set(multipvIndex, {
          depth,
          score: { type: scoreType, value: scoreValue },
          pv,
        });
      };

      this.worker.postMessage({ type: "uci-command", command: `position fen ${fen}` });
      this.worker.postMessage({ type: "uci-command", command: "go depth 18" });
    });
  }

  stop(): void {
    if (this.evaluating) {
      this.worker.postMessage({ type: "uci-command", command: "stop" });
    }
  }

  destroy(): void {
    this.worker.postMessage({ type: "uci-command", command: "quit" });
    this.worker.terminate();

    if (this.evalReject) {
      this.evalReject(new Error("StockfishService destroyed"));
      this.evalReject = null;
      this.onUciOutput = null;
      this.evaluating = false;
    }
  }

  private pvToSan(fen: string, pv: string[]): string[] {
    const chess = new Chess(fen);
    const san: string[] = [];

    for (const uciMove of pv) {
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

  private parseIntAfter(line: string, token: string): number | null {
    const idx = line.indexOf(` ${token} `);
    if (idx === -1) return null;
    const start = idx + token.length + 2;
    const end = line.indexOf(" ", start);
    const str = end === -1 ? line.slice(start) : line.slice(start, end);
    const num = parseInt(str, 10);
    return isNaN(num) ? null : num;
  }

  private parseScoreType(line: string): "cp" | "mate" | null {
    const idx = line.indexOf(" score ");
    if (idx === -1) return null;
    const afterScore = line.slice(idx + 7);
    if (afterScore.startsWith("cp ")) return "cp";
    if (afterScore.startsWith("mate ")) return "mate";
    return null;
  }

  private parseScoreValue(line: string): number | null {
    const idx = line.indexOf(" score ");
    if (idx === -1) return null;
    const afterScore = line.slice(idx + 7);
    const spaceIdx = afterScore.indexOf(" ");
    if (spaceIdx === -1) return null;
    const valueStart = spaceIdx + 1;
    const valueEnd = afterScore.indexOf(" ", valueStart);
    const str =
      valueEnd === -1 ? afterScore.slice(valueStart) : afterScore.slice(valueStart, valueEnd);
    const num = parseInt(str, 10);
    return isNaN(num) ? null : num;
  }

  private parsePv(line: string): string[] {
    const idx = line.indexOf(" pv ");
    if (idx === -1) return [];
    return line
      .slice(idx + 4)
      .trim()
      .split(/\s+/);
  }
}
