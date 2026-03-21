import styles from "./TrainingFeedback.module.css";

interface TrainingFeedbackProps {
  feedbackType: "correct" | "wrong" | null;
  correctMoveSan: string | null;
  isEasyRating: boolean;
}

export function TrainingFeedback({
  feedbackType,
  correctMoveSan,
  isEasyRating,
}: TrainingFeedbackProps) {
  if (!feedbackType) return null;

  if (feedbackType === "correct") {
    return (
      <div className={styles.overlay} data-testid="training-feedback">
        <span className={`${styles.message} ${styles.correct}`}>
          {isEasyRating ? "Excellent!" : "Good!"}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.overlay} data-testid="training-feedback">
      <span className={`${styles.message} ${styles.wrong}`}>
        Try again
        {correctMoveSan && <span className={styles.wrongDetail}>Correct: {correctMoveSan}</span>}
      </span>
    </div>
  );
}
