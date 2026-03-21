import { useEffect, useRef, useCallback, useMemo } from "react";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import type { DrawShape } from "chessground/draw";
import { useBoardTheme } from "./BoardThemeProvider.js";
import type { DrillPhase } from "../hooks/useTrainingDrill.js";
import styles from "./TrainingBoard.module.css";

interface TrainingBoardProps {
  currentFen: string;
  userSide: "white" | "black";
  phase: DrillPhase;
  correctMove: { san: string; uci: string } | null;
  feedbackType: "correct" | "wrong" | null;
  hintActive: boolean;
  onMove: (from: string, to: string, promotion?: string) => void;
}

function toDests(fen: string): Map<Key, Key[]> {
  const chess = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const move of chess.moves({ verbose: true })) {
    const from = move.from as Key;
    const existing = dests.get(from);
    if (existing) {
      existing.push(move.to as Key);
    } else {
      dests.set(from, [move.to as Key]);
    }
  }
  return dests;
}

export function TrainingBoard({
  currentFen,
  userSide,
  phase,
  correctMove,
  feedbackType,
  hintActive,
  onMove,
}: TrainingBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { boardTheme, pieceTheme } = useBoardTheme();

  const themeClasses = [
    boardTheme !== "brown" ? `board-theme-${boardTheme}` : "",
    pieceTheme !== "cburnett" ? `piece-theme-${pieceTheme}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isInteractive = phase === "user_turn";

  const dests = useMemo(() => {
    if (!isInteractive) return new Map<Key, Key[]>();
    return toDests(currentFen);
  }, [currentFen, isInteractive]);

  const onMoveCallback = useCallback(
    (orig: Key, dest: Key) => {
      const chess = new Chess(currentFen);
      const piece = chess.get(orig as Parameters<typeof chess.get>[0]);
      const promotion =
        piece?.type === "p" && (dest[1] === "8" || dest[1] === "1") ? "q" : undefined;
      onMove(orig, dest, promotion);
    },
    [currentFen, onMove],
  );

  const highlightSquares = useMemo(() => {
    const highlights = new Map<Key, string>();
    if (feedbackType === "correct" && correctMove) {
      const from = correctMove.uci.slice(0, 2) as Key;
      const to = correctMove.uci.slice(2, 4) as Key;
      highlights.set(from, "training-correct");
      highlights.set(to, "training-correct");
    }
    if (hintActive && correctMove && phase === "user_turn") {
      const hintDest = correctMove.uci.slice(2, 4) as Key;
      highlights.set(hintDest, "training-hint");
    }
    return highlights;
  }, [feedbackType, correctMove, hintActive, phase]);

  const autoShapes = useMemo(() => {
    const shapes: DrawShape[] = [];
    if (feedbackType === "wrong" && correctMove) {
      const orig = correctMove.uci.slice(0, 2) as DrawShape["orig"];
      const dest = correctMove.uci.slice(2, 4) as DrawShape["orig"];
      shapes.push({
        orig,
        dest,
        brush: "green",
      });
    }
    return shapes;
  }, [feedbackType, correctMove]);

  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen: currentFen,
      orientation: userSide,
      viewOnly: !isInteractive,
      movable: {
        free: false,
        color: isInteractive ? userSide : undefined,
        dests: isInteractive ? dests : new Map(),
        showDests: true,
        events: {
          after: onMoveCallback,
        },
      },
      animation: { enabled: true, duration: 200 },
      highlight: { custom: highlightSquares },
      drawable: {
        autoShapes: autoShapes,
      },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!apiRef.current) return;

    if (feedbackType === "wrong") {
      apiRef.current.set({
        fen: currentFen,
        viewOnly: true,
        movable: { free: false, dests: new Map() },
        highlight: { custom: new Map() },
        drawable: { autoShapes },
      });
    } else {
      apiRef.current.set({
        fen: currentFen,
        orientation: userSide,
        turnColor: isInteractive ? userSide : undefined,
        viewOnly: !isInteractive,
        movable: {
          free: false,
          color: isInteractive ? userSide : undefined,
          dests: isInteractive ? dests : new Map(),
          showDests: true,
          events: {
            after: onMoveCallback,
          },
        },
        highlight: { custom: highlightSquares },
        drawable: { autoShapes },
      });
    }
  }, [
    currentFen,
    phase,
    isInteractive,
    dests,
    onMoveCallback,
    highlightSquares,
    autoShapes,
    userSide,
    feedbackType,
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      apiRef.current?.redrawAll();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.boardWrapper}>
      <div className={themeClasses || undefined}>
        <div
          ref={containerRef}
          className={styles.board}
          data-testid="training-board"
          role="img"
          aria-label={`Training board, ${phase === "user_turn" ? "your turn" : phase.replace("_", " ")}`}
        />
      </div>
    </div>
  );
}
