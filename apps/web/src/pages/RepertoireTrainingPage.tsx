import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router";
import { useGetRepertoireQuery } from "../store/apiSlice.js";
import { useTrainingDrill } from "../hooks/useTrainingDrill.js";
import { TrainingBoard } from "../components/TrainingBoard.js";
import { TrainingFeedback } from "../components/TrainingFeedback.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { PageSkeleton } from "../components/ui/Skeleton.js";
import styles from "./RepertoireTrainingPage.module.css";

export function RepertoireTrainingPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const repertoireId = Number(idParam);

  const {
    data: repertoire,
    isLoading: repertoireLoading,
    isError: repertoireError,
  } = useGetRepertoireQuery(repertoireId, { skip: isNaN(repertoireId) });

  const drill = useTrainingDrill(repertoireId);

  // Track response timing for Easy rating ("Excellent!" feedback)
  const [wasEasyResponse, setWasEasyResponse] = useState(false);
  const responseTimerRef = useRef<number>(0);

  // Track hint usage per individual move (resets each user_turn)
  const [hintUsedForCurrentMove, setHintUsedForCurrentMove] = useState(false);

  useEffect(() => {
    if (drill.phase === "user_turn") {
      responseTimerRef.current = performance.now();
      setWasEasyResponse(false);
      setHintUsedForCurrentMove(false);
    }
  }, [drill.phase]);

  const handleBoardMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const elapsed = performance.now() - responseTimerRef.current;
      if (elapsed < 2000) {
        setWasEasyResponse(true);
      }
      drill.makeMove(from, to, promotion);
    },
    [drill],
  );

  const handleHint = useCallback(() => {
    setHintUsedForCurrentMove(true);
    drill.useHint();
  }, [drill]);

  if (isNaN(repertoireId)) {
    return (
      <div className={styles.page}>
        <p className={styles.errorText}>Invalid repertoire ID</p>
      </div>
    );
  }

  if (repertoireLoading) {
    return <PageSkeleton testId="repertoire-training-loading" />;
  }

  if (repertoireError || !repertoire) {
    return (
      <div className={styles.page}>
        <p className={styles.errorText}>
          Repertoire not found. <Link to="/repertoires">Back to repertoires</Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="repertoire-training-page">
      <div className={styles.header}>
        <h1 className={styles.title}>Train: {repertoire.name}</h1>
        <div className={styles.headerMeta}>
          <Badge variant={repertoire.color === "white" ? "neutral" : "info"} size="sm">
            {repertoire.color === "white" ? "White" : "Black"}
          </Badge>
          <Link to={`/repertoires/${repertoireId}`}>
            <Button variant="secondary" size="sm">
              Back to Builder
            </Button>
          </Link>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.boardColumn}>
          <div className={styles.boardContainer}>
            <TrainingBoard
              currentFen={drill.currentFen}
              userSide={drill.userSide}
              phase={drill.phase}
              correctMove={drill.correctMove}
              feedbackType={drill.feedbackType}
              hintActive={hintUsedForCurrentMove}
              onMove={handleBoardMove}
            />
            <TrainingFeedback
              feedbackType={drill.feedbackType}
              correctMoveSan={drill.correctMove?.san ?? null}
              isEasyRating={
                wasEasyResponse && drill.feedbackType === "correct" && !hintUsedForCurrentMove
              }
            />
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            {drill.phase === "idle" && (
              <Button onClick={drill.startLine} data-testid="start-line-button">
                Start
              </Button>
            )}
            {drill.phase === "user_turn" && (
              <Button variant="secondary" size="sm" onClick={handleHint} data-testid="hint-button">
                Hint (H)
              </Button>
            )}
            {drill.phase === "line_complete" && (
              <Button onClick={drill.nextLine} data-testid="next-line-button">
                Next Line
              </Button>
            )}
            {drill.phase !== "session_complete" && drill.phase !== "loading" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={drill.endSession}
                data-testid="end-session-button"
              >
                End Session
              </Button>
            )}
            {drill.phase === "session_complete" && (
              <Link to={`/repertoires/${repertoireId}`}>
                <Button data-testid="done-button">Done</Button>
              </Link>
            )}
          </div>
        </div>

        <div className={styles.sidePanel}>
          {/* Progress placeholder — t03 will replace with full progress panel */}
          <Card header="Progress">
            <div className={styles.progressPlaceholder}>
              <p>Phase: {drill.phase}</p>
              <p>
                Line: {drill.lineProgress.current} / {drill.lineProgress.total}
              </p>
              <p>
                Due: {drill.dueCount} | New: {drill.newCount}
              </p>
              <p>
                Correct: {drill.sessionStats.correct} | Wrong: {drill.sessionStats.incorrect} |
                Hints: {drill.sessionStats.hintUsed}
              </p>
            </div>
          </Card>

          {drill.phase === "session_complete" && (
            <Card header="Session Summary">
              <div className={styles.progressPlaceholder}>
                <p>
                  Total: {drill.sessionStats.total} | Correct: {drill.sessionStats.correct} | Wrong:{" "}
                  {drill.sessionStats.incorrect}
                </p>
                <p>
                  Accuracy:{" "}
                  {drill.sessionStats.total > 0
                    ? Math.round((drill.sessionStats.correct / drill.sessionStats.total) * 100)
                    : 0}
                  %
                </p>
              </div>
            </Card>
          )}

          {drill.error && <p className={styles.errorText}>{drill.error}</p>}
        </div>
      </div>
    </div>
  );
}
