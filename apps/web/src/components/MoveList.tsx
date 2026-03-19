import { useEffect, useRef, useCallback } from "react";
import styles from "./MoveList.module.css";

export function MoveList({ moves }: { moves: string[] }) {
  const currentMoveRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentMoveRef.current) {
      currentMoveRef.current.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [moves.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-move-index]"),
    );
    const currentIndex = buttons.findIndex((btn) => btn === document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex: number;
    if (e.key === "ArrowDown") {
      nextIndex = Math.min(currentIndex + 1, buttons.length - 1);
    } else {
      nextIndex = Math.max(currentIndex - 1, 0);
    }
    buttons[nextIndex].focus();
  }, []);

  const pairs: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1]]);
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      data-testid="move-list"
      onKeyDown={handleKeyDown}
    >
      <table className={styles.table} role="grid" aria-label="Move list">
        <tbody>
          {pairs.map(([white, black], index) => {
            const isLastRow = index === pairs.length - 1;
            const whiteIsCurrentMove = isLastRow && black === undefined;
            const blackIsCurrentMove = isLastRow && black !== undefined;
            const rowClass = index % 2 === 0 ? styles.row : styles.rowAlt;
            const whiteMoveIndex = index * 2;
            const blackMoveIndex = index * 2 + 1;

            return (
              <tr key={index} className={rowClass}>
                <td className={styles.moveNumber}>{index + 1}.</td>
                <td className={styles.moveCell}>
                  <button
                    type="button"
                    className={`${styles.moveButton}${whiteIsCurrentMove ? ` ${styles.currentMove}` : ""}`}
                    ref={whiteIsCurrentMove ? currentMoveRef : undefined}
                    data-testid={whiteIsCurrentMove ? "current-move" : undefined}
                    data-move-index={whiteMoveIndex}
                    tabIndex={whiteIsCurrentMove ? 0 : -1}
                    aria-label={`Move ${index + 1} white: ${white}`}
                  >
                    {white}
                  </button>
                </td>
                <td className={styles.moveCell}>
                  {black ? (
                    <button
                      type="button"
                      className={`${styles.moveButton}${blackIsCurrentMove ? ` ${styles.currentMove}` : ""}`}
                      ref={blackIsCurrentMove ? currentMoveRef : undefined}
                      data-testid={blackIsCurrentMove ? "current-move" : undefined}
                      data-move-index={blackMoveIndex}
                      tabIndex={blackIsCurrentMove ? 0 : -1}
                      aria-label={`Move ${index + 1} black: ${black}`}
                    >
                      {black}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
