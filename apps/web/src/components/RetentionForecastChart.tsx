import { useMemo } from "react";
import styles from "./RetentionForecastChart.module.css";

interface RetentionForecastCardData {
  stability: number;
  elapsedDays: number;
  state: number;
}

interface RetentionForecastChartProps {
  cards: RetentionForecastCardData[];
}

// Chart dimensions
const WIDTH = 560;
const HEIGHT = 200;
const PADDING_LEFT = 45;
const PADDING_RIGHT = 15;
const PADDING_TOP = 15;
const PADDING_BOTTOM = 30;
const CHART_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

const DAYS = 31; // 0 to 30 inclusive
const TARGET_RETENTION = 0.9;

function RetentionForecastChart({ cards }: RetentionForecastChartProps) {
  const dataPoints = useMemo(() => {
    // Filter to non-new cards with positive stability
    const eligibleCards = cards.filter((c) => c.state >= 1 && c.stability > 0);

    if (eligibleCards.length === 0) return null;

    const points: Array<{ day: number; retention: number }> = [];

    for (let d = 0; d < DAYS; d++) {
      let totalR = 0;
      for (const card of eligibleCards) {
        const elapsed = card.elapsedDays + d;
        const r = Math.pow(0.9, elapsed / card.stability);
        totalR += r;
      }
      const avgR = totalR / eligibleCards.length;
      points.push({ day: d, retention: avgR });
    }

    return points;
  }, [cards]);

  if (!dataPoints) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Retention Forecast</h2>
        <p className={styles.emptyText}>
          No reviewed cards yet. Complete some reviews to see your retention forecast.
        </p>
      </div>
    );
  }

  // Scale functions
  const xScale = (day: number) => PADDING_LEFT + (day / 30) * CHART_WIDTH;
  const yScale = (retention: number) => PADDING_TOP + (1 - retention) * CHART_HEIGHT;

  // Build polyline points string
  const polylinePoints = dataPoints.map((p) => `${xScale(p.day)},${yScale(p.retention)}`).join(" ");

  // X-axis labels: 0, 5, 10, 15, 20, 25, 30
  const xLabels = [0, 5, 10, 15, 20, 25, 30];

  // Y-axis labels: 0%, 25%, 50%, 75%, 100%
  const yLabels = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div className={styles.container} data-testid="retention-forecast">
      <h2 className={styles.title}>Retention Forecast</h2>
      <div className={styles.chartWrapper}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          style={{ maxWidth: `${WIDTH}px` }}
          role="img"
          aria-label="30-day retention forecast chart"
        >
          {/* Grid lines */}
          {yLabels.map((v) => (
            <line
              key={`grid-${v}`}
              x1={PADDING_LEFT}
              y1={yScale(v)}
              x2={WIDTH - PADDING_RIGHT}
              y2={yScale(v)}
              stroke="var(--color-border-light)"
              strokeWidth={1}
            />
          ))}

          {/* Target retention line (90%) */}
          <line
            x1={PADDING_LEFT}
            y1={yScale(TARGET_RETENTION)}
            x2={WIDTH - PADDING_RIGHT}
            y2={yScale(TARGET_RETENTION)}
            stroke="var(--color-success)"
            strokeWidth={1}
            strokeDasharray="6 3"
            data-testid="target-retention-line"
          />
          <text
            x={WIDTH - PADDING_RIGHT + 2}
            y={yScale(TARGET_RETENTION) + 4}
            fontSize={10}
            fill="var(--color-success)"
          >
            90%
          </text>

          {/* Retention polyline */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            data-testid="retention-line"
          />

          {/* Today marker (day 0) */}
          <circle
            cx={xScale(0)}
            cy={yScale(dataPoints[0].retention)}
            r={4}
            fill="var(--color-primary)"
            data-testid="today-marker"
          />

          {/* X-axis labels */}
          {xLabels.map((d) => (
            <text
              key={`x-${d}`}
              x={xScale(d)}
              y={HEIGHT - 5}
              fontSize={10}
              fill="var(--color-text-secondary)"
              textAnchor="middle"
            >
              {d}
            </text>
          ))}

          {/* X-axis title */}
          <text
            x={PADDING_LEFT + CHART_WIDTH / 2}
            y={HEIGHT}
            fontSize={10}
            fill="var(--color-text-secondary)"
            textAnchor="middle"
          >
            Days
          </text>

          {/* Y-axis labels */}
          {yLabels.map((v) => (
            <text
              key={`y-${v}`}
              x={PADDING_LEFT - 5}
              y={yScale(v) + 4}
              fontSize={10}
              fill="var(--color-text-secondary)"
              textAnchor="end"
            >
              {Math.round(v * 100)}%
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export { RetentionForecastChart };
export type { RetentionForecastChartProps, RetentionForecastCardData };
