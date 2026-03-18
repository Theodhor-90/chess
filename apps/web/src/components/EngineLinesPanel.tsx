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
    <div data-testid="engine-lines-panel" className={styles.panel}>
      {engineLines.map((line, index) => (
        <div
          key={index}
          data-testid={`engine-line-${index}`}
          onClick={() => onLineSelect(index)}
          className={`${styles.line}${index === 0 ? ` ${styles.linePrimary}` : ""}`}
        >
          <span data-testid={`engine-line-rank-${index}`} className={styles.rank}>
            {index + 1}
          </span>
          <span data-testid={`engine-line-eval-${index}`} className={styles.eval}>
            {formatEvalScore(line.score)}
          </span>
          <span data-testid={`engine-line-moves-${index}`} className={styles.moves}>
            {line.moves.slice(0, 8).join(" ")}
          </span>
        </div>
      ))}
    </div>
  );
}
