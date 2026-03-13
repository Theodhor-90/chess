import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import type { DrawShape } from "chessground/draw";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import { AnalysisMoveList } from "../components/AnalysisMoveList.js";
import { EvalBar } from "../components/EvalBar.js";
import { EngineLinesPanel } from "../components/EngineLinesPanel.js";
import { useEvaluatePositionMutation, useGetMyGamesQuery } from "../store/apiSlice.js";
import type { EvalScore, EngineLineInfo } from "@chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function toDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const move of chess.moves({ verbose: true })) {
    const from = move.from as Key;
    const existing = dests.get(from);
    if (existing) {
      existing.push(move.to as Key);
    } else {
      dests.set(from, [move.to as Key]);
    }
  }
  return dests;
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

function getEvaluationErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return "Failed to evaluate position.";
  }

  const status = (error as { status?: number }).status;
  const data = (error as { data?: unknown }).data;

  if (status === 503) {
    return "Engine analysis is currently unavailable.";
  }

  if (typeof data === "object" && data !== null && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return "Failed to evaluate position.";
}

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
  const [moves, setMoves] = useState<string[]>([]);
  const [fens, setFens] = useState<string[]>([STARTING_FEN]);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [currentEval, setCurrentEval] = useState<EvalScore | null>(null);
  const [currentEngineLines, setCurrentEngineLines] = useState<EngineLineInfo[] | undefined>(
    undefined,
  );
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluatePosition] = useEvaluatePositionMutation();
  const evalRequestId = useRef(0);

  const currentFen = fens[currentMoveIndex] ?? STARTING_FEN;
  const turnColor = currentFen.includes(" w ") ? "white" : "black";

  useEffect(() => {
    const id = ++evalRequestId.current;
    setIsEvaluating(true);
    setEvaluationError(null);

    const timeout = window.setTimeout(async () => {
      if (evalRequestId.current !== id) return;

      try {
        const result = await evaluatePosition({ fen: currentFen }).unwrap();
        if (evalRequestId.current !== id) return;
        setCurrentEval(result.score);
        setCurrentEngineLines(result.engineLines);
        setIsEvaluating(false);
      } catch (error) {
        if (evalRequestId.current !== id) return;
        setCurrentEval(null);
        setCurrentEngineLines(undefined);
        setEvaluationError(getEvaluationErrorMessage(error));
        setIsEvaluating(false);
      }
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [currentFen, evaluatePosition]);

  const dests = useMemo(() => {
    const chess = new Chess(currentFen);
    return toDests(chess);
  }, [currentFen]);

  const arrowShapes = useMemo(() => {
    return computeArrowShapes(currentEngineLines, currentFen);
  }, [currentEngineLines, currentFen]);

  const onMove = useCallback(
    (orig: Key, dest: Key) => {
      const chess = new Chess(currentFen);
      const piece = chess.get(orig as Parameters<typeof chess.get>[0]);
      const isPromotion = piece?.type === "p" && (dest[1] === "8" || dest[1] === "1");

      const result = chess.move({
        from: orig,
        to: dest,
        promotion: isPromotion ? "q" : undefined,
      });

      if (!result) return;

      // If we're not at the end of the move list, truncate future moves
      const newMoves = [...moves.slice(0, currentMoveIndex), result.san];
      const newFens = [...fens.slice(0, currentMoveIndex + 1), chess.fen()];

      setMoves(newMoves);
      setFens(newFens);
      setCurrentMoveIndex(newMoves.length);
      setCurrentEval(null);
      setCurrentEngineLines(undefined);
      setEvaluationError(null);
    },
    [currentFen, moves, fens, currentMoveIndex],
  );

  const handleUndo = useCallback(() => {
    if (moves.length === 0) return;
    const newMoves = moves.slice(0, -1);
    const newFens = fens.slice(0, -1);
    setMoves(newMoves);
    setFens(newFens);
    setCurrentMoveIndex(newMoves.length);
    setCurrentEval(null);
    setCurrentEngineLines(undefined);
    setEvaluationError(null);
  }, [moves, fens]);

  const handleReset = useCallback(() => {
    setMoves([]);
    setFens([STARTING_FEN]);
    setCurrentMoveIndex(0);
    setCurrentEval(null);
    setCurrentEngineLines(undefined);
    setEvaluationError(null);
  }, []);

  const handleLineSelect = useCallback(
    (lineIndex: number) => {
      if (!currentEngineLines || !currentEngineLines[lineIndex]) return;
      const line = currentEngineLines[lineIndex];
      if (line.moves.length === 0) return;

      // Play the first move of the engine line
      const chess = new Chess(currentFen);
      const result = chess.move(line.moves[0]);
      if (!result) return;

      const newMoves = [...moves.slice(0, currentMoveIndex), result.san];
      const newFens = [...fens.slice(0, currentMoveIndex + 1), chess.fen()];

      setMoves(newMoves);
      setFens(newFens);
      setCurrentMoveIndex(newMoves.length);
      setCurrentEval(null);
      setCurrentEngineLines(undefined);
      setEvaluationError(null);
    },
    [currentEngineLines, currentFen, moves, fens, currentMoveIndex],
  );

  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentMoveIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === "ArrowRight") {
        setCurrentMoveIndex((prev) => Math.min(moves.length, prev + 1));
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [moves.length]);

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen: currentFen,
      orientation: "white",
      viewOnly: false,
      movable: {
        free: false,
        color: "both",
        dests,
        showDests: true,
        events: { after: onMove },
      },
      animation: { enabled: true, duration: 200 },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  // Update Chessground when state changes
  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.set({
      fen: currentFen,
      turnColor,
      viewOnly: false,
      movable: {
        free: false,
        color: "both",
        dests,
        showDests: true,
        events: { after: onMove },
      },
      drawable: { autoShapes: arrowShapes },
    });
  }, [currentFen, turnColor, dests, onMove, arrowShapes]);

  return (
    <div
      data-testid="training-page"
      style={{ padding: "16px", maxWidth: "1000px", margin: "0 auto" }}
    >
      <h1>Training Board</h1>
      <div style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
        <button
          data-testid="undo-button"
          onClick={handleUndo}
          disabled={moves.length === 0}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            cursor: moves.length === 0 ? "default" : "pointer",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "#f5f5f5",
          }}
        >
          Undo
        </button>
        <button
          data-testid="reset-button"
          onClick={handleReset}
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
      <div style={{ display: "flex", gap: "24px" }}>
        {currentEval ? (
          <EvalBar score={currentEval} />
        ) : (
          <div style={{ width: 30, minHeight: 400 }} />
        )}
        <div
          ref={containerRef}
          data-testid="training-board"
          style={{ width: "400px", height: "400px", flexShrink: 0 }}
        />
        <EngineLinesPanel engineLines={currentEngineLines} onLineSelect={handleLineSelect} />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "200px" }}>
          <AnalysisMoveList
            moves={moves}
            currentMoveIndex={currentMoveIndex}
            onMoveClick={(index: number) => {
              setCurrentMoveIndex(index);
            }}
            classifications={undefined}
          />
          {isEvaluating && (
            <div data-testid="engine-loading" style={{ fontSize: "14px", color: "#666" }}>
              Analyzing position...
            </div>
          )}
          {evaluationError && (
            <div data-testid="engine-error" style={{ fontSize: "14px", color: "#d32f2f" }}>
              {evaluationError}
            </div>
          )}
          {!isEvaluating && !evaluationError && moves.length === 0 && (
            <div style={{ fontSize: "14px", color: "#666" }}>
              Make a move on the board to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
