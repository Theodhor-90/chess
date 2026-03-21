import { useCallback, useEffect, useRef, useState } from "react";
import { ReviewRating } from "@chess/shared";
import type { TrainingLineMove } from "@chess/shared";
import {
  useLazyGetTrainingNextQuery,
  useSubmitTrainingReviewMutation,
  useGetTrainingStatsQuery,
} from "../store/apiSlice.js";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type DrillPhase =
  | "loading"
  | "idle"
  | "opponent_turn"
  | "user_turn"
  | "feedback"
  | "line_complete"
  | "session_complete";

export interface SessionStats {
  correct: number;
  incorrect: number;
  total: number;
  hintUsed: number;
}

export interface DrillState {
  phase: DrillPhase;
  currentFen: string;
  correctMove: { san: string; uci: string } | null;
  userSide: "white" | "black";
  lineProgress: { current: number; total: number };
  feedbackType: "correct" | "wrong" | null;
  dueCount: number;
  newCount: number;
  sessionStats: SessionStats;
  error: string | null;
}

export interface DrillActions {
  makeMove: (from: string, to: string, promotion?: string) => void;
  useHint: () => void;
  startLine: () => void;
  nextLine: () => void;
  endSession: () => void;
}

export function useTrainingDrill(repertoireId: number): DrillState & DrillActions {
  const [phase, setPhase] = useState<DrillPhase>("loading");
  const [line, setLine] = useState<TrainingLineMove[] | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [userSide, setUserSide] = useState<"white" | "black">("white");
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    correct: 0,
    incorrect: 0,
    total: 0,
    hintUsed: 0,
  });
  const [hintActive, setHintActive] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentCardId, setCurrentCardId] = useState<number | null>(null);

  const timerStartRef = useRef<number | null>(null);
  const alreadyRatedRef = useRef(false);
  const lineRef = useRef<TrainingLineMove[] | null>(null);
  const lineIndexRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [triggerGetNext] = useLazyGetTrainingNextQuery();
  const [submitReview] = useSubmitTrainingReviewMutation();
  useGetTrainingStatsQuery(repertoireId);

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const advanceLine = useCallback(() => {
    const currentLine = lineRef.current;
    const nextIndex = lineIndexRef.current + 1;
    lineIndexRef.current = nextIndex;
    setLineIndex(nextIndex);

    if (!currentLine || nextIndex >= currentLine.length) {
      setPhase("line_complete");
      return;
    }

    const move = currentLine[nextIndex];
    if (!move.isUserMove) {
      setPhase("opponent_turn");
      addTimeout(() => {
        advanceLine();
      }, 300);
    } else {
      setPhase("user_turn");
      timerStartRef.current = performance.now();
      setCurrentCardId(move.cardId);
      setHintActive(false);
      alreadyRatedRef.current = false;
    }
  }, [addTimeout]);

  const fetchNextLine = useCallback(async () => {
    setPhase("loading");
    try {
      const response = await triggerGetNext(repertoireId, true).unwrap();
      if (response.line === null) {
        setPhase("session_complete");
        return;
      }
      setLine(response.line);
      lineRef.current = response.line;
      setLineIndex(0);
      lineIndexRef.current = 0;
      setDueCount(response.dueCount);
      setNewCount(response.newCount);
      setPhase("idle");

      const firstUserMove = response.line.find((m) => m.isUserMove);
      if (firstUserMove) {
        const fenParts = firstUserMove.fen.split(" ");
        const toMove = fenParts[1];
        setUserSide(toMove === "w" ? "white" : "black");
      } else {
        setUserSide("white");
      }
    } catch {
      setError("Failed to load training line");
      setPhase("session_complete");
    }
  }, [repertoireId, triggerGetNext]);

  const startLine = useCallback(() => {
    if (phase !== "idle") return;
    setHintActive(false);
    advanceLine();
  }, [phase, advanceLine]);

  const makeMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (phase !== "user_turn") return;
      const currentLine = lineRef.current;
      const idx = lineIndexRef.current;
      if (!currentLine || idx >= currentLine.length) return;

      const userUci = `${from}${to}${promotion ?? ""}`;
      const correctUci = currentLine[idx].uci;

      if (userUci === correctUci) {
        setFeedbackType("correct");
        setPhase("feedback");
        if (!alreadyRatedRef.current) {
          const elapsed = performance.now() - (timerStartRef.current ?? performance.now());
          let rating: ReviewRating;
          if (hintActive) {
            rating = ReviewRating.Hard;
          } else if (elapsed < 2000) {
            rating = ReviewRating.Easy;
          } else {
            rating = ReviewRating.Good;
          }
          setSessionStats((prev) => ({
            ...prev,
            correct: prev.correct + 1,
            total: prev.total + 1,
          }));
          submitReview({ repertoireId, body: { cardId: currentCardId!, rating } });
        }
        addTimeout(() => {
          setFeedbackType(null);
          advanceLine();
        }, 500);
      } else {
        setFeedbackType("wrong");
        setPhase("feedback");
        if (!alreadyRatedRef.current) {
          setSessionStats((prev) => ({
            ...prev,
            incorrect: prev.incorrect + 1,
            total: prev.total + 1,
          }));
          submitReview({
            repertoireId,
            body: { cardId: currentCardId!, rating: ReviewRating.Again },
          });
          alreadyRatedRef.current = true;
        }
        addTimeout(() => {
          setFeedbackType(null);
          setPhase("user_turn");
          timerStartRef.current = performance.now();
        }, 1500);
      }
    },
    [phase, hintActive, currentCardId, repertoireId, submitReview, advanceLine, addTimeout],
  );

  const useHintAction = useCallback(() => {
    if (phase !== "user_turn") return;
    setHintActive(true);
    setSessionStats((prev) => ({ ...prev, hintUsed: prev.hintUsed + 1 }));
  }, [phase]);

  const nextLine = useCallback(() => {
    if (phase !== "line_complete") return;
    fetchNextLine();
  }, [phase, fetchNextLine]);

  const endSession = useCallback(() => {
    setPhase("session_complete");
  }, []);

  useEffect(() => {
    fetchNextLine();
  }, [fetchNextLine]);

  useEffect(() => {
    return () => {
      for (const id of timeoutsRef.current) {
        clearTimeout(id);
      }
      timeoutsRef.current = [];
    };
  }, []);

  const currentFen =
    line && phase !== "loading" && lineIndex < line.length
      ? `${line[lineIndex].fen} 0 1`
      : STARTING_FEN;

  const correctMove =
    (phase === "user_turn" || phase === "feedback") && line && lineIndex < line.length
      ? { san: line[lineIndex].san!, uci: line[lineIndex].uci! }
      : null;

  return {
    phase,
    currentFen,
    correctMove,
    userSide,
    lineProgress: { current: lineIndex, total: line?.length ?? 0 },
    feedbackType,
    dueCount,
    newCount,
    sessionStats,
    error,
    makeMove,
    useHint: useHintAction,
    startLine,
    nextLine,
    endSession,
  };
}
