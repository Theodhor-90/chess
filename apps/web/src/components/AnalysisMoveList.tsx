import { useEffect, useRef } from "react";

interface AnalysisMoveListProps {
  moves: string[];
  currentMoveIndex: number;
  onMoveClick: (moveIndex: number) => void;
}

export function AnalysisMoveList({ moves, currentMoveIndex, onMoveClick }: AnalysisMoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLTableCellElement>(null);

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
                  {white}
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
