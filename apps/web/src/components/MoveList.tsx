import { useEffect, useRef } from "react";
import styles from "./MoveList.module.css";

export function MoveList({ moves }: { moves: string[] }) {
  const currentMoveRef = useRef<HTMLTableCellElement>(null);

  // Auto-scroll to the current (latest) move
  useEffect(() => {
    if (currentMoveRef.current) {
      currentMoveRef.current.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
  }, [moves.length]);

  // Group moves into pairs: [white, black?]
  const pairs: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1]]);
  }

  return (
    <div className={styles.container} data-testid="move-list">
      <table className={styles.table}>
        <tbody>
          {pairs.map(([white, black], index) => {
            const isLastRow = index === pairs.length - 1;
            const whiteIsCurrentMove = isLastRow && black === undefined;
            const blackIsCurrentMove = isLastRow && black !== undefined;
            const rowClass = index % 2 === 0 ? styles.row : styles.rowAlt;

            return (
              <tr key={index} className={rowClass}>
                <td className={styles.moveNumber}>{index + 1}.</td>
                <td
                  className={`${styles.moveCell}${whiteIsCurrentMove ? ` ${styles.currentMove}` : ""}`}
                  ref={whiteIsCurrentMove ? currentMoveRef : undefined}
                  data-testid={whiteIsCurrentMove ? "current-move" : undefined}
                >
                  {white}
                </td>
                <td
                  className={`${styles.moveCell}${blackIsCurrentMove ? ` ${styles.currentMove}` : ""}`}
                  ref={blackIsCurrentMove ? currentMoveRef : undefined}
                  data-testid={blackIsCurrentMove ? "current-move" : undefined}
                >
                  {black ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
