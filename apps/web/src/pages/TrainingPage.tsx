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
import { StockfishService } from "../services/stockfish.js";
import { EvalBar } from "../components/EvalBar.js";
import { EngineLinesPanel } from "../components/EngineLinesPanel.js";
import { useGetMyGamesQuery } from "../store/apiSlice.js";
import type { EvalScore, EngineLineInfo, EvaluationResult } from "@chess/shared";

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
  const chessRef = useRef(new Chess());
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [moves, setMoves] = useState<string[]>([]);
  const [fens, setFens] = useState<string[]>([STARTING_FEN]);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const stockfishRef = useRef<StockfishService | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [currentEval, setCurrentEval] = useState<EvalScore | null>(null);
  const [currentEngineLines, setCurrentEngineLines] = useState<EngineLineInfo[] | undefined>(
    undefined,
  );
  const evalRequestId = useRef(0);

  const currentFen = fens[currentMoveIndex] ?? STARTING_FEN;
  const turnColor = currentFen.includes(" w ") ? "white" : "black";

  // Initialize Stockfish once
  useEffect(() => {
    const service = new StockfishService();
    stockfishRef.current = service;
    service.ready.then(() => setEngineReady(true)).catch(() => {});
    return () => {
      service.destroy();
      stockfishRef.current = null;
    };
  }, []);

  // Run live evaluation whenever currentFen changes
  useEffect(() => {
    if (!engineReady || !stockfishRef.current) return;

    const id = ++evalRequestId.current;
    const service = stockfishRef.current;

    // Stop any in-progress eval
    service.stop();

    // Small delay to let the stop settle before starting new eval
    const timeout = setTimeout(async () => {
      if (evalRequestId.current !== id) return;
      try {
        const result: EvaluationResult = await service.evaluate(currentFen);
        if (evalRequestId.current !== id) return;
        setCurrentEval(result.score);
        setCurrentEngineLines(result.engineLines);
      } catch {
        // Evaluation was cancelled or engine destroyed — ignore
      }
    }, 50);

    return () => clearTimeout(timeout);
  }, [currentFen, engineReady]);

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

      // Update the main chess instance
      chessRef.current = chess;

      // Clear eval for new position (will be recalculated by effect)
      setCurrentEval(null);
      setCurrentEngineLines(undefined);
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
    const chess = new Chess(newFens[newFens.length - 1]);
    chessRef.current = chess;
  }, [moves, fens]);

  const handleReset = useCallback(() => {
    chessRef.current = new Chess();
    setMoves([]);
    setFens([STARTING_FEN]);
    setCurrentMoveIndex(0);
    setCurrentEval(null);
    setCurrentEngineLines(undefined);
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
      chessRef.current = chess;
      setCurrentEval(null);
      setCurrentEngineLines(undefined);
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
        {currentEval && <EvalBar score={currentEval} />}
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
          {!engineReady && (
            <div data-testid="engine-loading" style={{ fontSize: "14px", color: "#666" }}>
              Loading engine...
            </div>
          )}
          {engineReady && moves.length === 0 && (
            <div style={{ fontSize: "14px", color: "#666" }}>
              Make a move on the board to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
