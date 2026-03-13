import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useParams } from "react-router";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import {
  useGetGameQuery,
  useGetMyGamesQuery,
  useGetAnalysisQuery,
  useServerAnalyzeMutation,
  useEvaluatePositionMutation,
} from "../store/apiSlice.js";
import { treeToPositions } from "../services/analysisSerializer.js";
import { AnalysisMoveList } from "../components/AnalysisMoveList.js";
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

function getAnalysisErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return "Failed to analyze game.";
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

  return "Failed to analyze game.";
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

function AnalysisContent({ game }: { game: GameResponse }) {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [positions, setPositions] = useState<AnalyzedPosition[] | null>(null);
  const [whiteAccuracy, setWhiteAccuracy] = useState<number | null>(null);
  const [blackAccuracy, setBlackAccuracy] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [variation, setVariation] = useState<VariationState | null>(null);
  const [serverAnalyze] = useServerAnalyzeMutation();
  const [_evaluatePosition] = useEvaluatePositionMutation();

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
    if (storedAnalysis && analysisState === "idle") {
      const restoredPositions = treeToPositions(storedAnalysis.analysisTree);
      setPositions(restoredPositions);
      setWhiteAccuracy(storedAnalysis.whiteAccuracy);
      setBlackAccuracy(storedAnalysis.blackAccuracy);
      setAnalyzeError(null);
      setAnalysisState("complete");
    }
  }, [storedAnalysis, analysisState]);

  const handleAnalyze = useCallback(async () => {
    if (analysisState !== "idle") return;

    setAnalysisState("running");
    setAnalyzeError(null);

    try {
      const result = await serverAnalyze(game.id).unwrap();
      setPositions(result.positions);
      setWhiteAccuracy(result.whiteAccuracy);
      setBlackAccuracy(result.blackAccuracy);
      setVariation(null);
      setAnalysisState("complete");
    } catch (error) {
      setAnalyzeError(getAnalysisErrorMessage(error));
      setAnalysisState("idle");
    }
  }, [analysisState, game.id, serverAnalyze]);

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
      data-testid="analysis-page"
      style={{ padding: "16px", maxWidth: "1000px", margin: "0 auto" }}
    >
      <h1>Game Analysis</h1>
      <div data-testid="analysis-players" style={{ fontSize: "14px", marginBottom: "8px" }}>
        {game.players.white?.userId ? (
          <Link
            to={`/profile/${game.players.white.userId}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {game.players.white.username ?? `User #${game.players.white.userId}`}
          </Link>
        ) : (
          `User #${game.players.white?.userId ?? "?"}`
        )}
        {" vs "}
        {game.players.black?.userId ? (
          <Link
            to={`/profile/${game.players.black.userId}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {game.players.black.username ?? `User #${game.players.black.userId}`}
          </Link>
        ) : (
          `User #${game.players.black?.userId ?? "?"}`
        )}
      </div>
      <div style={{ display: "flex", gap: "24px" }}>
        {currentEval && <EvalBar score={currentEval} />}
        <div
          ref={containerRef}
          data-testid="analysis-board"
          style={{ width: "400px", height: "400px", flexShrink: 0 }}
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
          {(analysisState === "idle" || analysisState === "running") && !analysisLoading && (
            <button
              data-testid="analyze-button"
              onClick={handleAnalyze}
              disabled={analysisState === "running"}
              style={{
                backgroundColor: "#4CAF50",
                color: "white",
                padding: "12px 24px",
                border: "none",
                borderRadius: "4px",
                fontSize: "16px",
                fontWeight: "bold",
                cursor: analysisState === "running" ? "default" : "pointer",
                opacity: analysisState === "running" ? 0.7 : 1,
              }}
            >
              {analysisState === "running" ? "Analyzing..." : "Analyze"}
            </button>
          )}
          {analysisState === "running" && (
            <div data-testid="analysis-progress" style={{ fontSize: "14px", color: "#666" }}>
              Analyzing game on the server...
            </div>
          )}
          {analysisState === "complete" && whiteAccuracy !== null && blackAccuracy !== null && (
            <div data-testid="accuracy-display" style={{ fontSize: "14px", fontWeight: "bold" }}>
              White: {whiteAccuracy.toFixed(1)}% — Black: {blackAccuracy.toFixed(1)}%
            </div>
          )}
          {analyzeError && (
            <div
              data-testid="analysis-error-message"
              style={{ fontSize: "14px", color: "#d32f2f" }}
            >
              {analyzeError}
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
