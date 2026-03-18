import { useEffect, useRef, useCallback } from "react";
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

const classificationLabel: Record<MoveClassification, string> = {
  best: "best",
  good: "good",
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
};

export function AnalysisMoveList({
  moves,
  currentMoveIndex,
  onMoveClick,
  classifications,
}: AnalysisMoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  function renderIndicator(moveIndex: number): React.ReactNode {
    const classification = classifications?.[moveIndex];
    if (!classification) return null;
    return (
      <span
        data-testid={`move-indicator-${moveIndex}`}
        className={`${styles.indicator} ${classificationClass[classification]}`}
        aria-hidden="true"
      />
    );
  }

  function getClassificationText(moveIndex: number): string {
    const classification = classifications?.[moveIndex];
    if (!classification) return "";
    return `, ${classificationLabel[classification]}`;
  }

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentMoveIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-move-index]"),
    );
    const currentIdx = buttons.findIndex((btn) => btn === document.activeElement);
    if (currentIdx === -1) return;

    let nextIdx: number;
    if (e.key === "ArrowDown") {
      nextIdx = Math.min(currentIdx + 1, buttons.length - 1);
    } else {
      nextIdx = Math.max(currentIdx - 1, 0);
    }
    buttons[nextIdx].focus();
  }, []);

  const pairs: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1]]);
  }

  return (
    <div
      ref={containerRef}
      data-testid="analysis-move-list"
      className={styles.container}
      onKeyDown={handleKeyDown}
    >
      <table className={styles.table} role="grid" aria-label="Analysis move list">
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
                <td className={styles.moveCell}>
                  <button
                    type="button"
                    ref={isWhiteActive ? activeRef : undefined}
                    onClick={() => onMoveClick(whiteMoveIndex)}
                    className={`${styles.moveButton}${isWhiteActive ? ` ${styles.activeMove}` : ""}`}
                    data-move-index={whiteMoveIndex}
                    tabIndex={isWhiteActive ? 0 : -1}
                    aria-label={`Move ${index + 1} white: ${white}${getClassificationText(whiteMoveIndex)}`}
                    aria-current={isWhiteActive ? "step" : undefined}
                  >
                    {renderIndicator(whiteMoveIndex)}
                    {white}
                  </button>
                </td>
                <td className={black ? styles.moveCell : styles.moveCellEmpty}>
                  {black ? (
                    <button
                      type="button"
                      ref={isBlackActive ? activeRef : undefined}
                      onClick={() => onMoveClick(blackMoveIndex)}
                      className={`${styles.moveButton}${isBlackActive ? ` ${styles.activeMove}` : ""}`}
                      data-move-index={blackMoveIndex}
                      tabIndex={isBlackActive ? 0 : -1}
                      aria-label={`Move ${index + 1} black: ${black}${getClassificationText(blackMoveIndex)}`}
                      aria-current={isBlackActive ? "step" : undefined}
                    >
                      {renderIndicator(blackMoveIndex)}
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
