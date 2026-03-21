import { useNavigate } from "react-router";
import type { RepertoireTrainingSummary } from "@chess/shared";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import styles from "./RepertoireStatsCard.module.css";

interface RepertoireStatsCardProps {
  summary: RepertoireTrainingSummary;
}

/** Format retention as a percentage string or em-dash for null. */
function formatRetention(retention: number | null): string {
  if (retention === null) return "—";
  return `${Math.round(retention * 100)}%`;
}

/** Estimate daily review time: 8 seconds per due card, formatted as minutes. */
function formatEstimatedTime(dueCount: number): string {
  const totalSeconds = dueCount * 8;
  if (totalSeconds < 60) return `<1 min`;
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} min`;
}

function RepertoireStatsCard({ summary }: RepertoireStatsCardProps) {
  const navigate = useNavigate();
  const {
    id,
    name,
    color,
    totalCards,
    dueToday,
    newCount,
    learningCount,
    reviewCount,
    masteredCount,
    retention,
  } = summary;

  // Compute breakdown bar widths as percentages
  const total = newCount + learningCount + reviewCount + masteredCount;
  const newPct = total > 0 ? (newCount / total) * 100 : 0;
  const learningPct = total > 0 ? (learningCount / total) * 100 : 0;
  const reviewPct = total > 0 ? (reviewCount / total) * 100 : 0;
  const masteredPct = total > 0 ? (masteredCount / total) * 100 : 0;

  return (
    <div className={styles.card} data-testid={`repertoire-stats-card-${id}`}>
      {/* Header: name + color badge */}
      <div className={styles.header}>
        <span className={styles.name}>{name}</span>
        <Badge variant={color === "white" ? "neutral" : "info"} size="sm">
          {color === "white" ? "White" : "Black"}
        </Badge>
      </div>

      {/* Card breakdown bar */}
      {total > 0 && (
        <>
          <div className={styles.breakdownBar}>
            {newPct > 0 && <span className={styles.barNew} style={{ width: `${newPct}%` }} />}
            {learningPct > 0 && (
              <span className={styles.barLearning} style={{ width: `${learningPct}%` }} />
            )}
            {reviewPct > 0 && (
              <span className={styles.barReview} style={{ width: `${reviewPct}%` }} />
            )}
            {masteredPct > 0 && (
              <span className={styles.barMastered} style={{ width: `${masteredPct}%` }} />
            )}
          </div>

          {/* Breakdown labels */}
          <div className={styles.breakdownLabels}>
            <span className={styles.breakdownLabel}>
              <span className={`${styles.breakdownDot} ${styles.barNew}`} />
              New ({newCount})
            </span>
            <span className={styles.breakdownLabel}>
              <span className={`${styles.breakdownDot} ${styles.barLearning}`} />
              Learning ({learningCount})
            </span>
            <span className={styles.breakdownLabel}>
              <span className={`${styles.breakdownDot} ${styles.barReview}`} />
              Review ({reviewCount})
            </span>
            <span className={styles.breakdownLabel}>
              <span className={`${styles.breakdownDot} ${styles.barMastered}`} />
              Mastered ({masteredCount})
            </span>
          </div>
        </>
      )}

      {/* Key stats */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{totalCards}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{dueToday}</span>
          <span className={styles.statLabel}>Due</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatRetention(retention)}</span>
          <span className={styles.statLabel}>Retention</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatEstimatedTime(dueToday)}</span>
          <span className={styles.statLabel}>Est. Time</span>
        </div>
      </div>

      {/* Actions — both Train and Builder buttons */}
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(`/repertoires/${id}/train`)}
          disabled={dueToday === 0 && newCount === 0}
        >
          Train ({dueToday})
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/repertoires/${id}`)}>
          Builder
        </Button>
      </div>
    </div>
  );
}

export { RepertoireStatsCard };
export type { RepertoireStatsCardProps };
