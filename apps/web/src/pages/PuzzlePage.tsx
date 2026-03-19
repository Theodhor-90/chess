import { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import { useBoardTheme } from "../components/BoardThemeProvider.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { PageSkeleton } from "../components/ui/Skeleton.js";
import { getNextPuzzle, submitPuzzleAttempt, getPuzzleStats } from "../api.js";
import type { Puzzle, PuzzleAttemptResponse, PuzzleStatsResponse } from "@chess/shared";
import styles from "./PuzzlePage.module.css";

type PuzzleState =
  | "loading"
  | "animatingSetup"
  | "userTurn"
  | "validating"
  | "animatingOpponent"
  | "solved"
  | "failed";

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

function uciToMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4) : undefined,
  };
}

function moveToUci(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ?? ""}`;
}

export function PuzzlePage() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [puzzleState, setPuzzleState] = useState<PuzzleState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attemptResult, setAttemptResult] = useState<PuzzleAttemptResponse | null>(null);
  const [userMoves, setUserMoves] = useState<string[]>([]);
  const [stats, setStats] = useState<PuzzleStatsResponse | null>(null);
  const [highlightSquares, setHighlightSquares] = useState<Map<Key, string>>(new Map());
  const [isReplaying, setIsReplaying] = useState(false);

  const chessRef = useRef<Chess | null>(null);
  const moveIndexRef = useRef(0);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { boardTheme, pieceTheme } = useBoardTheme();

  const themeClasses = [
    boardTheme !== "brown" ? `board-theme-${boardTheme}` : "",
    pieceTheme !== "cburnett" ? `piece-theme-${pieceTheme}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const loadPuzzle = useCallback(async () => {
    setPuzzleState("loading");
    setError(null);
    setAttemptResult(null);
    setUserMoves([]);
    setHighlightSquares(new Map());
    setIsReplaying(false);
    moveIndexRef.current = 0;
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    try {
      const data = await getNextPuzzle();
      setPuzzle(data.puzzle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load puzzle");
      setPuzzleState("loading");
    }
  }, []);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  useEffect(() => {
    getPuzzleStats().then(
      (data) => setStats(data),
      () => {
        /* ignore stats fetch errors — non-critical */
      },
    );
  }, []);

  useEffect(() => {
    if (!attemptResult) return;
    getPuzzleStats().then(
      (data) => setStats(data),
      () => {},
    );
  }, [attemptResult]);

  const orientation = puzzle ? (puzzle.fen.split(" ")[1] === "w" ? "black" : "white") : "white";

  const onUserMove = useCallback(
    (orig: Key, dest: Key) => {
      if (!puzzle || !chessRef.current) return;

      const piece = chessRef.current.get(orig as Parameters<typeof chessRef.current.get>[0]);
      const promotion =
        piece?.type === "p" && (dest[1] === "8" || dest[1] === "1") ? "q" : undefined;

      const userUci = moveToUci(orig, dest, promotion);
      const expectedIndex = moveIndexRef.current;
      const expectedUci = puzzle.moves[expectedIndex];
      const allUserMovesSoFar = [...userMoves, userUci];

      if (userUci !== expectedUci) {
        // Wrong move — red highlight on destination
        const incorrectHighlight = new Map<Key, string>();
        incorrectHighlight.set(dest, "incorrect-move");
        setHighlightSquares(incorrectHighlight);

        // Snap back: reset board to pre-move FEN (chess.js was NOT updated for wrong moves)
        if (apiRef.current && chessRef.current) {
          apiRef.current.set({
            fen: chessRef.current.fen(),
            highlight: { custom: incorrectHighlight },
            viewOnly: true,
            movable: { free: false, dests: new Map() },
          });
        }

        setPuzzleState("failed");
        setUserMoves(allUserMovesSoFar);

        submitPuzzleAttempt(puzzle.puzzleId, allUserMovesSoFar).then(
          (result) => setAttemptResult(result),
          () => {},
        );
        return;
      }

      // Correct move — apply to chess.js
      const moveData = uciToMove(userUci);
      chessRef.current.move({
        from: moveData.from,
        to: moveData.to,
        promotion: moveData.promotion,
      });
      setUserMoves(allUserMovesSoFar);
      moveIndexRef.current = expectedIndex + 1;

      // Green highlight on destination
      const correctHighlight = new Map<Key, string>();
      correctHighlight.set(dest, "correct-move");
      setHighlightSquares(correctHighlight);

      if (apiRef.current) {
        apiRef.current.set({
          highlight: { custom: correctHighlight },
        });
      }

      // Check if puzzle is complete
      if (moveIndexRef.current >= puzzle.moves.length) {
        setPuzzleState("solved");
        submitPuzzleAttempt(puzzle.puzzleId, allUserMovesSoFar).then(
          (result) => setAttemptResult(result),
          () => {},
        );

        if (apiRef.current) {
          apiRef.current.set({
            viewOnly: true,
            movable: { free: false, dests: new Map() },
          });
        }
        return;
      }

      // Opponent response move
      setPuzzleState("animatingOpponent");
      if (apiRef.current) {
        apiRef.current.set({
          viewOnly: true,
          movable: { free: false, dests: new Map() },
        });
      }

      const opponentUci = puzzle.moves[moveIndexRef.current];
      const opponentMove = uciToMove(opponentUci);

      setTimeout(() => {
        if (!chessRef.current || !apiRef.current) return;

        chessRef.current.move({
          from: opponentMove.from,
          to: opponentMove.to,
          promotion: opponentMove.promotion,
        });
        moveIndexRef.current += 1;

        const newFen = chessRef.current.fen();
        const newDests = toDests(chessRef.current);

        // Clear highlights for opponent's move
        setHighlightSquares(new Map());

        apiRef.current.set({
          fen: newFen,
          turnColor: orientation as "white" | "black",
          viewOnly: false,
          highlight: { custom: new Map() },
          movable: {
            free: false,
            color: orientation as "white" | "black",
            dests: newDests,
            showDests: true,
            events: { after: onUserMove },
          },
        });

        if (moveIndexRef.current >= puzzle.moves.length) {
          setPuzzleState("solved");
          submitPuzzleAttempt(puzzle.puzzleId, allUserMovesSoFar).then(
            (result) => setAttemptResult(result),
            () => {},
          );
          apiRef.current.set({
            viewOnly: true,
            movable: { free: false, dests: new Map() },
          });
        } else {
          setPuzzleState("userTurn");
        }
      }, 500);
    },
    [puzzle, userMoves, orientation],
  );

  const startSolutionReplay = useCallback(() => {
    if (!puzzle || !apiRef.current || isReplaying) return;

    // Reset board to the puzzle FEN, re-apply setup move, then step through remaining moves
    const chess = new Chess(puzzle.fen);
    chessRef.current = chess;
    setIsReplaying(true);
    setHighlightSquares(new Map());

    // Apply setup move (index 0)
    const setupMove = uciToMove(puzzle.moves[0]);
    chess.move({ from: setupMove.from, to: setupMove.to, promotion: setupMove.promotion });
    apiRef.current.set({
      fen: chess.fen(),
      viewOnly: true,
      highlight: { custom: new Map() },
      movable: { free: false, dests: new Map() },
    });

    let replayIndex = 1; // Start replaying from index 1 (first user move in solution)
    const timer = setInterval(() => {
      if (!chessRef.current || !apiRef.current || replayIndex >= puzzle.moves.length) {
        clearInterval(timer);
        replayTimerRef.current = null;
        setIsReplaying(false);
        return;
      }

      const uci = puzzle.moves[replayIndex];
      const move = uciToMove(uci);
      chessRef.current.move({ from: move.from, to: move.to, promotion: move.promotion });

      const highlight = new Map<Key, string>();
      highlight.set(move.to as Key, "correct-move");

      apiRef.current.set({
        fen: chessRef.current.fen(),
        highlight: { custom: highlight },
      });
      setHighlightSquares(highlight);

      replayIndex++;
    }, 500);

    replayTimerRef.current = timer;
  }, [puzzle, isReplaying]);

  useEffect(() => {
    if (!puzzle || !containerRef.current) return;

    const chess = new Chess(puzzle.fen);
    chessRef.current = chess;
    moveIndexRef.current = 1;

    const initialFen = puzzle.fen;
    apiRef.current = Chessground(containerRef.current, {
      fen: initialFen,
      orientation: orientation as "white" | "black",
      viewOnly: true,
      animation: { enabled: true, duration: 200 },
    });

    setPuzzleState("animatingSetup");

    const setupUci = puzzle.moves[0];
    const setupMove = uciToMove(setupUci);

    const timer = setTimeout(() => {
      if (!chessRef.current || !apiRef.current) return;

      chessRef.current.move({
        from: setupMove.from,
        to: setupMove.to,
        promotion: setupMove.promotion,
      });

      const newFen = chessRef.current.fen();
      const newDests = toDests(chessRef.current);

      apiRef.current.set({
        fen: newFen,
        turnColor: orientation as "white" | "black",
        viewOnly: false,
        movable: {
          free: false,
          color: orientation as "white" | "black",
          dests: newDests,
          showDests: true,
          events: {
            after: onUserMove,
          },
        },
      });

      setPuzzleState("userTurn");
    }, 500);

    return () => {
      clearTimeout(timer);
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      apiRef.current?.destroy();
      apiRef.current = null;
      chessRef.current = null;
    };
  }, [puzzle?.puzzleId]);

  useEffect(() => {
    if (!apiRef.current || puzzleState !== "userTurn" || !chessRef.current) return;
    const dests = toDests(chessRef.current);
    apiRef.current.set({
      movable: {
        events: { after: onUserMove },
        dests,
      },
      highlight: { custom: highlightSquares },
    });
  }, [onUserMove, puzzleState, highlightSquares]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      apiRef.current?.redrawAll();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (puzzleState === "loading" && !puzzle) {
    if (error) {
      return (
        <div className={styles.page}>
          <h1 className={styles.title}>Puzzles</h1>
          <div className={styles.emptyMessage} data-testid="puzzle-error">
            {error}
          </div>
        </div>
      );
    }
    return <PageSkeleton testId="puzzle-loading" />;
  }

  if (!puzzle) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Puzzles</h1>
        <div className={styles.emptyMessage} data-testid="puzzle-error">
          Failed to load puzzle
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="puzzle-page">
      <h1 className={styles.title}>Puzzles</h1>
      <div className={styles.layout}>
        <div className={styles.boardArea}>
          <div className={themeClasses || undefined}>
            <div ref={containerRef} data-testid="puzzle-board" className={styles.board} />
          </div>
        </div>
        <div className={styles.sidePanel}>
          <Card header="Puzzle Info">
            <div data-testid="puzzle-rating">
              <strong>Rating:</strong> {puzzle.rating}
            </div>
            {puzzle.themes.length > 0 && (
              <div className={styles.themeList} data-testid="puzzle-themes">
                {puzzle.themes.map((theme) => (
                  <Badge key={theme} variant="neutral" size="sm">
                    {theme}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <Card header="Status">
            {puzzleState === "animatingSetup" && (
              <div className={styles.statusText} data-testid="puzzle-status">
                Watch the opponent&apos;s move...
              </div>
            )}
            {puzzleState === "userTurn" && (
              <div className={styles.statusText} data-testid="puzzle-status">
                Your turn — find the best move
              </div>
            )}
            {puzzleState === "validating" && (
              <div className={styles.statusText} data-testid="puzzle-status">
                Checking...
              </div>
            )}
            {puzzleState === "animatingOpponent" && (
              <div className={styles.statusText} data-testid="puzzle-status">
                Opponent responds...
              </div>
            )}
            {puzzleState === "solved" && (
              <div data-testid="puzzle-solved">
                <div className={`${styles.banner} ${styles.bannerSuccess}`}>Puzzle Solved!</div>
                {attemptResult && (
                  <div className={styles.ratingChange} data-testid="puzzle-rating-change">
                    Rating: {attemptResult.ratingBefore} → {attemptResult.ratingAfter}{" "}
                    <span
                      className={
                        attemptResult.ratingDelta >= 0
                          ? styles.ratingPositive
                          : styles.ratingNegative
                      }
                    >
                      ({attemptResult.ratingDelta > 0 ? "+" : ""}
                      {attemptResult.ratingDelta})
                    </span>
                  </div>
                )}
                <div className={styles.actions}>
                  <Button
                    onClick={loadPuzzle}
                    variant="primary"
                    size="md"
                    data-testid="next-puzzle-button"
                  >
                    Next Puzzle
                  </Button>
                </div>
              </div>
            )}
            {puzzleState === "failed" && (
              <div data-testid="puzzle-failed">
                <div className={`${styles.banner} ${styles.bannerFail}`}>Incorrect</div>
                {attemptResult && (
                  <div className={styles.ratingChange} data-testid="puzzle-rating-change">
                    Rating: {attemptResult.ratingBefore} → {attemptResult.ratingAfter}{" "}
                    <span
                      className={
                        attemptResult.ratingDelta >= 0
                          ? styles.ratingPositive
                          : styles.ratingNegative
                      }
                    >
                      ({attemptResult.ratingDelta > 0 ? "+" : ""}
                      {attemptResult.ratingDelta})
                    </span>
                  </div>
                )}
                {isReplaying && (
                  <div className={styles.replayMessage} data-testid="replay-message">
                    Replaying solution...
                  </div>
                )}
                <div className={styles.actions}>
                  <Button
                    onClick={startSolutionReplay}
                    variant="secondary"
                    size="md"
                    disabled={isReplaying}
                    data-testid="view-solution-button"
                  >
                    View Solution
                  </Button>
                  <Button
                    onClick={loadPuzzle}
                    variant="primary"
                    size="md"
                    data-testid="next-puzzle-button"
                  >
                    Next Puzzle
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {stats && (
            <Card header="Your Stats">
              <div className={styles.statsGrid} data-testid="puzzle-stats">
                <div>
                  <div className={styles.statLabel}>Rating</div>
                  <div className={styles.statValue} data-testid="stats-rating">
                    {stats.rating}
                  </div>
                </div>
                <div>
                  <div className={styles.statLabel}>Solved</div>
                  <div className={styles.statValue} data-testid="stats-solved">
                    {stats.totalSolved}
                  </div>
                </div>
                <div>
                  <div className={styles.statLabel}>Attempted</div>
                  <div className={styles.statValue} data-testid="stats-attempted">
                    {stats.totalAttempts}
                  </div>
                </div>
                <div>
                  <div className={styles.statLabel}>Solve Rate</div>
                  <div className={styles.statValue} data-testid="stats-solve-rate">
                    {Math.round(stats.solveRate * 100)}%
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
