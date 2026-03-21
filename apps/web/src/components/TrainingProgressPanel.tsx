import { useGetTrainingStatsQuery } from "../store/apiSlice.js";
import { Badge } from "./ui/Badge.js";
import { Card } from "./ui/Card.js";
import type { DrillPhase } from "../hooks/useTrainingDrill.js";
import styles from "./TrainingProgressPanel.module.css";

interface TrainingProgressPanelProps {
  lineProgress: { current: number; total: number };
  sessionStats: { correct: number; incorrect: number; total: number; hintUsed: number };
  dueCount: number;
  newCount: number;
  phase: DrillPhase;
  repertoireId: number;
}

const PHASE_LABELS: Record<DrillPhase, string> = {
  loading: "Loading...",
  idle: "Ready",
  opponent_turn: "Opponent's turn",
  user_turn: "Your turn",
  feedback: "Feedback",
  line_complete: "Line complete",
  session_complete: "Session complete",
};

export function TrainingProgressPanel({
  lineProgress,
  sessionStats,
  dueCount,
  newCount,
  phase,
  repertoireId,
}: TrainingProgressPanelProps) {
  const { data: stats } = useGetTrainingStatsQuery(repertoireId);

  const progressPercent =
    lineProgress.total > 0 ? Math.round((lineProgress.current / lineProgress.total) * 100) : 0;

  const retentionPercent =
    stats?.averageRetention != null ? Math.round(stats.averageRetention * 100) : null;

  return (
    <Card header="Progress">
      <div className={styles.panel} data-testid="training-progress-panel">
        {/* Phase status */}
        <div className={styles.phaseText}>{PHASE_LABELS[phase]}</div>

        {/* Line progress */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Line Progress</span>
          <div className={styles.progressBarTrack}>
            <div
              className={styles.progressBarFill}
              style={{ width: `${progressPercent}%` }}
              data-testid="progress-bar-fill"
            />
          </div>
          <span className={styles.progressText} data-testid="line-progress-text">
            Move {lineProgress.current} of {lineProgress.total}
          </span>
        </div>

        {/* Session stats */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Session Stats</span>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <span
                className={`${styles.statValue} ${styles.statValueCorrect}`}
                data-testid="stat-correct"
              >
                {sessionStats.correct}
              </span>
              <span className={styles.statLabel}>Correct</span>
            </div>
            <div className={styles.stat}>
              <span
                className={`${styles.statValue} ${styles.statValueIncorrect}`}
                data-testid="stat-incorrect"
              >
                {sessionStats.incorrect}
              </span>
              <span className={styles.statLabel}>Wrong</span>
            </div>
            <div className={styles.stat}>
              <span
                className={`${styles.statValue} ${styles.statValueNeutral}`}
                data-testid="stat-hints"
              >
                {sessionStats.hintUsed}
              </span>
              <span className={styles.statLabel}>Hints</span>
            </div>
          </div>
        </div>

        {/* Due cards */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Remaining</span>
          <span className={styles.dueText} data-testid="due-count-text">
            {dueCount} card{dueCount !== 1 ? "s" : ""} remaining
          </span>
          {newCount > 0 && (
            <span className={styles.dueText} data-testid="new-count-text">
              {newCount} new card{newCount !== 1 ? "s" : ""} available
            </span>
          )}
        </div>

        {/* Retention */}
        {retentionPercent !== null && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Retention</span>
            <Badge
              variant={
                retentionPercent >= 80 ? "success" : retentionPercent >= 60 ? "warning" : "danger"
              }
              size="sm"
            >
              {retentionPercent}%
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
}
