import type { ExplorerMove } from "@chess/shared";
import styles from "./ExplorerPersonalOverlay.module.css";

interface ExplorerPersonalOverlayProps {
  move: ExplorerMove;
}

function ExplorerPersonalOverlay({ move }: ExplorerPersonalOverlayProps) {
  if (move.totalGames === 0) {
    return null;
  }

  return (
    <div className={styles.overlayRow} data-move-san={move.san}>
      <span className={styles.overlayLabel}>You:</span>
      <span className={styles.overlayStats}>
        <span className={styles.statWin}>{move.white}w</span>
        {" / "}
        <span className={styles.statDraw}>{move.draws}d</span>
        {" / "}
        <span className={styles.statLoss}>{move.black}l</span>
      </span>
    </div>
  );
}

export { ExplorerPersonalOverlay };
export type { ExplorerPersonalOverlayProps };
