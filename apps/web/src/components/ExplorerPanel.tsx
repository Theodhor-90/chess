import { useState, useEffect, useCallback, useRef } from "react";
import type { ChangeEvent } from "react";
import type { DrawShape } from "chessground/draw";
import type { ExplorerMove } from "@chess/shared";
import {
  useGetExplorerMastersQuery,
  useGetExplorerPlatformQuery,
  usePostExplorerEngineMutation,
} from "../store/apiSlice.js";
import { ExplorerMoveTable } from "./ExplorerMoveTable.js";
import { ExplorerOpeningName } from "./ExplorerOpeningName.js";
import { ExplorerMastersFilters } from "./ExplorerMastersFilters.js";
import type { MastersFilterState } from "./ExplorerMastersFilters.js";
import {
  ExplorerPlatformFilters,
  ALL_RATING_BRACKETS,
  ALL_SPEED_CATEGORIES,
} from "./ExplorerPlatformFilters.js";
import type { PlatformFilterState } from "./ExplorerPlatformFilters.js";
import { EngineLinesPanel, formatEvalScore } from "./EngineLinesPanel.js";
import { Button } from "./ui/Button.js";
import { Skeleton } from "./ui/Skeleton.js";
import { buildExplorerArrows, buildHoverArrow } from "../utils/explorerArrows.js";
import styles from "./ExplorerPanel.module.css";

type ExplorerTab = "masters" | "platform" | "engine";

interface ExplorerPanelProps {
  fen: string;
  onMoveClick: (san: string, uci: string) => void;
  onHoverMove: (uci: string | null) => void;
  onArrowsChange: (shapes: DrawShape[]) => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const DEBOUNCE_MS = 500;

function MoveTableSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={28} width="100%" />
      ))}
    </div>
  );
}

// --- Masters Tab ---

interface MastersTabContentProps {
  fen: string;
  filters: MastersFilterState;
  onMoveClick: (san: string, uci: string) => void;
  onHoverMove: (uci: string | null) => void;
  onMovesLoaded: (moves: ExplorerMove[], opening: { eco: string; name: string } | null) => void;
}

function MastersTabContent({
  fen,
  filters,
  onMoveClick,
  onHoverMove,
  onMovesLoaded,
}: MastersTabContentProps) {
  const debouncedFilters = useDebounce(filters, DEBOUNCE_MS);
  const { data, isLoading, isError, refetch } = useGetExplorerMastersQuery(
    {
      fen,
      since: debouncedFilters.since || undefined,
      until: debouncedFilters.until || undefined,
    },
    { skip: !fen },
  );

  const prevDataRef = useRef(data);
  useEffect(() => {
    if (data && data !== prevDataRef.current) {
      prevDataRef.current = data;
      onMovesLoaded(data.moves, data.opening);
    }
  }, [data, onMovesLoaded]);

  useEffect(() => {
    if (!data && !isLoading) {
      onMovesLoaded([], null);
    }
  }, [data, isLoading, onMovesLoaded]);

  if (isLoading) return <MoveTableSkeleton />;

  if (isError) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>Failed to load masters data.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.moves.length === 0) {
    return (
      <div className={styles.emptyState}>
        No games found in the masters database for this position.
      </div>
    );
  }

  return (
    <ExplorerMoveTable moves={data.moves} onMoveClick={onMoveClick} onHoverMove={onHoverMove} />
  );
}

// --- Platform Tab ---

interface PlatformTabContentProps {
  fen: string;
  filters: PlatformFilterState;
  onMoveClick: (san: string, uci: string) => void;
  onHoverMove: (uci: string | null) => void;
  onMovesLoaded: (moves: ExplorerMove[], opening: { eco: string; name: string } | null) => void;
}

function PlatformTabContent({
  fen,
  filters,
  onMoveClick,
  onHoverMove,
  onMovesLoaded,
}: PlatformTabContentProps) {
  const debouncedFilters = useDebounce(filters, DEBOUNCE_MS);
  const { data, isLoading, isError, refetch } = useGetExplorerPlatformQuery(
    {
      fen,
      ratings: debouncedFilters.ratings.length > 0 ? debouncedFilters.ratings : undefined,
      speeds: debouncedFilters.speeds.length > 0 ? debouncedFilters.speeds : undefined,
      since: debouncedFilters.since || undefined,
      until: debouncedFilters.until || undefined,
    },
    { skip: !fen },
  );

  const prevDataRef = useRef(data);
  useEffect(() => {
    if (data && data !== prevDataRef.current) {
      prevDataRef.current = data;
      onMovesLoaded(data.moves, data.opening);
    }
  }, [data, onMovesLoaded]);

  useEffect(() => {
    if (!data && !isLoading) {
      onMovesLoaded([], null);
    }
  }, [data, isLoading, onMovesLoaded]);

  if (isLoading) return <MoveTableSkeleton />;

  if (isError) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>Failed to load platform data.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.moves.length === 0) {
    return (
      <div className={styles.emptyState}>No games found on the platform for this position.</div>
    );
  }

  return (
    <ExplorerMoveTable moves={data.moves} onMoveClick={onMoveClick} onHoverMove={onHoverMove} />
  );
}

// --- Engine Tab ---

interface EngineTabContentProps {
  fen: string;
  depth: number;
}

function EngineTabContent({ fen, depth }: EngineTabContentProps) {
  const [evaluate, { data, isLoading, isError }] = usePostExplorerEngineMutation();
  const [lastEvaluatedFen, setLastEvaluatedFen] = useState<string | null>(null);

  const handleEvaluate = useCallback(() => {
    if (!fen) return;
    evaluate({ fen, depth });
    setLastEvaluatedFen(fen);
  }, [fen, depth, evaluate]);

  const needsEvaluation = fen !== lastEvaluatedFen;

  if (!lastEvaluatedFen) {
    return (
      <div className={styles.enginePrompt}>
        <p className={styles.enginePromptText}>Click to evaluate this position with the engine.</p>
        <Button variant="primary" size="sm" onClick={handleEvaluate} loading={isLoading}>
          Evaluate
        </Button>
      </div>
    );
  }

  if (isLoading) return <MoveTableSkeleton />;

  if (isError) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>Engine evaluation failed.</p>
        <Button variant="secondary" size="sm" onClick={handleEvaluate}>
          Retry
        </Button>
      </div>
    );
  }

  if (needsEvaluation) {
    return (
      <div className={styles.enginePrompt}>
        <p className={styles.enginePromptText}>Position changed. Click to re-evaluate.</p>
        <Button variant="primary" size="sm" onClick={handleEvaluate} loading={isLoading}>
          Evaluate
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={styles.engineResults}>
      <div className={styles.engineDepth}>Depth: {data.depth}</div>
      <div className={styles.engineScore}>Score: {formatEvalScore(data.score)}</div>
      {data.lines.length > 0 && (
        <EngineLinesPanel engineLines={data.lines} onLineSelect={() => {}} />
      )}
    </div>
  );
}

// --- Main Explorer Panel ---

function ExplorerPanel({ fen, onMoveClick, onHoverMove, onArrowsChange }: ExplorerPanelProps) {
  const [activeTab, setActiveTab] = useState<ExplorerTab>("masters");
  const [hoveredUci, setHoveredUci] = useState<string | null>(null);

  // Filter state
  const [mastersFilters, setMastersFilters] = useState<MastersFilterState>({
    since: "",
    until: "",
  });
  const [platformFilters, setPlatformFilters] = useState<PlatformFilterState>({
    ratings: [...ALL_RATING_BRACKETS],
    speeds: [...ALL_SPEED_CATEGORIES],
    since: "",
    until: "",
  });
  const [engineDepth, setEngineDepth] = useState(20);

  // Current explorer moves (for arrow computation)
  const [currentMoves, setCurrentMoves] = useState<ExplorerMove[]>([]);
  const [currentOpening, setCurrentOpening] = useState<{ eco: string; name: string } | null>(null);

  const handleMovesLoaded = useCallback(
    (moves: ExplorerMove[], opening: { eco: string; name: string } | null) => {
      setCurrentMoves(moves);
      setCurrentOpening(opening);
    },
    [],
  );

  // Arrow computation and emission
  useEffect(() => {
    if (activeTab === "engine") {
      onArrowsChange([]);
      return;
    }
    const baseArrows = buildExplorerArrows(currentMoves);
    if (hoveredUci) {
      const hoverArrows = buildHoverArrow(hoveredUci);
      onArrowsChange([...baseArrows, ...hoverArrows]);
    } else {
      onArrowsChange(baseArrows);
    }
  }, [currentMoves, hoveredUci, activeTab, onArrowsChange]);

  // Clear arrows on unmount
  useEffect(() => {
    return () => {
      onArrowsChange([]);
    };
  }, [onArrowsChange]);

  // Clear moves data when tab changes
  useEffect(() => {
    setCurrentMoves([]);
    setCurrentOpening(null);
    setHoveredUci(null);
  }, [activeTab]);

  const handleHoverMove = useCallback(
    (uci: string | null) => {
      setHoveredUci(uci);
      onHoverMove(uci);
    },
    [onHoverMove],
  );

  const handleEngineDepthChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 10 && val <= 25) {
      setEngineDepth(val);
    }
  }, []);

  return (
    <div className={styles.panel} data-testid="explorer-panel">
      <div className={styles.tabBar} role="tablist" aria-label="Explorer data source">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "masters"}
          className={`${styles.tab}${activeTab === "masters" ? ` ${styles.tabActive}` : ""}`}
          onClick={() => setActiveTab("masters")}
        >
          Masters
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "platform"}
          className={`${styles.tab}${activeTab === "platform" ? ` ${styles.tabActive}` : ""}`}
          onClick={() => setActiveTab("platform")}
        >
          Platform
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "engine"}
          className={`${styles.tab}${activeTab === "engine" ? ` ${styles.tabActive}` : ""}`}
          onClick={() => setActiveTab("engine")}
        >
          Engine
        </button>
      </div>

      {activeTab === "masters" && (
        <ExplorerMastersFilters filters={mastersFilters} onChange={setMastersFilters} />
      )}
      {activeTab === "platform" && (
        <ExplorerPlatformFilters filters={platformFilters} onChange={setPlatformFilters} />
      )}
      {activeTab === "engine" && (
        <div className={styles.engineDepthControl}>
          <label htmlFor="engine-depth" className={styles.engineDepthLabel}>
            Depth
          </label>
          <input
            id="engine-depth"
            type="number"
            className={styles.engineDepthInput}
            value={engineDepth}
            onChange={handleEngineDepthChange}
            min={10}
            max={25}
          />
        </div>
      )}

      <div className={styles.content} role="tabpanel">
        {activeTab !== "engine" && <ExplorerOpeningName opening={currentOpening} />}

        {activeTab === "masters" && (
          <MastersTabContent
            fen={fen}
            filters={mastersFilters}
            onMoveClick={onMoveClick}
            onHoverMove={handleHoverMove}
            onMovesLoaded={handleMovesLoaded}
          />
        )}
        {activeTab === "platform" && (
          <PlatformTabContent
            fen={fen}
            filters={platformFilters}
            onMoveClick={onMoveClick}
            onHoverMove={handleHoverMove}
            onMovesLoaded={handleMovesLoaded}
          />
        )}
        {activeTab === "engine" && <EngineTabContent fen={fen} depth={engineDepth} />}
      </div>
    </div>
  );
}

export { ExplorerPanel };
export type { ExplorerPanelProps, ExplorerTab };
