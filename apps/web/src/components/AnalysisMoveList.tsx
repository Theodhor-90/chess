import { useEffect, useRef } from "react";
import type { MoveClassification } from "@chess/shared";
import styles from "./AnalysisMoveList.module.css";

interface AnalysisMoveListProps {
  moves: string[];
  currentMoveIndex: number;
  onMoveClick: (moveIndex: number) => void;
  classifications?: (MoveClassification | null)[];
}

const classificationClass: Record<MoveClassification, string> = {
  best: styles.indicatorBest,
  good: styles.indicatorGood,
  inaccuracy: styles.indicatorInaccuracy,
  mistake: styles.indicatorMistake,
  blunder: styles.indicatorBlunder,
};

export function AnalysisMoveList({
  moves,
  currentMoveIndex,
  onMoveClick,
  classifications,
}: AnalysisMoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLTableCellElement>(null);

  function renderIndicator(moveIndex: number): React.ReactNode {
    const classification = classifications?.[moveIndex];
    if (!classification) return null;
    return (
      <span
        data-testid={`move-indicator-${moveIndex}`}
        className={`${styles.indicator} ${classificationClass[classification]}`}
      />
    );
  }

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentMoveIndex]);

  const pairs: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1]]);
  }

  return (
    <div ref={containerRef} data-testid="analysis-move-list" className={styles.container}>
      <table className={styles.table}>
        <tbody>
          {pairs.map(([white, black], index) => {
            const whiteMoveIndex = index * 2 + 1;
            const blackMoveIndex = index * 2 + 2;
            const isWhiteActive = currentMoveIndex === whiteMoveIndex;
            const isBlackActive = currentMoveIndex === blackMoveIndex;
            const rowClass = index % 2 === 0 ? styles.row : styles.rowAlt;

            return (
              <tr key={index} className={rowClass}>
                <td className={styles.moveNumber}>{index + 1}.</td>
                <td
                  ref={isWhiteActive ? activeRef : undefined}
                  onClick={() => onMoveClick(whiteMoveIndex)}
                  className={`${styles.moveCell}${isWhiteActive ? ` ${styles.activeMove}` : ""}`}
                >
                  {renderIndicator(whiteMoveIndex)}
                  {white}
                </td>
                <td
                  ref={isBlackActive ? activeRef : undefined}
                  onClick={black ? () => onMoveClick(blackMoveIndex) : undefined}
                  className={
                    black
                      ? `${styles.moveCell}${isBlackActive ? ` ${styles.activeMove}` : ""}`
                      : styles.moveCellEmpty
                  }
                >
                  {renderIndicator(blackMoveIndex)}
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
