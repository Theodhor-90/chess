import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { useGetMeQuery } from "../store/apiSlice.js";
import { socketActions } from "../store/socketMiddleware.js";
import { clearGame, clearError } from "../store/gameSlice.js";
import { GameBoard } from "../components/GameBoard.js";
import { PlayerInfoBar } from "../components/PlayerInfoBar.js";
import { MoveList } from "../components/MoveList.js";
import { GameActions } from "../components/GameActions.js";
import { GameOverOverlay } from "../components/GameOverOverlay.js";
import { DisconnectBanner } from "../components/DisconnectBanner.js";
import { ConnectionStatus } from "../components/ConnectionStatus.js";
import { Chess } from "chess.js";
import { useSwipeGesture } from "../hooks/useSwipeGesture.js";
import { GamePageSkeleton } from "../components/ui/Skeleton.js";
import { AriaAnnouncer } from "../components/AriaAnnouncer.js";
import styles from "./GamePage.module.css";
import type { PlayerColor } from "@chess/shared";

export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const gameId = Number(id);
  const dispatch = useAppDispatch();
  const { data: meData } = useGetMeQuery();

  const game = useAppSelector((state) => state.game.currentGame);
  const error = useAppSelector((state) => state.game.error);
  const [showOverlay, setShowOverlay] = useState(true);

  // Determine player's color based on their user ID
  const myUserId = meData?.user?.id ?? null;
  const playerColor: PlayerColor | null =
    game && myUserId !== null
      ? game.players.white?.userId === myUserId
        ? "white"
        : game.players.black?.userId === myUserId
          ? "black"
          : null
      : null;

  const boardColumnRef = useRef<HTMLDivElement>(null);
  const [viewedMoveIndex, setViewedMoveIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const prevMovesLengthRef = useRef(0);
  const prevStatusRef = useRef<string | null>(null);
  const whiteClockWarned = useRef(false);
  const blackClockWarned = useRef(false);

  const fens = useMemo(() => {
    if (!game) return [];
    const chess = new Chess();
    const fenList = [chess.fen()];
    for (const san of game.moves) {
      try {
        chess.move(san);
        fenList.push(chess.fen());
      } catch {
        break;
      }
    }
    return fenList;
  }, [game?.moves.length]);

  useEffect(() => {
    setViewedMoveIndex(null);
  }, [game?.moves.length]);

  const handleSwipeLeft = useCallback(() => {
    if (!game) return;
    const maxIndex = game.moves.length;
    setViewedMoveIndex((prev) => {
      const current = prev ?? maxIndex;
      return current < maxIndex ? current + 1 : null;
    });
  }, [game?.moves.length]);

  const handleSwipeRight = useCallback(() => {
    if (!game) return;
    setViewedMoveIndex((prev) => {
      const current = prev ?? game.moves.length;
      return current > 0 ? current - 1 : 0;
    });
  }, [game?.moves.length]);

  useSwipeGesture(boardColumnRef, {
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  });

  const overrideFen = viewedMoveIndex !== null ? fens[viewedMoveIndex] : undefined;

  // Join/leave room on mount/unmount
  useEffect(() => {
    if (!isNaN(gameId)) {
      dispatch(socketActions.joinRoom({ gameId }));
    }
    return () => {
      if (!isNaN(gameId)) {
        dispatch(socketActions.leaveRoom({ gameId }));
        dispatch(clearGame());
      }
    };
  }, [dispatch, gameId]);

  // Clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => dispatch(clearError()), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, dispatch]);

  // Announce new moves to screen readers
  useEffect(() => {
    if (!game) return;
    const currentLength = game.moves.length;
    if (currentLength > prevMovesLengthRef.current && currentLength > 0) {
      const lastMove = game.moves[currentLength - 1];
      let msg = lastMove;
      if (lastMove.includes("#")) {
        msg = `${lastMove}, checkmate`;
      } else if (lastMove.includes("+")) {
        msg = `${lastMove}, check`;
      }
      setAnnouncement(msg);
    }
    prevMovesLengthRef.current = currentLength;
  }, [game?.moves.length]);

  // Announce game-over events to screen readers
  useEffect(() => {
    if (!game) return;
    const status = game.status;
    if (status === prevStatusRef.current) return;
    prevStatusRef.current = status;

    const winner = game.result?.winner;
    switch (status) {
      case "checkmate":
        setAnnouncement(`Checkmate, ${winner === "white" ? "white" : "black"} wins`);
        break;
      case "stalemate":
        setAnnouncement("Draw by stalemate");
        break;
      case "resigned":
        setAnnouncement(
          `${winner === "white" ? "Black" : "White"} resigned, ${winner === "white" ? "white" : "black"} wins`,
        );
        break;
      case "draw":
        setAnnouncement("Game drawn by agreement");
        break;
      case "timeout":
        setAnnouncement(
          `${winner === "white" ? "Black" : "White"} ran out of time, ${winner === "white" ? "white" : "black"} wins`,
        );
        break;
      case "aborted":
        setAnnouncement("Game aborted");
        break;
    }
  }, [game?.status, game?.result?.winner]);

  // Announce low-time warnings to screen readers
  useEffect(() => {
    if (!game || game.status !== "active" || !game.clockState) return;

    const whiteTime = game.clockState.white;
    const blackTime = game.clockState.black;

    if (whiteTime < 30000 && whiteTime > 0 && !whiteClockWarned.current) {
      whiteClockWarned.current = true;
      setAnnouncement("White has less than 30 seconds");
    }
    if (blackTime < 30000 && blackTime > 0 && !blackClockWarned.current) {
      blackClockWarned.current = true;
      setAnnouncement("Black has less than 30 seconds");
    }

    if (whiteTime >= 30000) whiteClockWarned.current = false;
    if (blackTime >= 30000) blackClockWarned.current = false;
  }, [game?.clockState?.white, game?.clockState?.black, game?.status]);

  if (isNaN(gameId)) {
    return <div>Invalid game ID</div>;
  }

  if (!game) {
    return <GamePageSkeleton testId="loading" />;
  }

  const clockState = game.clockState;
  const topClockColor: PlayerColor = playerColor === "black" ? "white" : "black";
  const bottomClockColor: PlayerColor = playerColor === "black" ? "black" : "white";

  const topPlayer = topClockColor === "white" ? game.players.white : game.players.black;
  const bottomPlayer = bottomClockColor === "white" ? game.players.white : game.players.black;
  const topLabel = topPlayer?.username ?? (topPlayer ? `User #${topPlayer.userId}` : "");
  const bottomLabel =
    bottomPlayer?.username ?? (bottomPlayer ? `User #${bottomPlayer.userId}` : "");

  const topClockTime = clockState?.[topClockColor] ?? game.clock.initialTime * 1000;
  const bottomClockTime = clockState?.[bottomClockColor] ?? game.clock.initialTime * 1000;
  const topClockActive = clockState?.activeColor === topClockColor;
  const bottomClockActive = clockState?.activeColor === bottomClockColor;
  const lastUpdate = clockState?.lastUpdate ?? Date.now();

  return (
    <div className={styles.page}>
      <AriaAnnouncer message={announcement} />
      {/* Disconnect banner at top */}
      <DisconnectBanner />

      <div className={styles.layout}>
        {/* Board column */}
        <div ref={boardColumnRef} className={styles.boardColumn}>
          {/* Opponent info bar (top) */}
          <PlayerInfoBar
            username={topLabel}
            userId={topPlayer?.userId ?? null}
            timeMs={topClockTime}
            isActive={topClockActive}
            lastUpdate={lastUpdate}
            fen={game.fen}
            color={topClockColor}
            testIdPrefix="top"
            botLevel={topClockColor !== playerColor ? game.botLevel : undefined}
          />

          {/* Board */}
          <GameBoard gameId={gameId} playerColor={playerColor} overrideFen={overrideFen} />

          {/* Player info bar (bottom) */}
          <PlayerInfoBar
            username={bottomLabel}
            userId={bottomPlayer?.userId ?? null}
            timeMs={bottomClockTime}
            isActive={bottomClockActive}
            lastUpdate={lastUpdate}
            fen={game.fen}
            color={bottomClockColor}
            testIdPrefix="bottom"
            botLevel={bottomClockColor !== playerColor ? game.botLevel : undefined}
          />
          {viewedMoveIndex !== null && (
            <div className={styles.viewingMoveIndicator}>
              <span>
                Viewing move {viewedMoveIndex} of {game.moves.length}
              </span>
              <button
                type="button"
                className={styles.backToLiveButton}
                onClick={() => setViewedMoveIndex(null)}
                aria-label="Return to live game position"
              >
                Back to live
              </button>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className={styles.sidePanel}>
          {/* Connection status */}
          <ConnectionStatus />

          {/* Game info */}
          <div className={styles.gameInfo}>
            <strong>Status:</strong> {game.status}
            {game.currentTurn && game.status === "active" && (
              <span> - {game.currentTurn}&apos;s turn</span>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              {error}
            </div>
          )}

          {/* Move list */}
          <MoveList moves={game.moves} />

          {/* Game actions — hidden on mobile (shown in fixed bottom bar instead) */}
          <div className={styles.desktopActions}>
            <GameActions gameId={gameId} playerColor={playerColor} />
          </div>
        </div>
      </div>

      {/* Game over overlay */}
      {showOverlay && (
        <GameOverOverlay playerColor={playerColor} onDismiss={() => setShowOverlay(false)} />
      )}

      {/* Mobile action bar — fixed at bottom, visible only at mobile breakpoints during active games */}
      {playerColor && game.status === "active" && (
        <div className={styles.mobileActionBar} data-testid="mobile-action-bar">
          <GameActions gameId={gameId} playerColor={playerColor} />
        </div>
      )}
    </div>
  );
}
