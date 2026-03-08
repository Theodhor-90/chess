import type { EvalScore } from "@chess/shared";

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
    <div
      data-testid="eval-bar"
      style={{
        width: 30,
        height: "100%",
        minHeight: 400,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: `${100 - whitePercent}%`,
          background: "#333",
          transition: "height 0.3s ease",
        }}
      />
      <div
        data-testid="eval-white-fill"
        style={{
          height: `${whitePercent}%`,
          background: "#f0f0f0",
          transition: "height 0.3s ease",
        }}
      />
      <div
        data-testid="eval-score"
        style={{
          position: "absolute",
          top: `${100 - whitePercent}%`,
          left: 0,
          right: 0,
          transform: "translateY(-50%)",
          textAlign: "center",
          fontSize: 11,
          fontWeight: "bold",
          color: labelInWhite ? "#333" : "#f0f0f0",
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
    </div>
  );
}
