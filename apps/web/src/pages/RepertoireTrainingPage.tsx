import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useGetRepertoireQuery, useGetTrainingStatsQuery } from "../store/apiSlice.js";
import { useTrainingDrill } from "../hooks/useTrainingDrill.js";
import { TrainingBoard } from "../components/TrainingBoard.js";
import { TrainingFeedback } from "../components/TrainingFeedback.js";
import { TrainingProgressPanel } from "../components/TrainingProgressPanel.js";
import { TrainingSessionSummary } from "../components/TrainingSessionSummary.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { PageSkeleton } from "../components/ui/Skeleton.js";
import styles from "./RepertoireTrainingPage.module.css";

export function RepertoireTrainingPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const repertoireId = Number(idParam);
  const navigate = useNavigate();

  const {
    data: repertoire,
    isLoading: repertoireLoading,
    isError: repertoireError,
  } = useGetRepertoireQuery(repertoireId, { skip: isNaN(repertoireId) });

  const { data: stats } = useGetTrainingStatsQuery(repertoireId, { skip: isNaN(repertoireId) });

  const drill = useTrainingDrill(repertoireId);

  // Track response timing for Easy rating ("Excellent!" feedback)
  const [wasEasyResponse, setWasEasyResponse] = useState(false);
  const responseTimerRef = useRef<number>(0);

  // Track hint usage per individual move (resets each user_turn)
  const [hintUsedForCurrentMove, setHintUsedForCurrentMove] = useState(false);

  // Session summary modal state
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    if (drill.phase === "user_turn") {
      responseTimerRef.current = performance.now();
      setWasEasyResponse(false);
      setHintUsedForCurrentMove(false);
    }
  }, [drill.phase]);

  // Show summary modal when session completes (only if cards were actually reviewed)
  useEffect(() => {
    if (drill.phase === "session_complete" && drill.sessionStats.total > 0) {
      setSummaryOpen(true);
    }
  }, [drill.phase, drill.sessionStats.total]);

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

  const handleSummaryClose = useCallback(() => {
    setSummaryOpen(false);
    navigate(`/repertoires/${repertoireId}`);
  }, [navigate, repertoireId]);

  const handleSummaryContinue = useCallback(() => {
    setSummaryOpen(false);
    drill.nextLine();
  }, [drill]);

  const handleSummaryStudyNew = useCallback(() => {
    setSummaryOpen(false);
    drill.nextLine();
  }, [drill]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle keyboard shortcuts when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Prevent arrow keys during training (prevent peeking ahead)
      if (
        drill.phase !== "session_complete" &&
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown")
      ) {
        e.preventDefault();
        return;
      }

      // H — trigger hint
      if ((e.key === "h" || e.key === "H") && drill.phase === "user_turn") {
        e.preventDefault();
        handleHint();
        return;
      }

      // Escape — end session early
      if (e.key === "Escape" && drill.phase !== "session_complete" && drill.phase !== "loading") {
        e.preventDefault();
        drill.endSession();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drill, handleHint]);

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

  // Empty state: session is complete and no cards were reviewed this session
  if (drill.phase === "session_complete" && drill.sessionStats.total === 0) {
    // Sub-case: no cards at all in the repertoire
    if (stats && stats.totalCards === 0) {
      return (
        <div className={styles.page} data-testid="repertoire-training-page">
          <div className={styles.emptyState} data-testid="training-empty-no-cards">
            <h2 className={styles.emptyTitle}>No cards to train</h2>
            <p className={styles.emptyText}>
              Add moves to your repertoire first to create training cards.
            </p>
            <div className={styles.emptyActions}>
              <Link to={`/repertoires/${repertoireId}`}>
                <Button data-testid="go-to-builder-button">Go to Builder</Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    // Sub-case: cards exist but none are due (all caught up)
    return (
      <div className={styles.page} data-testid="repertoire-training-page">
        <div className={styles.emptyState} data-testid="training-empty-all-caught-up">
          <h2 className={styles.emptyTitle}>All caught up!</h2>
          <p className={styles.emptyText}>
            {stats && stats.dueTomorrow > 0
              ? `${stats.dueTomorrow} card${stats.dueTomorrow !== 1 ? "s" : ""} due tomorrow.`
              : "No reviews scheduled. Great job!"}
          </p>
          <div className={styles.emptyActions}>
            {drill.newCount > 0 && (
              <Button
                variant="secondary"
                onClick={() => drill.nextLine()}
                data-testid="study-new-cards-button"
              >
                Study New Cards ({drill.newCount})
              </Button>
            )}
            <Link to={`/repertoires/${repertoireId}`}>
              <Button data-testid="back-to-repertoire-button">Back to Repertoire</Button>
            </Link>
          </div>
        </div>
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
                End Session (Esc)
              </Button>
            )}
          </div>
        </div>

        <div className={styles.sidePanel}>
          <TrainingProgressPanel
            lineProgress={drill.lineProgress}
            sessionStats={drill.sessionStats}
            dueCount={drill.dueCount}
            newCount={drill.newCount}
            phase={drill.phase}
            repertoireId={repertoireId}
          />

          {drill.error && <p className={styles.errorText}>{drill.error}</p>}
        </div>
      </div>

      <TrainingSessionSummary
        isOpen={summaryOpen}
        onClose={handleSummaryClose}
        onContinue={handleSummaryContinue}
        onStudyNew={handleSummaryStudyNew}
        sessionStats={drill.sessionStats}
        dueCount={drill.dueCount}
        newCount={drill.newCount}
        repertoireId={repertoireId}
      />
    </div>
  );
}
