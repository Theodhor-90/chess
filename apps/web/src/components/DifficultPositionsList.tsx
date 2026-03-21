import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import type { DifficultPosition } from "@chess/shared";
import { useGetDifficultPositionsQuery } from "../store/apiSlice.js";
import { useBoardTheme } from "./BoardThemeProvider.js";
import styles from "./DifficultPositionsList.module.css";

interface MiniBoardProps {
  fen: string;
  moveUci: string;
}

function MiniBoard({ fen, moveUci }: MiniBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const { boardTheme, pieceTheme } = useBoardTheme();

  const themeClasses = [
    boardTheme !== "brown" ? `board-theme-${boardTheme}` : "",
    pieceTheme !== "cburnett" ? `piece-theme-${pieceTheme}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!containerRef.current) return;

    const orig = moveUci.slice(0, 2);
    const dest = moveUci.slice(2, 4);
    const arrowShapes: DrawShape[] = [
      {
        orig: orig as DrawShape["orig"],
        dest: dest as DrawShape["orig"],
        brush: "green",
      },
    ];

    apiRef.current = Chessground(containerRef.current, {
      fen,
      viewOnly: true,
      coordinates: false,
      animation: { enabled: false },
      drawable: {
        autoShapes: arrowShapes,
      },
    });

    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, [fen, moveUci]);

  return (
    <div className={themeClasses || undefined}>
      <div ref={containerRef} className={styles.boardWrapper} />
    </div>
  );
}

function DifficultPositionsList() {
  const { data: positions, isLoading } = useGetDifficultPositionsQuery();
  const navigate = useNavigate();

  const handleClick = useCallback(
    (pos: DifficultPosition) => {
      navigate(`/repertoires/${pos.repertoireId}`);
    },
    [navigate],
  );

  if (isLoading || !positions) {
    return null;
  }

  if (positions.length === 0) {
    return null;
  }

  return (
    <div className={styles.container} data-testid="difficult-positions">
      <h2 className={styles.title}>Difficult Positions</h2>
      <div className={styles.grid}>
        {positions.map((pos) => (
          <div
            key={pos.cardId}
            className={styles.item}
            onClick={() => handleClick(pos)}
            data-testid={`difficult-position-${pos.cardId}`}
          >
            <MiniBoard fen={pos.positionFen} moveUci={pos.moveUci} />
            <div className={styles.details}>
              <span className={styles.repertoireName}>{pos.repertoireName}</span>
              <span className={styles.moveSan}>{pos.moveSan}</span>
              <div className={styles.statsRow}>
                <span className={styles.lapseBadge}>Failed {pos.lapses} times</span>
                <span>Stability: {pos.stability.toFixed(1)}d</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DifficultPositionsList };
