import { useState } from "react";
import type { EvalScore, EngineLineInfo } from "@chess/shared";

export function formatEvalScore(score: EvalScore): string {
  if (score.type === "mate") {
    if (score.value > 0) return `M${score.value}`;
    return `-M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  if (pawns > 0) return `+${pawns.toFixed(1)}`;
  return pawns.toFixed(1);
}

interface EngineLinesPanelProps {
  engineLines: EngineLineInfo[] | undefined;
  onLineSelect: (lineIndex: number) => void;
}

export function EngineLinesPanel({ engineLines, onLineSelect }: EngineLinesPanelProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!engineLines || engineLines.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="engine-lines-panel"
      style={{ fontFamily: "monospace", fontSize: "13px", minWidth: "200px" }}
    >
      {engineLines.map((line, index) => (
        <div
          key={index}
          data-testid={`engine-line-${index}`}
          onClick={() => onLineSelect(index)}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 8px",
            cursor: "pointer",
            fontWeight: index === 0 ? "bold" : "normal",
            backgroundColor: hoveredIndex === index ? "#f0f0f0" : "transparent",
          }}
        >
          <span
            data-testid={`engine-line-rank-${index}`}
            style={{ color: "#999", minWidth: "16px" }}
          >
            {index + 1}
          </span>
          <span
            data-testid={`engine-line-eval-${index}`}
            style={{ minWidth: "48px", fontWeight: "bold" }}
          >
            {formatEvalScore(line.score)}
          </span>
          <span
            data-testid={`engine-line-moves-${index}`}
            style={{
              color: "#444",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {line.moves.slice(0, 8).join(" ")}
          </span>
        </div>
      ))}
    </div>
  );
}
