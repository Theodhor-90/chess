import { useState } from "react";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { clearDrawOffer } from "../store/gameSlice.js";
import { Button } from "./ui/Button.js";
import styles from "./GameActions.module.css";
import type { PlayerColor } from "@chess/shared";

export function GameActions({
  gameId,
  playerColor,
}: {
  gameId: number;
  playerColor: PlayerColor | null;
}) {
  const dispatch = useAppDispatch();
  const game = useAppSelector((state) => state.game.currentGame);
  const drawOffer = useAppSelector((state) => state.game.drawOffer);
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  if (!game || !playerColor) return null;

  const isActive = game.status === "active";
  const isWaiting = game.status === "waiting";
  const isCreator = playerColor === "white";

  function handleResignClick() {
    setShowResignConfirm(true);
  }

  function handleResignConfirm() {
    dispatch(socketActions.resign({ gameId }));
    setShowResignConfirm(false);
  }

  function handleResignCancel() {
    setShowResignConfirm(false);
  }

  function handleOfferDraw() {
    dispatch(socketActions.offerDraw({ gameId }));
  }

  function handleAcceptDraw() {
    dispatch(socketActions.acceptDraw({ gameId }));
  }

  function handleDeclineDraw() {
    dispatch(clearDrawOffer());
  }

  function handleAbortClick() {
    dispatch(socketActions.abort({ gameId }));
  }

  const opponentOfferedDraw = drawOffer !== null && drawOffer !== playerColor;
  const playerOfferedDraw = drawOffer === playerColor;

  return (
    <div data-testid="game-actions" className={styles.container}>
      {isActive && (
        <>
          {showResignConfirm ? (
            <div data-testid="resign-confirm" className={styles.resignConfirm}>
              <span className={styles.resignConfirmText}>Are you sure you want to resign?</span>
              <div className={styles.resignConfirmButtons}>
                <Button
                  variant="danger"
                  size="sm"
                  data-testid="resign-confirm-yes"
                  onClick={handleResignConfirm}
                >
                  Yes, Resign
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="resign-confirm-no"
                  onClick={handleResignCancel}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              data-testid="resign-button"
              onClick={handleResignClick}
            >
              Resign
            </Button>
          )}

          {opponentOfferedDraw ? (
            <div className={styles.drawGroup}>
              <Button
                variant="secondary"
                size="sm"
                data-testid="accept-draw-button"
                onClick={handleAcceptDraw}
              >
                Accept Draw
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="decline-draw-button"
                onClick={handleDeclineDraw}
              >
                Decline
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              data-testid="draw-button"
              onClick={handleOfferDraw}
              disabled={playerOfferedDraw}
            >
              {playerOfferedDraw ? "Draw Offered" : "Offer Draw"}
            </Button>
          )}
        </>
      )}

      {isWaiting && isCreator && (
        <Button variant="secondary" size="sm" data-testid="abort-button" onClick={handleAbortClick}>
          Abort Game
        </Button>
      )}
    </div>
  );
}
