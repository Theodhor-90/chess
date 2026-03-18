import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: "rect" | "circle";
  className?: string;
}

function Skeleton({ width, height, variant = "rect", className }: SkeletonProps) {
  const classNames = [styles.skeleton, variant === "circle" ? styles.circle : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return <div className={classNames} style={{ width, height }} aria-hidden="true" />;
}

function PageSkeleton({ testId }: { testId?: string }) {
  return (
    <div className={styles.pageContainer} data-testid={testId} aria-hidden="true">
      <Skeleton className={styles.headerLine} />
      <Skeleton className={styles.textLine} width="70%" />
      <Skeleton className={styles.textLine} width="50%" />
      <Skeleton className={styles.textLine} width="80%" />
    </div>
  );
}

function TableSkeleton({ rows = 5, testId }: { rows?: number; testId?: string }) {
  return (
    <div className={styles.tableContainer} data-testid={testId} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.tableRow}>
          <Skeleton className={styles.tableCell} />
          <Skeleton className={styles.tableCell} width="60%" />
          <Skeleton className={styles.tableCell} width="40%" />
        </div>
      ))}
    </div>
  );
}

function GamePageSkeleton({ testId }: { testId?: string }) {
  return (
    <div className={styles.pageContainer} data-testid={testId} aria-hidden="true">
      <Skeleton width="100%" height="1.5em" />
      <Skeleton width="100%" height="300px" />
      <Skeleton width="100%" height="1.5em" />
    </div>
  );
}

export { Skeleton, PageSkeleton, TableSkeleton, GamePageSkeleton };
export type { SkeletonProps };
