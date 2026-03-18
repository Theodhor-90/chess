import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { clearError, clearGame } from "../store/gameSlice.js";
import { InviteLink } from "./InviteLink.js";
import { Card } from "./ui/Card.js";
import { Button } from "./ui/Button.js";
import type { PlayerColor } from "@chess/shared";
import styles from "./WaitingScreen.module.css";

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
    <Card header="Waiting for Opponent">
      <div data-testid="waiting-screen" className={styles.screen}>
        <div className={styles.loadingRow}>
          <span className={styles.spinner} aria-hidden="true" />
          <span>Waiting for opponent to join...</span>
        </div>
        <p className={styles.colorInfo}>
          You are playing as <strong>{color}</strong>
        </p>
        <InviteLink inviteToken={inviteToken} />
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="cancel-game-button">
            Cancel Game
          </Button>
        </div>
      </div>
    </Card>
  );
}
