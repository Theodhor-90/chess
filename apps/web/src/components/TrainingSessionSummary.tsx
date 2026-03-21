import { useGetTrainingStatsQuery } from "../store/apiSlice.js";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import styles from "./TrainingSessionSummary.module.css";

interface TrainingSessionSummaryProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onStudyNew: () => void;
  sessionStats: { correct: number; incorrect: number; total: number; hintUsed: number };
  dueCount: number;
  newCount: number;
  repertoireId: number;
}

export function TrainingSessionSummary({
  isOpen,
  onClose,
  onContinue,
  onStudyNew,
  sessionStats,
  dueCount,
  newCount,
  repertoireId,
}: TrainingSessionSummaryProps) {
  const { data: stats } = useGetTrainingStatsQuery(repertoireId);

  const accuracy =
    sessionStats.total > 0 ? Math.round((sessionStats.correct / sessionStats.total) * 100) : 0;

  const retentionPercent =
    stats?.averageRetention != null ? `${Math.round(stats.averageRetention * 100)}%` : "—";

  let nextReviewText: string;
  if (dueCount > 0) {
    nextReviewText = `${dueCount} card${dueCount !== 1 ? "s" : ""} still due`;
  } else if (stats && stats.dueTomorrow > 0) {
    nextReviewText = "Next review tomorrow";
  } else {
    nextReviewText = "No reviews scheduled";
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Session Complete"
      footer={
        <div className={styles.footerButtons}>
          {dueCount > 0 && (
            <Button variant="secondary" onClick={onContinue} data-testid="summary-continue-button">
              Continue
            </Button>
          )}
          {newCount > 0 && (
            <Button variant="secondary" onClick={onStudyNew} data-testid="summary-study-new-button">
              Study New Cards
            </Button>
          )}
          <Button onClick={onClose} data-testid="summary-done-button">
            Done
          </Button>
        </div>
      }
    >
      <div className={styles.summaryGrid} data-testid="session-summary">
        <div className={styles.statRow}>
          <span className={styles.statName}>Cards reviewed</span>
          <span className={styles.statValue} data-testid="summary-total">
            {sessionStats.total}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statName}>Accuracy</span>
          <span className={styles.statValue} data-testid="summary-accuracy">
            {accuracy}%
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statName}>Correct</span>
          <span className={styles.statValue} data-testid="summary-correct">
            {sessionStats.correct}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statName}>Wrong</span>
          <span className={styles.statValue} data-testid="summary-incorrect">
            {sessionStats.incorrect}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statName}>Hints used</span>
          <span className={styles.statValue} data-testid="summary-hints">
            {sessionStats.hintUsed}
          </span>
        </div>
        {/* TODO: track per-session new→learning transitions for accurate "new cards learned" count */}
        <div className={styles.statRow}>
          <span className={styles.statName}>New cards learned</span>
          <span className={styles.statValue} data-testid="summary-new-learned">
            {stats?.learningCount ?? "—"}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statName}>Retention estimate</span>
          <span className={styles.statValue} data-testid="summary-retention">
            {retentionPercent}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statName}>Next review</span>
          <span className={styles.statValue} data-testid="summary-next-review">
            {nextReviewText}
          </span>
        </div>
      </div>
    </Modal>
  );
}
