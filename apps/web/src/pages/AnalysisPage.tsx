import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams } from "react-router";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import { useGetGameQuery, useGetMyGamesQuery, useGetAnalysisQuery } from "../store/apiSlice.js";
import { treeToPositions } from "../services/analysisSerializer.js";
import { AnalysisMoveList } from "../components/AnalysisMoveList.js";
import { StockfishService } from "../services/stockfish.js";
import { analyzeGame } from "../services/analysis.js";
import { EvalBar } from "../components/EvalBar.js";
import type {
  GameStatus,
  GameResponse,
  AnalyzedPosition,
  EvalScore,
  MoveClassification,
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

  const currentFen = fens[currentMoveIndex] ?? fens[0];

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

  const currentEval: EvalScore | null = positions?.[currentMoveIndex]?.evaluation.score ?? null;

  const classifications: (MoveClassification | null)[] | undefined = positions
    ? positions.map((p) => p.classification)
    : undefined;

  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentMoveIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentMoveIndex((prev) => Math.min(moves.length, prev + 1));
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
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "200px" }}>
          <AnalysisMoveList
            moves={moves}
            currentMoveIndex={currentMoveIndex}
            onMoveClick={setCurrentMoveIndex}
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
