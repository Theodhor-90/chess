import { useEffect } from "react";
import { useParams } from "react-router";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { useGetMeQuery } from "../store/apiSlice.js";
import { socketActions } from "../store/socketMiddleware.js";
import { clearGame, clearError } from "../store/gameSlice.js";
import { GameBoard } from "../components/GameBoard.js";
import { Clock } from "../components/Clock.js";
import { MoveList } from "../components/MoveList.js";
import type { PlayerColor } from "@chess/shared";

export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const gameId = Number(id);
  const dispatch = useAppDispatch();
  const { data: meData } = useGetMeQuery();

  const game = useAppSelector((state) => state.game.currentGame);
  const error = useAppSelector((state) => state.game.error);

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

  if (isNaN(gameId)) {
    return <div>Invalid game ID</div>;
  }

  if (!game) {
    return <div data-testid="loading">Loading game...</div>;
  }

  const clockState = game.clockState;
  const topClockColor: PlayerColor = playerColor === "black" ? "white" : "black";
  const bottomClockColor: PlayerColor = playerColor === "black" ? "black" : "white";

  const topClockTime = clockState?.[topClockColor] ?? game.clock.initialTime * 1000;
  const bottomClockTime = clockState?.[bottomClockColor] ?? game.clock.initialTime * 1000;
  const topClockActive = clockState?.activeColor === topClockColor;
  const bottomClockActive = clockState?.activeColor === bottomClockColor;
  const lastUpdate = clockState?.lastUpdate ?? Date.now();

  return (
    <div style={{ display: "flex", gap: "24px", padding: "16px", justifyContent: "center" }}>
      {/* Board column */}
      <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}
      >
        {/* Opponent clock (top) */}
        <Clock timeMs={topClockTime} isActive={topClockActive} lastUpdate={lastUpdate} />

        {/* Board */}
        <GameBoard gameId={gameId} playerColor={playerColor} />

        {/* Player clock (bottom) */}
        <Clock timeMs={bottomClockTime} isActive={bottomClockActive} lastUpdate={lastUpdate} />
      </div>

      {/* Side panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "200px" }}>
        {/* Game info */}
        <div>
          <strong>Status:</strong> {game.status}
          {game.currentTurn && game.status === "active" && <span> - {game.currentTurn}&apos;s turn</span>}
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            style={{
              padding: "8px",
              backgroundColor: "#fee",
              color: "#c00",
              borderRadius: "4px",
            }}
          >
            {error}
          </div>
        )}

        {/* Move list */}
        <MoveList moves={game.moves} />
      </div>
    </div>
  );
}
