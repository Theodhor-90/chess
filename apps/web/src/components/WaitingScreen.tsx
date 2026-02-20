import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { clearGame } from "../store/gameSlice.js";
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

  function handleCancel() {
    dispatch(socketActions.abort({ gameId }));
    onCancel();
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
