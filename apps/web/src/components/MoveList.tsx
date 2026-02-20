import { useEffect, useRef } from "react";

export function MoveList({ moves }: { moves: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest move
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [moves.length]);

  // Group moves into pairs: [white, black?]
  const pairs: [string, string | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], moves[i + 1]]);
  }

  return (
    <div
      ref={containerRef}
      data-testid="move-list"
      style={{
        maxHeight: "400px",
        overflowY: "auto",
        fontFamily: "monospace",
        fontSize: "14px",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {pairs.map(([white, black], index) => (
            <tr key={index}>
              <td style={{ padding: "2px 8px", color: "#666", width: "30px" }}>{index + 1}.</td>
              <td style={{ padding: "2px 8px" }}>{white}</td>
              <td style={{ padding: "2px 8px" }}>{black ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
