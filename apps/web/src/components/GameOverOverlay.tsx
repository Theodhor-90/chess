import { useNavigate } from "react-router";
import { useAppSelector } from "../store/index.js";
import type { PlayerColor, GameStatus } from "@chess/shared";

const TERMINAL_STATUSES: GameStatus[] = [
  "checkmate",
  "stalemate",
  "resigned",
  "draw",
  "timeout",
  "aborted",
];

function getResultMessage(
  status: GameStatus,
  result: { winner?: PlayerColor; reason: GameStatus } | undefined,
  playerColor: PlayerColor | null,
): string {
  switch (status) {
    case "checkmate":
      if (playerColor && result?.winner) {
        return result.winner === playerColor ? "You won by checkmate!" : "You lost by checkmate.";
      }
      return `Checkmate! ${result?.winner === "white" ? "White" : "Black"} wins`;
    case "stalemate":
      return "Stalemate \u2014 Draw";
    case "resigned":
      if (playerColor && result?.winner) {
        return result.winner === playerColor ? "Opponent resigned. You win!" : "You resigned.";
      }
      return `${result?.winner === "white" ? "Black" : "White"} resigned. ${result?.winner === "white" ? "White" : "Black"} wins`;
    case "draw":
      return "Game drawn by agreement";
    case "timeout":
      if (playerColor && result?.winner) {
        return result.winner === playerColor
          ? "Opponent ran out of time. You win!"
          : "You ran out of time.";
      }
      return `${result?.winner === "white" ? "Black" : "White"} ran out of time. ${result?.winner === "white" ? "White" : "Black"} wins`;
    case "aborted":
      return "Game aborted";
    default:
      return "Game over";
  }
}

function formatClockTime(ms: number): string {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function GameOverOverlay({
  playerColor,
  onDismiss,
}: {
  playerColor: PlayerColor | null;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const game = useAppSelector((state) => state.game.currentGame);

  if (!game || !TERMINAL_STATUSES.includes(game.status)) {
    return null;
  }

  const resultMessage = getResultMessage(game.status, game.result, playerColor);

  const whiteClock = game.clockState?.white ?? game.clock.initialTime * 1000;
  const blackClock = game.clockState?.black ?? game.clock.initialTime * 1000;

  function handleBackToDashboard() {
    navigate("/");
  }

  return (
    <div
      data-testid="game-over-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "8px",
          padding: "32px",
          maxWidth: "400px",
          width: "90%",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <h2 data-testid="result-message" style={{ margin: 0 }}>
          {resultMessage}
        </h2>

        <div
          data-testid="final-clocks"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "24px",
            fontFamily: "monospace",
            fontSize: "18px",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", color: "#666" }}>White</div>
            <div>{formatClockTime(whiteClock)}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#666" }}>Black</div>
            <div>{formatClockTime(blackClock)}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button data-testid="back-to-dashboard" onClick={handleBackToDashboard}>
            Back to Dashboard
          </button>
          <button data-testid="view-board" onClick={onDismiss}>
            View Board
          </button>
        </div>
      </div>
    </div>
  );
}
