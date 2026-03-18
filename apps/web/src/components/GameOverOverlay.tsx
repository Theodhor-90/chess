import { useNavigate } from "react-router";
import { useAppSelector } from "../store/index.js";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import styles from "./GameOverOverlay.module.css";
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

  function handleAnalyze() {
    navigate(`/analysis/${game!.id}`);
  }

  const footerContent = (
    <div className={styles.actions}>
      <Button variant="primary" size="sm" data-testid="analyze-game" onClick={handleAnalyze}>
        Analyze Game
      </Button>
      <Button
        variant="secondary"
        size="sm"
        data-testid="back-to-dashboard"
        onClick={handleBackToDashboard}
      >
        Back to Dashboard
      </Button>
      <Button variant="ghost" size="sm" data-testid="view-board" onClick={onDismiss}>
        View Board
      </Button>
    </div>
  );

  return (
    <div data-testid="game-over-overlay">
      <Modal isOpen={true} onClose={onDismiss} title="Game Over" footer={footerContent}>
        <div className={styles.content}>
          <h3 data-testid="result-message" className={styles.resultMessage}>
            {resultMessage}
          </h3>

          <div data-testid="final-clocks" className={styles.finalClocks}>
            <div>
              <div className={styles.clockLabel}>White</div>
              <div>{formatClockTime(whiteClock)}</div>
            </div>
            <div>
              <div className={styles.clockLabel}>Black</div>
              <div>{formatClockTime(blackClock)}</div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
