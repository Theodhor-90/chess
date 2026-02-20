import { useState } from "react";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
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

  function handleDrawClick() {
    if (drawOffer && drawOffer !== playerColor) {
      dispatch(socketActions.acceptDraw({ gameId }));
    } else if (!drawOffer) {
      dispatch(socketActions.offerDraw({ gameId }));
    }
  }

  function getDrawButtonLabel(): string {
    if (drawOffer === playerColor) return "Draw Offered";
    if (drawOffer && drawOffer !== playerColor) return "Accept Draw";
    return "Offer Draw";
  }

  function handleAbortClick() {
    dispatch(socketActions.abort({ gameId }));
  }

  return (
    <div
      data-testid="game-actions"
      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
    >
      {isActive && (
        <>
          {showResignConfirm ? (
            <div
              data-testid="resign-confirm"
              style={{
                padding: "8px",
                backgroundColor: "#fff3f3",
                borderRadius: "4px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <span>Are you sure you want to resign?</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button data-testid="resign-confirm-yes" onClick={handleResignConfirm}>
                  Yes, Resign
                </button>
                <button data-testid="resign-confirm-no" onClick={handleResignCancel}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button data-testid="resign-button" onClick={handleResignClick}>
              Resign
            </button>
          )}

          <button
            data-testid="draw-button"
            onClick={handleDrawClick}
            disabled={drawOffer === playerColor}
          >
            {getDrawButtonLabel()}
          </button>
        </>
      )}

      {isWaiting && isCreator && (
        <button data-testid="abort-button" onClick={handleAbortClick}>
          Abort Game
        </button>
      )}
    </div>
  );
}
