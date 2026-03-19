import type { EvalScore, EngineLineInfo } from "@chess/shared";
import styles from "./EngineLinesPanel.module.css";

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
  if (!engineLines || engineLines.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="engine-lines-panel"
      className={styles.panel}
      aria-label="Engine analysis lines"
    >
      {engineLines.map((line, index) => (
        <button
          key={index}
          type="button"
          data-testid={`engine-line-${index}`}
          onClick={() => onLineSelect(index)}
          className={`${styles.line}${index === 0 ? ` ${styles.linePrimary}` : ""}`}
          aria-label={`Line ${index + 1}: ${formatEvalScore(line.score)}, ${line.moves.slice(0, 8).join(" ")}`}
        >
          <span
            data-testid={`engine-line-rank-${index}`}
            className={styles.rank}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <span
            data-testid={`engine-line-eval-${index}`}
            className={styles.eval}
            aria-hidden="true"
          >
            {formatEvalScore(line.score)}
          </span>
          <span
            data-testid={`engine-line-moves-${index}`}
            className={styles.moves}
            aria-hidden="true"
          >
            {line.moves.slice(0, 8).join(" ")}
          </span>
        </button>
      ))}
    </div>
  );
}
