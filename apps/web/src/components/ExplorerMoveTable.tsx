import type { ExplorerMove } from "@chess/shared";
import styles from "./ExplorerMoveTable.module.css";

interface ExplorerMoveTableProps {
  moves: ExplorerMove[];
  onMoveClick: (san: string, uci: string) => void;
  onHoverMove: (uci: string | null) => void;
}

function ExplorerMoveTable({ moves, onMoveClick, onHoverMove }: ExplorerMoveTableProps) {
  if (moves.length === 0) {
    return null;
  }

  return (
    <div className={styles.table} role="table" aria-label="Opening explorer moves">
      <div className={styles.headerRow} role="row">
        <span className={styles.headerCell} role="columnheader">
          Move
        </span>
        <span className={styles.headerCell} role="columnheader">
          Games
        </span>
        <span className={styles.headerCellBar} role="columnheader">
          Result
        </span>
        <span className={styles.headerCellRight} role="columnheader">
          Rating
        </span>
      </div>
      {moves.map((move) => {
        const total = move.white + move.draws + move.black;
        const whitePct = total > 0 ? (move.white / total) * 100 : 0;
        const drawPct = total > 0 ? (move.draws / total) * 100 : 0;
        const blackPct = total > 0 ? (move.black / total) * 100 : 0;

        return (
          <button
            key={move.san}
            type="button"
            className={styles.row}
            role="row"
            aria-label={`${move.san}: ${total.toLocaleString()} games, ${whitePct.toFixed(0)}% white, ${drawPct.toFixed(0)}% draw, ${blackPct.toFixed(0)}% black`}
            onClick={() => onMoveClick(move.san, move.uci)}
            onMouseEnter={() => onHoverMove(move.uci)}
            onMouseLeave={() => onHoverMove(null)}
          >
            <span className={styles.moveSan} role="cell">
              {move.san}
            </span>
            <span className={styles.gameCount} role="cell">
              {total.toLocaleString()}
            </span>
            <span className={styles.barCell} role="cell">
              <span className={styles.bar}>
                {whitePct > 0 && (
                  <span className={styles.barWhite} style={{ width: `${whitePct}%` }}>
                    {whitePct >= 15 && (
                      <span className={styles.barLabel}>{`${whitePct.toFixed(0)}%`}</span>
                    )}
                  </span>
                )}
                {drawPct > 0 && (
                  <span className={styles.barDraw} style={{ width: `${drawPct}%` }}>
                    {drawPct >= 15 && (
                      <span className={styles.barLabel}>{`${drawPct.toFixed(0)}%`}</span>
                    )}
                  </span>
                )}
                {blackPct > 0 && (
                  <span className={styles.barBlack} style={{ width: `${blackPct}%` }}>
                    {blackPct >= 15 && (
                      <span className={styles.barLabelLight}>{`${blackPct.toFixed(0)}%`}</span>
                    )}
                  </span>
                )}
              </span>
            </span>
            <span className={styles.avgRating} role="cell">
              {move.avgRating > 0 ? move.avgRating.toLocaleString() : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { ExplorerMoveTable };
export type { ExplorerMoveTableProps };
