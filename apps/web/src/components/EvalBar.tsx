import type { EvalScore } from "@chess/shared";
import styles from "./EvalBar.module.css";

interface EvalBarProps {
  score: EvalScore;
}

export function evalToWhitePercent(score: EvalScore): number {
  if (score.type === "mate") {
    if (score.value > 0) return 100;
    if (score.value < 0) return 0;
    return 50;
  }
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.004 * score.value)) - 1);
  return Math.max(0, Math.min(100, raw));
}

function formatScore(score: EvalScore): string {
  if (score.type === "mate") {
    return `M${score.value}`;
  }
  const pawns = score.value / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(1)}`;
}

export function EvalBar({ score }: EvalBarProps) {
  const whitePercent = evalToWhitePercent(score);
  const label = formatScore(score);
  const labelInWhite = whitePercent > 50;

  return (
    <div data-testid="eval-bar" className={styles.container}>
      <div className={styles.blackFill} style={{ height: `${100 - whitePercent}%` }} />
      <div
        data-testid="eval-white-fill"
        className={styles.whiteFill}
        style={{ height: `${whitePercent}%` }}
      />
      <div
        data-testid="eval-score"
        className={`${styles.scoreLabel} ${labelInWhite ? styles.scoreLabelDark : styles.scoreLabelLight}`}
        style={{ top: `${100 - whitePercent}%` }}
      >
        {label}
      </div>
    </div>
  );
}
