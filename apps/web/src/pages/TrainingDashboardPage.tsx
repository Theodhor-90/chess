import { useNavigate } from "react-router";
import { useGetTrainingDashboardQuery } from "../store/apiSlice.js";
import type { RepertoireTrainingSummary } from "@chess/shared";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { PageSkeleton } from "../components/ui/Skeleton.js";
import styles from "./TrainingDashboardPage.module.css";

function formatRetention(retention: number | null): string {
  if (retention === null) return "—";
  return `${Math.round(retention * 100)}%`;
}

export function TrainingDashboardPage() {
  const { data, isLoading, isError } = useGetTrainingDashboardQuery();
  const navigate = useNavigate();

  if (isLoading) {
    return <PageSkeleton testId="training-dashboard-loading" />;
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <p className={styles.errorText}>Failed to load training dashboard.</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Empty state: no repertoires
  if (data.repertoires.length === 0) {
    return (
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Training Dashboard</h1>
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            No repertoires to train. Create a repertoire and add some moves to get started.
          </p>
          <Button onClick={() => navigate("/repertoires")}>Go to Repertoires</Button>
        </div>
      </div>
    );
  }

  // Find repertoire with the most due cards for "Start Training" button
  const topRep = data.repertoires.reduce<RepertoireTrainingSummary | null>((best, rep) => {
    if (!best) return rep;
    return rep.dueToday > best.dueToday ? rep : best;
  }, null);

  function handleStartTraining() {
    if (topRep && topRep.dueToday > 0) {
      navigate(`/repertoires/${topRep.id}/train`);
    }
  }

  return (
    <div className={styles.page} data-testid="training-dashboard">
      <h1 className={styles.pageTitle}>Training Dashboard</h1>

      {/* Daily Review Summary */}
      <Card>
        <div className={styles.dailySummary}>
          <div className={styles.dueDisplay}>
            <span className={styles.dueCount} data-testid="total-due-count">
              {data.totalDueToday}
            </span>
            <span className={styles.dueLabel}>cards due today</span>
          </div>

          <div className={styles.summaryActions}>
            <Button
              onClick={handleStartTraining}
              disabled={data.totalDueToday === 0}
              data-testid="start-training-button"
            >
              Start Training
            </Button>
          </div>

          <div className={styles.streakDisplay}>
            <span className={styles.streakCount} data-testid="current-streak">
              {data.currentStreak}
            </span>
            <span className={styles.streakLabel}>day streak</span>
          </div>
        </div>

        {/* Per-repertoire due breakdown */}
        {data.totalDueToday > 0 && (
          <div className={styles.dueBreakdown} data-testid="due-breakdown">
            {data.repertoires
              .filter((rep) => rep.dueToday > 0)
              .sort((a, b) => b.dueToday - a.dueToday)
              .map((rep) => (
                <div key={rep.id} className={styles.dueBreakdownItem}>
                  <Badge variant={rep.color === "white" ? "neutral" : "info"} size="sm">
                    {rep.color === "white" ? "W" : "B"}
                  </Badge>
                  <span className={styles.dueRepName}>{rep.name}</span>
                  <span className={styles.dueRepCount}>{rep.dueToday} due</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/repertoires/${rep.id}/train`)}
                  >
                    Train
                  </Button>
                </div>
              ))}
          </div>
        )}
      </Card>

      {/* Overview stats row */}
      <div className={styles.overviewRow}>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{data.totalCards}</span>
          <span className={styles.statLabel}>Total Cards</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{formatRetention(data.overallRetention)}</span>
          <span className={styles.statLabel}>Overall Retention</span>
        </div>
        <div className={styles.statBox}>
          <span className={styles.statValue}>{data.repertoires.length}</span>
          <span className={styles.statLabel}>Repertoires</span>
        </div>
      </div>

      {/* Per-repertoire stats cards */}
      <h2 className={styles.sectionTitle}>Repertoires</h2>
      <div className={styles.repGrid} data-testid="repertoire-stats">
        {data.repertoires.map((rep) => (
          <div key={rep.id} className={styles.repCard}>
            <div className={styles.repCardHeader}>
              <span className={styles.repCardName}>{rep.name}</span>
              <Badge variant={rep.color === "white" ? "neutral" : "info"} size="sm">
                {rep.color === "white" ? "White" : "Black"}
              </Badge>
            </div>
            <div className={styles.repCardStats}>
              <div className={styles.repStat}>
                <span className={styles.repStatValue}>{rep.totalCards}</span>
                <span className={styles.repStatLabel}>Total</span>
              </div>
              <div className={styles.repStat}>
                <span className={styles.repStatValue}>{rep.masteredCount}</span>
                <span className={styles.repStatLabel}>Mastered</span>
              </div>
              <div className={styles.repStat}>
                <span className={styles.repStatValue}>{rep.learningCount}</span>
                <span className={styles.repStatLabel}>Learning</span>
              </div>
              <div className={styles.repStat}>
                <span className={styles.repStatValue}>{rep.newCount}</span>
                <span className={styles.repStatLabel}>New</span>
              </div>
              <div className={styles.repStat}>
                <span className={styles.repStatValue}>{rep.dueToday}</span>
                <span className={styles.repStatLabel}>Due</span>
              </div>
              <div className={styles.repStat}>
                <span className={styles.repStatValue}>{formatRetention(rep.retention)}</span>
                <span className={styles.repStatLabel}>Retention</span>
              </div>
            </div>
            <div className={styles.repCardActions}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/repertoires/${rep.id}/train`)}
                disabled={rep.dueToday === 0 && rep.newCount === 0}
              >
                Train ({rep.dueToday})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/repertoires/${rep.id}`)}>
                Builder
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
