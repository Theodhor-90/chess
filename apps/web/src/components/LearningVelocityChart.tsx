import { useMemo } from "react";
import styles from "./LearningVelocityChart.module.css";

interface LearningVelocityDataPoint {
  date: string;
  newCardsLearned: number;
}

interface LearningVelocityChartProps {
  data: LearningVelocityDataPoint[];
}

// Chart dimensions
const WIDTH = 560;
const HEIGHT = 200;
const PADDING_LEFT = 35;
const PADDING_RIGHT = 15;
const PADDING_TOP = 15;
const PADDING_BOTTOM = 40;
const CHART_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

/**
 * Compute linear regression: y = slope * x + intercept
 * slope = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
 * intercept = (Σy - slope*Σx) / n
 */
function linearRegression(points: Array<{ x: number; y: number }>): {
  slope: number;
  intercept: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function LearningVelocityChart({ data }: LearningVelocityChartProps) {
  const { bars, maxCount, trendLine, dateLabels } = useMemo(() => {
    if (data.length === 0) {
      return { bars: [], maxCount: 0, trendLine: null, dateLabels: [] };
    }

    // Build a full 30-day array keyed by date
    const today = new Date();
    const dayEntries: Array<{ date: string; count: number }> = [];
    const countMap = new Map<string, number>();
    for (const entry of data) {
      countMap.set(entry.date, entry.newCardsLearned);
    }

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${day}`;
      dayEntries.push({ date: dateStr, count: countMap.get(dateStr) ?? 0 });
    }

    const max = Math.max(1, ...dayEntries.map((e) => e.count));

    // Linear regression
    const regressionPoints = dayEntries.map((e, i) => ({ x: i, y: e.count }));
    const { slope, intercept } = linearRegression(regressionPoints);

    // Bar dimensions
    const barWidth = CHART_WIDTH / 30;
    const barsData = dayEntries.map((entry, i) => ({
      x: PADDING_LEFT + i * barWidth + barWidth * 0.15,
      width: barWidth * 0.7,
      height: max > 0 ? (entry.count / max) * CHART_HEIGHT : 0,
      count: entry.count,
      date: entry.date,
    }));

    // Trend line endpoints
    const trendY0 = intercept;
    const trendY29 = slope * 29 + intercept;
    const trendLineData = {
      x1: PADDING_LEFT + barWidth * 0.5,
      y1: PADDING_TOP + CHART_HEIGHT - (Math.max(0, trendY0) / max) * CHART_HEIGHT,
      x2: PADDING_LEFT + 29 * barWidth + barWidth * 0.5,
      y2: PADDING_TOP + CHART_HEIGHT - (Math.max(0, trendY29) / max) * CHART_HEIGHT,
    };

    // Date labels (every 5th)
    const labels = dayEntries
      .filter((_, i) => i % 5 === 0 || i === 29)
      .map((e, _i, _arr) => ({
        date: e.date.slice(5), // MM-DD
        x: PADDING_LEFT + dayEntries.indexOf(e) * barWidth + barWidth * 0.5,
      }));

    return { bars: barsData, maxCount: max, trendLine: trendLineData, dateLabels: labels };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Learning Velocity</h2>
        <p className={styles.emptyText}>
          No new cards learned yet. Start training to track your learning pace.
        </p>
      </div>
    );
  }

  // Y-axis labels
  const yTicks = [
    0,
    Math.ceil(maxCount / 4),
    Math.ceil(maxCount / 2),
    Math.ceil((maxCount * 3) / 4),
    maxCount,
  ];
  // Remove duplicates (can happen when maxCount is small)
  const uniqueYTicks = [...new Set(yTicks)];

  return (
    <div className={styles.container} data-testid="learning-velocity">
      <h2 className={styles.title}>Learning Velocity</h2>
      <div className={styles.chartWrapper}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          style={{ maxWidth: `${WIDTH}px` }}
          role="img"
          aria-label="30-day learning velocity chart"
        >
          {/* Grid lines */}
          {uniqueYTicks.map((v) => (
            <line
              key={`grid-${v}`}
              x1={PADDING_LEFT}
              y1={PADDING_TOP + CHART_HEIGHT - (v / maxCount) * CHART_HEIGHT}
              x2={WIDTH - PADDING_RIGHT}
              y2={PADDING_TOP + CHART_HEIGHT - (v / maxCount) * CHART_HEIGHT}
              stroke="var(--color-border-light)"
              strokeWidth={1}
            />
          ))}

          {/* Bars */}
          {bars.map((bar) => (
            <rect
              key={bar.date}
              x={bar.x}
              y={PADDING_TOP + CHART_HEIGHT - bar.height}
              width={bar.width}
              height={bar.height}
              fill="var(--color-primary)"
              opacity={0.7}
              rx={2}
            >
              <title>{`${bar.date}: ${bar.count} new cards`}</title>
            </rect>
          ))}

          {/* Trend line */}
          {trendLine && (
            <line
              x1={trendLine.x1}
              y1={trendLine.y1}
              x2={trendLine.x2}
              y2={trendLine.y2}
              stroke="var(--color-error)"
              strokeWidth={2}
              strokeDasharray="4 2"
              data-testid="trend-line"
            />
          )}

          {/* X-axis date labels */}
          {dateLabels.map((label) => (
            <text
              key={label.date}
              x={label.x}
              y={HEIGHT - 10}
              fontSize={9}
              fill="var(--color-text-secondary)"
              textAnchor="middle"
              transform={`rotate(-30, ${label.x}, ${HEIGHT - 10})`}
            >
              {label.date}
            </text>
          ))}

          {/* Y-axis labels */}
          {uniqueYTicks.map((v) => (
            <text
              key={`y-${v}`}
              x={PADDING_LEFT - 5}
              y={PADDING_TOP + CHART_HEIGHT - (v / maxCount) * CHART_HEIGHT + 4}
              fontSize={10}
              fill="var(--color-text-secondary)"
              textAnchor="end"
            >
              {v}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export { LearningVelocityChart };
export type { LearningVelocityChartProps, LearningVelocityDataPoint };
