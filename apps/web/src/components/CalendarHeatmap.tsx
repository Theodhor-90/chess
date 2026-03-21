import { useMemo } from "react";
import styles from "./CalendarHeatmap.module.css";

interface CalendarHeatmapProps {
  data: Array<{ date: string; count: number }>;
  months?: number;
}

/** Map a review count to a CSS intensity level class name (0–4). */
function getLevel(count: number): string {
  if (count === 0) return styles.level0;
  if (count <= 5) return styles.level1;
  if (count <= 15) return styles.level2;
  if (count <= 30) return styles.level3;
  return styles.level4;
}

/** Format a Date as "YYYY-MM-DD" in UTC. */
function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Short month names for labels. */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Day labels: only M, W, F are shown; others are empty. */
const DAY_LABELS = ["", "M", "", "W", "", "F", ""];

function CalendarHeatmap({ data, months = 6 }: CalendarHeatmapProps) {
  const { cells, monthPositions } = useMemo(() => {
    // Build lookup map: date string → count
    const countMap = new Map<string, number>();
    for (const entry of data) {
      countMap.set(entry.date, entry.count);
    }

    // Determine date range: from the start of the week `months` months ago to today
    const today = new Date();
    const endDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const startDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate()),
    );

    // Align startDate to the most recent Monday on or before it
    // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
    const startDay = startDate.getUTCDay();
    const daysFromMonday = startDay === 0 ? 6 : startDay - 1;
    startDate.setUTCDate(startDate.getUTCDate() - daysFromMonday);

    // Generate cells column by column (each column = one week, rows = Mon–Sun)
    const cellList: Array<{ date: string; count: number; dayOfWeek: number }> = [];
    const monthPos: Array<{ name: string; column: number }> = [];
    let lastMonth = -1;
    let column = 0;

    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      // Process one week (7 days)
      for (let dayRow = 0; dayRow < 7; dayRow++) {
        const dateStr = formatDate(cursor);
        const count = countMap.get(dateStr) ?? 0;

        // Track month boundaries (when first day of a column starts a new month)
        if (dayRow === 0) {
          const curMonth = cursor.getUTCMonth();
          if (curMonth !== lastMonth) {
            monthPos.push({ name: MONTH_NAMES[curMonth], column });
            lastMonth = curMonth;
          }
        }

        // Only add if date is <= today (don't render future dates)
        if (cursor <= endDate) {
          cellList.push({ date: dateStr, count, dayOfWeek: dayRow });
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      column++;
    }

    return { cells: cellList, monthPositions: monthPos };
  }, [data, months]);

  // Number of total weeks (columns)
  const totalColumns = Math.ceil(cells.length / 7);

  // Build month labels with column offsets
  // Each column is 12px cell + 2px gap = 14px wide
  const CELL_SIZE = 14; // 12px + 2px gap

  return (
    <div className={styles.container}>
      {/* Month labels row */}
      <div className={styles.monthLabels}>
        {monthPositions.map((mp, i) => {
          const nextCol =
            i + 1 < monthPositions.length ? monthPositions[i + 1].column : totalColumns;
          const spanCols = nextCol - mp.column;
          return (
            <span
              key={`${mp.name}-${mp.column}`}
              className={styles.monthLabel}
              style={{ width: `${spanCols * CELL_SIZE}px` }}
            >
              {mp.name}
            </span>
          );
        })}
      </div>

      {/* Day labels + grid */}
      <div className={styles.gridWrapper}>
        {/* Day labels (M, W, F on left side) */}
        <div className={styles.dayLabels}>
          {DAY_LABELS.map((label, i) => (
            <span key={i} className={styles.dayLabel}>
              {label}
            </span>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className={styles.grid}>
          {cells.map((cell) => (
            <div
              key={cell.date}
              className={`${styles.cell} ${getLevel(cell.count)}`}
              data-tooltip={`${cell.count} review${cell.count !== 1 ? "s" : ""} on ${cell.date}`}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <span>Less</span>
        <span className={`${styles.legendCell} ${styles.level0}`} />
        <span className={`${styles.legendCell} ${styles.level1}`} />
        <span className={`${styles.legendCell} ${styles.level2}`} />
        <span className={`${styles.legendCell} ${styles.level3}`} />
        <span className={`${styles.legendCell} ${styles.level4}`} />
        <span>More</span>
      </div>
    </div>
  );
}

export { CalendarHeatmap };
export type { CalendarHeatmapProps };
