import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "react-router";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import {
  useGetGameQuery,
  useGetMyGamesQuery,
  useGetAnalysisQuery,
  useSaveAnalysisMutation,
} from "../store/apiSlice.js";
import { treeToPositions, positionsToTree } from "../services/analysisSerializer.js";
import { AnalysisMoveList } from "../components/AnalysisMoveList.js";
import { StockfishService } from "../services/stockfish.js";
import { analyzeGame } from "../services/analysis.js";
import { EvalBar } from "../components/EvalBar.js";
import { EngineLinesPanel } from "../components/EngineLinesPanel.js";
import type {
  GameStatus,
  GameResponse,
  AnalyzedPosition,
  EvalScore,
  MoveClassification,
  EngineLineInfo,
} from "@chess/shared";

function isTerminalStatus(status: GameStatus): boolean {
  return (
    status === "checkmate" ||
    status === "stalemate" ||
    status === "resigned" ||
    status === "draw" ||
    status === "timeout"
  );
}

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

function AnalysisContent({ game }: { game: GameResponse }) {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [positions, setPositions] = useState<AnalyzedPosition[] | null>(null);
  const [whiteAccuracy, setWhiteAccuracy] = useState<number | null>(null);
  const [blackAccuracy, setBlackAccuracy] = useState<number | null>(null);
  const stockfishRef = useRef<StockfishService | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wasComputedLocally = useRef(false);
  const [variation, setVariation] = useState<VariationState | null>(null);
  const [saveAnalysis] = useSaveAnalysisMutation();

  const {
    data: storedAnalysis,
    isLoading: analysisLoading,
    isError: _analysisError,
  } = useGetAnalysisQuery(game.id);

  const { moves, fens } = useMemo(() => {
    if (!game.pgn) {
      return {
        moves: [] as string[],
        fens: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
      };
    }
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const history = chess.history();
    const replayChess = new Chess();
    const fenList = [replayChess.fen()];
    for (const san of history) {
      replayChess.move(san);
      fenList.push(replayChess.fen());
    }
    return { moves: history, fens: fenList };
  }, [game.pgn]);

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

  useEffect(() => {
    if (storedAnalysis && analysisState === "idle") {
      const restoredPositions = treeToPositions(storedAnalysis.analysisTree);
      setPositions(restoredPositions);
      setWhiteAccuracy(storedAnalysis.whiteAccuracy);
      setBlackAccuracy(storedAnalysis.blackAccuracy);
      setAnalysisState("complete");
    }
  }, [storedAnalysis, analysisState]);

  useEffect(() => {
    if (
      analysisState !== "complete" ||
      !positions ||
      whiteAccuracy === null ||
      blackAccuracy === null ||
      !wasComputedLocally.current
    ) {
      return;
    }

    const tree = positionsToTree(fens, moves, positions);

    saveAnalysis({
      gameId: game.id,
      body: {
        analysisTree: tree,
        whiteAccuracy,
        blackAccuracy,
        engineDepth: 18,
      },
    })
      .unwrap()
      .then(() => {
        setSaveError(null);
      })
      .catch(() => {
        setSaveError("Failed to save analysis results.");
      });
  }, [analysisState, positions, whiteAccuracy, blackAccuracy, fens, moves, game.id, saveAnalysis]);

  const handleAnalyze = useCallback(async () => {
    if (analysisState !== "idle") return;

    setAnalysisState("running");
    setSaveError(null);

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
      wasComputedLocally.current = true;
      setAnalysisState("complete");
    } catch {
      setAnalysisState("idle");
    }
  }, [analysisState, fens, moves]);

  const currentEval: EvalScore | null = variation
    ? variation.line.score
    : (positions?.[currentMoveIndex]?.evaluation.score ?? null);
  const currentEngineLines = variation
    ? positions?.[variation.branchMoveIndex]?.evaluation.engineLines
    : positions?.[currentMoveIndex]?.evaluation.engineLines;

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

  // Update board position
  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.set({ fen: currentFen });
  }, [currentFen]);

  return (
    <div
      data-testid="analysis-page"
      style={{ padding: "16px", maxWidth: "1000px", margin: "0 auto" }}
    >
      <h1>Game Analysis</h1>
      <div style={{ display: "flex", gap: "24px" }}>
        {currentEval && <EvalBar score={currentEval} />}
        <div
          ref={containerRef}
          data-testid="analysis-board"
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
          {analysisLoading && (
            <div data-testid="analysis-loading-stored" style={{ fontSize: "14px", color: "#666" }}>
              Loading saved analysis...
            </div>
          )}
          {analysisState === "idle" && !analysisLoading && (
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
          {saveError && (
            <div data-testid="save-error" style={{ fontSize: "14px", color: "#d32f2f" }}>
              {saveError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnalysisPage() {
  const { gameId: gameIdParam } = useParams<{ gameId: string }>();
  const gameId = Number(gameIdParam);

  const {
    data: game,
    isLoading: gameLoading,
    isError: gameError,
  } = useGetGameQuery(gameId, { skip: isNaN(gameId) });
  const { data: myGames, isLoading: gamesLoading } = useGetMyGamesQuery();

  if (isNaN(gameId)) {
    return <div>Invalid game ID</div>;
  }

  if (gameLoading || gamesLoading) {
    return <div data-testid="analysis-loading">Loading analysis...</div>;
  }

  if (gameError || !game) {
    return <div data-testid="analysis-error">Game not found.</div>;
  }

  const hasActiveGame = myGames?.some((g) => g.status === "active") ?? false;
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

  if (!isTerminalStatus(game.status)) {
    return (
      <div
        data-testid="analysis-not-completed"
        style={{ padding: "16px", maxWidth: "800px", margin: "0 auto" }}
      >
        This game is not completed.
      </div>
    );
  }

  return <AnalysisContent game={game} />;
}
