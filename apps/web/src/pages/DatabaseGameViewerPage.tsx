import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import { useGetDatabaseGameQuery, useGetMeQuery } from "../store/apiSlice.js";
import { connectSocket, getSocket } from "../socket.js";
import type { TypedSocket } from "../socket.js";
import { AnalysisMoveList } from "../components/AnalysisMoveList.js";
import { EvalBar } from "../components/EvalBar.js";
import { EngineLinesPanel } from "../components/EngineLinesPanel.js";
import type {
  DatabaseGame,
  AnalyzedPosition,
  EvalScore,
  MoveClassification,
  EngineLineInfo,
  PgnAnalysisProgressPayload,
} from "@chess/shared";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import styles from "./DatabaseGameViewerPage.module.css";

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

type AnalysisState = "idle" | "running" | "complete";

interface VariationState {
  branchMoveIndex: number;
  line: EngineLineInfo;
  fens: string[];
  stepIndex: number;
}

export function DatabaseGameViewerPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const gameId = Number(idParam);
  const {
    data: game,
    isLoading,
    isError,
  } = useGetDatabaseGameQuery(gameId, {
    skip: isNaN(gameId),
  });
  const { data: meData } = useGetMeQuery();
  const isAuthenticated = !!meData?.user;

  if (isNaN(gameId)) {
    return <div className={styles.statusMessage}>Invalid game ID</div>;
  }

  if (isLoading) {
    return (
      <div data-testid="db-viewer-loading" className={styles.statusMessage}>
        Loading game...
      </div>
    );
  }

  if (isError || !game) {
    return (
      <div data-testid="db-viewer-error" className={styles.statusMessage}>
        Game not found.
      </div>
    );
  }

  return <DatabaseGameViewer game={game} isAuthenticated={isAuthenticated} />;
}

function DatabaseGameViewer({
  game,
  isAuthenticated,
}: {
  game: DatabaseGame;
  isAuthenticated: boolean;
}) {
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [positions, setPositions] = useState<AnalyzedPosition[] | null>(null);
  const [whiteAccuracy, setWhiteAccuracy] = useState<number | null>(null);
  const [blackAccuracy, setBlackAccuracy] = useState<number | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [variation, setVariation] = useState<VariationState | null>(null);
  const [completedPositions, setCompletedPositions] = useState<number | null>(null);
  const [totalPositions, setTotalPositions] = useState<number | null>(null);
  const analysisRequestIdRef = useRef<string | null>(null);
  const analysisSocketRef = useRef<TypedSocket | null>(null);

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

  const handleProgress = useCallback((data: PgnAnalysisProgressPayload) => {
    if (data.requestId !== analysisRequestIdRef.current) return;
    setCompletedPositions(data.completedPositions);
    setTotalPositions(data.totalPositions);
  }, []);

  const handleComplete = useCallback((data: PgnAnalysisProgressPayload) => {
    if (data.requestId !== analysisRequestIdRef.current) return;
    setPositions(data.positions);
    setWhiteAccuracy(data.whiteAccuracy);
    setBlackAccuracy(data.blackAccuracy);
    setCompletedPositions(data.completedPositions);
    setTotalPositions(data.totalPositions);
    setAnalysisState("complete");
    analysisRequestIdRef.current = null;
  }, []);

  const handleError = useCallback((data: { requestId: string; error: string }) => {
    if (data.requestId !== analysisRequestIdRef.current) return;
    setAnalyzeError(data.error);
    setAnalysisState("idle");
    setCompletedPositions(null);
    setTotalPositions(null);
    analysisRequestIdRef.current = null;
  }, []);

  const detachAnalysisListeners = useCallback(() => {
    const socket = analysisSocketRef.current;
    if (!socket) return;

    socket.off("pgnAnalysisProgress", handleProgress);
    socket.off("pgnAnalysisComplete", handleComplete);
    socket.off("pgnAnalysisError", handleError);
    analysisSocketRef.current = null;
  }, [handleProgress, handleComplete, handleError]);

  const attachAnalysisListeners = useCallback(
    (socket: TypedSocket) => {
      if (analysisSocketRef.current === socket) return;

      detachAnalysisListeners();
      socket.on("pgnAnalysisProgress", handleProgress);
      socket.on("pgnAnalysisComplete", handleComplete);
      socket.on("pgnAnalysisError", handleError);
      analysisSocketRef.current = socket;
    },
    [detachAnalysisListeners, handleProgress, handleComplete, handleError],
  );

  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      attachAnalysisListeners(socket);
    }

    return () => {
      detachAnalysisListeners();
    };
  }, [attachAnalysisListeners, detachAnalysisListeners]);

  useEffect(() => {
    return () => {
      if (analysisRequestIdRef.current !== null) {
        const socket = getSocket();
        if (socket) {
          socket.emit("cancelPgnAnalysis", { requestId: analysisRequestIdRef.current });
        }
      }
    };
  }, []);

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

  const handleAnalyze = useCallback(() => {
    if (analysisState !== "idle") return;

    const socket = connectSocket();
    attachAnalysisListeners(socket);
    const requestId = `pgn-${game.id}-${Date.now()}`;
    setAnalysisState("running");
    setAnalyzeError(null);
    setCompletedPositions(null);
    setTotalPositions(null);
    setVariation(null);
    analysisRequestIdRef.current = requestId;
    socket.emit("analyzePgn", { pgn: game.pgn, requestId });
  }, [analysisState, attachAnalysisListeners, game.id, game.pgn]);

  const handleCancel = useCallback(() => {
    const socket = getSocket();
    if (socket && analysisRequestIdRef.current !== null) {
      socket.emit("cancelPgnAnalysis", { requestId: analysisRequestIdRef.current });
    }
    setAnalysisState("idle");
    setCompletedPositions(null);
    setTotalPositions(null);
    analysisRequestIdRef.current = null;
  }, []);

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

  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.set({
      fen: currentFen,
      drawable: { autoShapes: arrowShapes },
    });
  }, [currentFen, arrowShapes]);

  // Redraw Chessground when container resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      apiRef.current?.redrawAll();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div data-testid="db-game-viewer" className={styles.page}>
      <h1 className={styles.title}>Database Game</h1>

      <Card className={styles.metadata}>
        <div data-testid="db-game-metadata">
          <div className={styles.metadataPlayers}>
            {game.white} ({game.whiteElo}) vs {game.black} ({game.blackElo})
          </div>
          <div className={styles.metadataDetails}>
            {game.opening && (
              <span>
                {game.eco ? `${game.eco}: ` : ""}
                {game.opening} ·{" "}
              </span>
            )}
            <Badge
              variant={
                game.result === "1-0" ? "success" : game.result === "0-1" ? "danger" : "neutral"
              }
            >
              {game.result}
            </Badge>
            {game.date && <span> · {game.date}</span>}
            {game.timeControl && <span> · {game.timeControl}</span>}
            {game.termination && <span> · {game.termination}</span>}
          </div>
          <div>
            <a
              href={game.lichessUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="lichess-link"
              className={styles.lichessLink}
            >
              View on Lichess ↗
            </a>
          </div>
        </div>
      </Card>

      <div className={styles.layout}>
        <div className={styles.boardArea}>
          {currentEval && <EvalBar score={currentEval} />}
          <div ref={containerRef} data-testid="db-viewer-board" className={styles.board} />
        </div>
        <div className={styles.sidePanel}>
          <Card header="Engine Lines">
            <EngineLinesPanel engineLines={currentEngineLines} onLineSelect={handleLineSelect} />
          </Card>
          {variation && (
            <div data-testid="variation-indicator" className={styles.variationIndicator}>
              <span className={styles.variationLabel}>Viewing engine line</span>
              <button
                data-testid="back-to-main-line"
                onClick={() => setVariation(null)}
                className={styles.backToMainLine}
              >
                Back to main line
              </button>
            </div>
          )}
          <Card header="Moves">
            <AnalysisMoveList
              moves={moves}
              currentMoveIndex={currentMoveIndex}
              onMoveClick={(index: number) => {
                setVariation(null);
                setCurrentMoveIndex(index);
              }}
              classifications={classifications}
            />
          </Card>
          {analysisState === "idle" &&
            (isAuthenticated ? (
              <Button
                data-testid="analyze-pgn-button"
                onClick={handleAnalyze}
                variant="primary"
                size="lg"
              >
                Analyze with engine
              </Button>
            ) : (
              <div className={styles.loginPrompt}>
                <Link to="/login" className={styles.loginLink}>
                  Log in
                </Link>{" "}
                to analyze with engine
              </div>
            ))}
          {analysisState === "running" && (
            <div className={styles.buttonGroup}>
              <div data-testid="pgn-analysis-progress" className={styles.progressText}>
                {completedPositions !== null && totalPositions !== null
                  ? `Analyzing... ${completedPositions}/${totalPositions} positions`
                  : "Starting analysis..."}
              </div>
              <Button
                data-testid="cancel-pgn-analysis-button"
                onClick={handleCancel}
                variant="danger"
              >
                Cancel
              </Button>
            </div>
          )}
          {analysisState === "complete" && whiteAccuracy !== null && blackAccuracy !== null && (
            <div data-testid="pgn-accuracy-display" className={styles.accuracyDisplay}>
              <Badge variant="neutral">White: {whiteAccuracy.toFixed(1)}%</Badge>{" "}
              <Badge variant="neutral">Black: {blackAccuracy.toFixed(1)}%</Badge>
            </div>
          )}
          {analyzeError && (
            <div data-testid="pgn-analysis-error" className={styles.errorMessage}>
              {analyzeError}
            </div>
          )}
          <Link to="/database" className={styles.backLink}>
            ← Back to database
          </Link>
        </div>
      </div>
    </div>
  );
}
