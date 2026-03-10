import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import { AnalysisMoveList } from "../components/AnalysisMoveList.js";
import { StockfishService } from "../services/stockfish.js";
import { analyzeGame } from "../services/analysis.js";
import { EvalBar } from "../components/EvalBar.js";
import { EngineLinesPanel } from "../components/EngineLinesPanel.js";
import { useGetMyGamesQuery } from "../store/apiSlice.js";
import type {
  AnalyzedPosition,
  EvalScore,
  MoveClassification,
  EngineLineInfo,
} from "@chess/shared";

type AnalysisState = "idle" | "running" | "complete";

interface VariationState {
  branchMoveIndex: number;
  line: EngineLineInfo;
  fens: string[];
  stepIndex: number;
}

function computeVariationFens(branchFen: string, sanMoves: string[]): string[] {
  const chess = new Chess(branchFen);
  const result: string[] = [];
  for (const san of sanMoves) {
    const move = chess.move(san);
    if (!move) break;
    result.push(chess.fen());
  }
  return result;
}

function computeArrowShapes(engineLines: EngineLineInfo[] | undefined, fen: string): DrawShape[] {
  if (!engineLines || engineLines.length === 0) return [];

  const shapes: DrawShape[] = [];
  const chess = new Chess(fen);

  for (let i = 0; i < engineLines.length && i < 3; i++) {
    const line = engineLines[i];
    if (line.moves.length === 0) continue;

    const san = line.moves[0];
    try {
      const moveResult = chess.move(san);
      if (moveResult) {
        shapes.push({
          orig: moveResult.from,
          dest: moveResult.to,
          brush: i === 0 ? "green" : "blue",
        });
        chess.undo();
      }
    } catch {
      // Invalid move for this position — skip
    }
  }

  return shapes;
}

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function TrainingPage() {
  const { data: myGames, isLoading: gamesLoading } = useGetMyGamesQuery();

  const hasActiveGame = myGames?.some((g) => g.status === "active") ?? false;

  if (gamesLoading) {
    return <div data-testid="training-loading">Loading...</div>;
  }

  if (hasActiveGame) {
    return (
      <div
        data-testid="active-game-guard"
        style={{ padding: "16px", maxWidth: "800px", margin: "0 auto" }}
      >
        Can&apos;t use the analysis board while playing a game.
      </div>
    );
  }

  return <TrainingContent />;
}

function TrainingContent() {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [positions, setPositions] = useState<AnalyzedPosition[] | null>(null);
  const [whiteAccuracy, setWhiteAccuracy] = useState<number | null>(null);
  const [blackAccuracy, setBlackAccuracy] = useState<number | null>(null);
  const stockfishRef = useRef<StockfishService | null>(null);
  const [variation, setVariation] = useState<VariationState | null>(null);
  const [pgn, setPgn] = useState("");

  const { moves, fens } = useMemo(() => {
    if (!pgn) {
      return { moves: [] as string[], fens: [STARTING_FEN] };
    }
    const chess = new Chess();
    try {
      chess.loadPgn(pgn);
    } catch {
      return { moves: [] as string[], fens: [STARTING_FEN] };
    }
    const history = chess.history();
    const replayChess = new Chess();
    const fenList = [replayChess.fen()];
    for (const san of history) {
      replayChess.move(san);
      fenList.push(replayChess.fen());
    }
    return { moves: history, fens: fenList };
  }, [pgn]);

  const handleLineSelect = useCallback(
    (lineIndex: number) => {
      const engineLines = positions?.[currentMoveIndex]?.evaluation.engineLines;
      if (!engineLines || !engineLines[lineIndex]) return;

      const line = engineLines[lineIndex];
      const branchFen = fens[currentMoveIndex];
      const variationFens = computeVariationFens(branchFen, line.moves);

      if (variationFens.length === 0) return;

      setVariation({
        branchMoveIndex: currentMoveIndex,
        line,
        fens: variationFens,
        stepIndex: 0,
      });
    },
    [positions, currentMoveIndex, fens],
  );

  const currentFen = variation
    ? variation.stepIndex === -1
      ? (fens[variation.branchMoveIndex] ?? fens[0])
      : (variation.fens[variation.stepIndex] ?? fens[variation.branchMoveIndex] ?? fens[0])
    : (fens[currentMoveIndex] ?? fens[0]);

  useEffect(() => {
    return () => {
      if (stockfishRef.current) {
        stockfishRef.current.destroy();
        stockfishRef.current = null;
      }
    };
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (analysisState !== "idle") return;

    setAnalysisState("running");

    const service = new StockfishService();
    stockfishRef.current = service;

    try {
      await service.ready;

      const result = await analyzeGame(service, fens, moves, (current, total) => {
        setProgress({ current, total });
      });

      setPositions(result.positions);
      setWhiteAccuracy(result.whiteAccuracy);
      setBlackAccuracy(result.blackAccuracy);
      setAnalysisState("complete");
    } catch {
      setAnalysisState("idle");
    }
  }, [analysisState, fens, moves]);

  const handleLoadPgn = useCallback(() => {
    setAnalysisState("idle");
    setPositions(null);
    setWhiteAccuracy(null);
    setBlackAccuracy(null);
    setProgress(null);
    setVariation(null);
    setCurrentMoveIndex(0);
    if (stockfishRef.current) {
      stockfishRef.current.destroy();
      stockfishRef.current = null;
    }
  }, []);

  const currentEval: EvalScore | null = variation
    ? variation.line.score
    : (positions?.[currentMoveIndex]?.evaluation.score ?? null);
  const currentEngineLines = variation
    ? positions?.[variation.branchMoveIndex]?.evaluation.engineLines
    : positions?.[currentMoveIndex]?.evaluation.engineLines;
  const arrowShapes = useMemo(() => {
    if (variation) return [];
    return computeArrowShapes(currentEngineLines, currentFen);
  }, [variation, currentEngineLines, currentFen]);

  const classifications: (MoveClassification | null)[] | undefined = positions
    ? positions.map((p) => p.classification)
    : undefined;

  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (variation) {
          setVariation(null);
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        if (variation) {
          if (variation.stepIndex <= 0) {
            setVariation(null);
          } else {
            setVariation((prev) => (prev ? { ...prev, stepIndex: prev.stepIndex - 1 } : null));
          }
        } else {
          setCurrentMoveIndex((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      if (e.key === "ArrowRight") {
        if (variation) {
          setVariation((prev) =>
            prev && prev.stepIndex < prev.fens.length - 1
              ? { ...prev, stepIndex: prev.stepIndex + 1 }
              : prev,
          );
        } else {
          setCurrentMoveIndex((prev) => Math.min(moves.length, prev + 1));
        }
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [moves.length, variation]);

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen: currentFen,
      orientation: "white",
      viewOnly: true,
      animation: { enabled: true, duration: 200 },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  // Update board position and arrows
  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.set({
      fen: currentFen,
      drawable: { autoShapes: arrowShapes },
    });
  }, [currentFen, arrowShapes]);

  return (
    <div
      data-testid="training-page"
      style={{ padding: "16px", maxWidth: "1000px", margin: "0 auto" }}
    >
      <h1>Training Board</h1>
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor="pgn-input"
          style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}
        >
          Paste PGN to analyze:
        </label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            id="pgn-input"
            data-testid="pgn-input"
            type="text"
            placeholder="e.g. 1. e4 e5 2. Nf3 Nc6"
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "14px",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />
          <button
            data-testid="load-pgn-button"
            onClick={handleLoadPgn}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              cursor: "pointer",
              borderRadius: "4px",
              border: "1px solid #ccc",
              background: "#f5f5f5",
            }}
          >
            Reset
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: "24px" }}>
        {currentEval && <EvalBar score={currentEval} />}
        <div
          ref={containerRef}
          data-testid="training-board"
          style={{ width: "400px", height: "400px" }}
        />
        <EngineLinesPanel engineLines={currentEngineLines} onLineSelect={handleLineSelect} />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "200px" }}>
          {variation && (
            <div
              data-testid="variation-indicator"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                backgroundColor: "#e8f0fe",
                borderRadius: "4px",
                fontSize: "13px",
              }}
            >
              <span style={{ color: "#1a73e8" }}>Viewing engine line</span>
              <button
                data-testid="back-to-main-line"
                onClick={() => setVariation(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#1a73e8",
                  cursor: "pointer",
                  fontSize: "13px",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Back to main line
              </button>
            </div>
          )}
          <AnalysisMoveList
            moves={moves}
            currentMoveIndex={currentMoveIndex}
            onMoveClick={(index: number) => {
              setVariation(null);
              setCurrentMoveIndex(index);
            }}
            classifications={classifications}
          />
          {analysisState === "idle" && moves.length > 0 && (
            <button
              data-testid="analyze-button"
              onClick={handleAnalyze}
              style={{
                backgroundColor: "#4CAF50",
                color: "white",
                padding: "12px 24px",
                border: "none",
                borderRadius: "4px",
                fontSize: "16px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Analyze
            </button>
          )}
          {analysisState === "idle" && moves.length === 0 && (
            <div style={{ fontSize: "14px", color: "#666" }}>Paste a PGN above to get started.</div>
          )}
          {analysisState === "running" && progress && (
            <div data-testid="analysis-progress" style={{ fontSize: "14px", color: "#666" }}>
              Analyzing move {progress.current}/{progress.total}...
            </div>
          )}
          {analysisState === "complete" && whiteAccuracy !== null && blackAccuracy !== null && (
            <div data-testid="accuracy-display" style={{ fontSize: "14px", fontWeight: "bold" }}>
              White: {whiteAccuracy.toFixed(1)}% — Black: {blackAccuracy.toFixed(1)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
