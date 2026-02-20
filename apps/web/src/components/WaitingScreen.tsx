import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { clearError, clearGame } from "../store/gameSlice.js";
import { InviteLink } from "./InviteLink.js";
import type { PlayerColor } from "@chess/shared";

interface WaitingScreenProps {
  gameId: number;
  inviteToken: string;
  color: PlayerColor;
  onCancel: () => void;
}

export function WaitingScreen({ gameId, inviteToken, color, onCancel }: WaitingScreenProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const game = useAppSelector((state) => state.game.currentGame);
  const error = useAppSelector((state) => state.game.error);
  const [cancelAttempted, setCancelAttempted] = useState(false);

  // Join the game room on mount, leave on unmount
  useEffect(() => {
    dispatch(socketActions.joinRoom({ gameId }));
    return () => {
      dispatch(socketActions.leaveRoom({ gameId }));
      dispatch(clearGame());
    };
  }, [dispatch, gameId]);

  // Auto-navigate when opponent joins (game status changes to "active")
  useEffect(() => {
    if (game && game.status === "active") {
      navigate(`/game/${gameId}`);
    }
  }, [game, gameId, navigate]);

  useEffect(() => {
    if (game && game.status === "aborted") {
      onCancel();
    }
  }, [game, onCancel]);

  useEffect(() => {
    if (cancelAttempted && error) {
      dispatch(clearError());
      dispatch(socketActions.leaveRoom({ gameId }));
      dispatch(socketActions.joinRoom({ gameId }));
      setCancelAttempted(false);
    }
  }, [cancelAttempted, dispatch, error, gameId]);

  function handleCancel() {
    setCancelAttempted(true);
    dispatch(socketActions.abort({ gameId }));
  }

  return (
    <div data-testid="waiting-screen">
      <h2>Waiting for opponent to join...</h2>
      <p>
        You are playing as <strong>{color}</strong>
      </p>
      <InviteLink inviteToken={inviteToken} />
      <div style={{ marginTop: "16px" }}>
        <button data-testid="cancel-game-button" onClick={handleCancel}>
          Cancel Game
        </button>
      </div>
    </div>
  );
}
