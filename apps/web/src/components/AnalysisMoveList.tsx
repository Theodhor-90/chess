import { useEffect, useRef } from "react";
import type { MoveClassification } from "@chess/shared";

interface AnalysisMoveListProps {
  moves: string[];
  currentMoveIndex: number;
  onMoveClick: (moveIndex: number) => void;
  classifications?: (MoveClassification | null)[];
}

const classificationColors: Record<MoveClassification, string> = {
  best: "#22c55e",
  good: "#22c55e",
  inaccuracy: "#eab308",
  mistake: "#f97316",
  blunder: "#ef4444",
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
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: classificationColors[classification],
          marginRight: 4,
        }}
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
    <div
      ref={containerRef}
      data-testid="analysis-move-list"
      style={{
        maxHeight: "400px",
        overflowY: "auto",
        fontFamily: "monospace",
        fontSize: "14px",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {pairs.map(([white, black], index) => {
            const whiteMoveIndex = index * 2 + 1;
            const blackMoveIndex = index * 2 + 2;
            const isWhiteActive = currentMoveIndex === whiteMoveIndex;
            const isBlackActive = currentMoveIndex === blackMoveIndex;

            return (
              <tr key={index}>
                <td style={{ padding: "2px 8px", color: "#666", width: "30px" }}>{index + 1}.</td>
                <td
                  ref={isWhiteActive ? activeRef : undefined}
                  onClick={() => onMoveClick(whiteMoveIndex)}
                  style={{
                    padding: "2px 8px",
                    cursor: "pointer",
                    backgroundColor: isWhiteActive ? "#e0e0ff" : undefined,
                  }}
                >
                  {renderIndicator(whiteMoveIndex)}{white}
                </td>
                <td
                  ref={isBlackActive ? activeRef : undefined}
                  onClick={black ? () => onMoveClick(blackMoveIndex) : undefined}
                  style={{
                    padding: "2px 8px",
                    cursor: black ? "pointer" : undefined,
                    backgroundColor: isBlackActive ? "#e0e0ff" : undefined,
                  }}
                >
                  {renderIndicator(blackMoveIndex)}{black ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
