import { useState, useEffect, useCallback, useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { DrawShape } from "chessground/draw";
import type { ExplorerMove, ExplorerTopGame } from "@chess/shared";
import {
  useGetExplorerMastersQuery,
  useGetExplorerPlatformQuery,
  usePostExplorerEngineMutation,
  useGetExplorerPersonalQuery,
  useGetMeQuery,
} from "../store/apiSlice.js";
import { ExplorerMoveTable } from "./ExplorerMoveTable.js";
import { ExplorerOpeningName } from "./ExplorerOpeningName.js";
import { ExplorerTopGames } from "./ExplorerTopGames.js";
import { ExplorerPersonalOverlay } from "./ExplorerPersonalOverlay.js";
import type { ExplorerSource } from "./ExplorerTopGames.js";
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

const LS_EXPLORER_TAB = "explorer-tab";
const LS_EXPLORER_MASTERS_FILTERS = "explorer-masters-filters";
const LS_EXPLORER_PLATFORM_FILTERS = "explorer-platform-filters";
const LS_EXPLORER_PERSONAL_OVERLAY = "explorer-personal-overlay";

function readLsString(key: string, fallback: string): string {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val;
  } catch {
    /* noop */
  }
  return fallback;
}

function readLsJson<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return JSON.parse(val) as T;
  } catch {
    /* noop */
  }
  return fallback;
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function writeLsJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

type ExplorerTab = "masters" | "platform" | "engine" | "personal";

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
  onMovesLoaded: (
    moves: ExplorerMove[],
    opening: { eco: string; name: string } | null,
    topGames: ExplorerTopGame[],
  ) => void;
  renderOverlay?: (san: string) => ReactNode;
}

function MastersTabContent({
  fen,
  filters,
  onMoveClick,
  onHoverMove,
  onMovesLoaded,
  renderOverlay,
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
      onMovesLoaded(data.moves, data.opening, data.topGames);
    }
  }, [data, onMovesLoaded]);

  useEffect(() => {
    if (!data && !isLoading) {
      onMovesLoaded([], null, []);
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
    <ExplorerMoveTable
      moves={data.moves}
      onMoveClick={onMoveClick}
      onHoverMove={onHoverMove}
      renderOverlay={renderOverlay}
    />
  );
}

// --- Platform Tab ---

interface PlatformTabContentProps {
  fen: string;
  filters: PlatformFilterState;
  onMoveClick: (san: string, uci: string) => void;
  onHoverMove: (uci: string | null) => void;
  onMovesLoaded: (
    moves: ExplorerMove[],
    opening: { eco: string; name: string } | null,
    topGames: ExplorerTopGame[],
  ) => void;
  renderOverlay?: (san: string) => ReactNode;
}

function PlatformTabContent({
  fen,
  filters,
  onMoveClick,
  onHoverMove,
  onMovesLoaded,
  renderOverlay,
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
      onMovesLoaded(data.moves, data.opening, data.topGames);
    }
  }, [data, onMovesLoaded]);

  useEffect(() => {
    if (!data && !isLoading) {
      onMovesLoaded([], null, []);
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
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>No games found on the platform for this position.</p>
        <p className={styles.emptyHint}>Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <ExplorerMoveTable
      moves={data.moves}
      onMoveClick={onMoveClick}
      onHoverMove={onHoverMove}
      renderOverlay={renderOverlay}
    />
  );
}

// --- Engine Tab ---

interface EngineTabContentProps {
  fen: string;
  depth: number;
}

function EngineTabContent({ fen, depth }: EngineTabContentProps) {
  const [evaluate, { data, isLoading, isError }] = usePostExplorerEngineMutation();
  const lastEvaluatedFenRef = useRef<string | null>(null);
  const lastEvaluatedDepthRef = useRef<number | null>(null);

  // Auto-evaluate when fen or depth changes
  useEffect(() => {
    if (!fen) return;
    if (fen === lastEvaluatedFenRef.current && depth === lastEvaluatedDepthRef.current) return;
    lastEvaluatedFenRef.current = fen;
    lastEvaluatedDepthRef.current = depth;
    evaluate({ fen, depth });
  }, [fen, depth, evaluate]);

  if (isLoading) {
    return (
      <div className={styles.enginePrompt}>
        <p className={styles.enginePromptText}>Evaluating...</p>
        <MoveTableSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>Engine not available. Try again later.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (fen) {
              lastEvaluatedFenRef.current = fen;
              lastEvaluatedDepthRef.current = depth;
              evaluate({ fen, depth });
            }
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return <MoveTableSkeleton />;

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

// --- Personal (My Games) Tab ---

interface PersonalTabContentProps {
  fen: string;
  color: "white" | "black";
  onMoveClick: (san: string, uci: string) => void;
  onHoverMove: (uci: string | null) => void;
  onMovesLoaded: (
    moves: ExplorerMove[],
    opening: { eco: string; name: string } | null,
    topGames: ExplorerTopGame[],
  ) => void;
}

function PersonalTabContent({
  fen,
  color,
  onMoveClick,
  onHoverMove,
  onMovesLoaded,
}: PersonalTabContentProps) {
  const [retryCount, setRetryCount] = useState(0);
  const { data, isLoading, isError, isFetching, refetch } = useGetExplorerPersonalQuery(
    { fen, color },
    { skip: !fen },
  );

  const prevDataRef = useRef(data);
  useEffect(() => {
    if (data && data !== prevDataRef.current) {
      prevDataRef.current = data;
      onMovesLoaded(data.moves, data.opening, data.topGames);
    }
  }, [data, onMovesLoaded]);

  useEffect(() => {
    if (!data && !isLoading) {
      onMovesLoaded([], null, []);
    }
  }, [data, isLoading, onMovesLoaded]);

  // Retry logic for indexing state (202 or empty first-time response)
  useEffect(() => {
    if (!isFetching && isError && retryCount < 5) {
      const timer = setTimeout(() => {
        setRetryCount((c) => c + 1);
        refetch();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isFetching, isError, retryCount, refetch]);

  // Reset retry count when fen or color changes
  useEffect(() => {
    setRetryCount(0);
  }, [fen, color]);

  if (isLoading || (isError && retryCount < 5)) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.indexingSpinner} aria-hidden="true" />
        <p className={styles.indexingText}>Indexing your games...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorText}>Failed to load personal data.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setRetryCount(0);
            refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.moves.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>
          You haven&apos;t played any games from this position as {color}.
        </p>
      </div>
    );
  }

  return (
    <ExplorerMoveTable moves={data.moves} onMoveClick={onMoveClick} onHoverMove={onHoverMove} />
  );
}

// --- Main Explorer Panel ---

function ExplorerPanel({ fen, onMoveClick, onHoverMove, onArrowsChange }: ExplorerPanelProps) {
  const [activeTab, setActiveTab] = useState<ExplorerTab>(() => {
    const stored = readLsString(LS_EXPLORER_TAB, "masters");
    if (
      stored === "masters" ||
      stored === "platform" ||
      stored === "engine" ||
      stored === "personal"
    )
      return stored;
    return "masters";
  });
  const [hoveredUci, setHoveredUci] = useState<string | null>(null);

  // Filter state
  const [mastersFilters, setMastersFilters] = useState<MastersFilterState>(() =>
    readLsJson(LS_EXPLORER_MASTERS_FILTERS, { since: "", until: "" }),
  );
  const [platformFilters, setPlatformFilters] = useState<PlatformFilterState>(() =>
    readLsJson(LS_EXPLORER_PLATFORM_FILTERS, {
      ratings: [...ALL_RATING_BRACKETS],
      speeds: [...ALL_SPEED_CATEGORIES],
      since: "",
      until: "",
    }),
  );
  const [engineDepth, setEngineDepth] = useState(20);

  // Auth state for personal features
  const { data: meData } = useGetMeQuery();
  const isAuthenticated = !!meData?.user;

  // Personal color selector state — default to "white"
  const [personalColor, setPersonalColor] = useState<"white" | "black">("white");

  // Stats overlay toggle — persisted in localStorage
  const [overlayEnabled, setOverlayEnabled] = useState(
    () => readLsString(LS_EXPLORER_PERSONAL_OVERLAY, "false") === "true",
  );

  useEffect(() => {
    writeLs(LS_EXPLORER_TAB, activeTab);
  }, [activeTab]);

  useEffect(() => {
    writeLsJson(LS_EXPLORER_MASTERS_FILTERS, mastersFilters);
  }, [mastersFilters]);

  useEffect(() => {
    writeLsJson(LS_EXPLORER_PLATFORM_FILTERS, platformFilters);
  }, [platformFilters]);

  useEffect(() => {
    writeLs(LS_EXPLORER_PERSONAL_OVERLAY, String(overlayEnabled));
  }, [overlayEnabled]);

  useEffect(() => {
    if (!isAuthenticated && activeTab === "personal") {
      setActiveTab("masters");
    }
  }, [isAuthenticated, activeTab]);

  // Current explorer moves (for arrow computation)
  const [currentMoves, setCurrentMoves] = useState<ExplorerMove[]>([]);
  const [currentOpening, setCurrentOpening] = useState<{ eco: string; name: string } | null>(null);
  const [currentTopGames, setCurrentTopGames] = useState<ExplorerTopGame[]>([]);

  const handleMovesLoaded = useCallback(
    (
      moves: ExplorerMove[],
      opening: { eco: string; name: string } | null,
      topGames: ExplorerTopGame[],
    ) => {
      setCurrentMoves(moves);
      setCurrentOpening(opening);
      setCurrentTopGames(topGames);
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
    setCurrentTopGames([]);
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

  // Fetch personal stats for overlay on Masters/Platform tabs
  const shouldFetchOverlay =
    overlayEnabled &&
    isAuthenticated &&
    (activeTab === "masters" || activeTab === "platform") &&
    !!fen;

  const { data: overlayData } = useGetExplorerPersonalQuery(
    { fen, color: personalColor },
    { skip: !shouldFetchOverlay },
  );

  // Render function for overlay sub-rows in ExplorerMoveTable
  const renderOverlay = useCallback(
    (san: string): ReactNode => {
      if (!overlayEnabled || !overlayData) return null;
      const personalMove = overlayData.moves.find((m) => m.san === san);
      if (!personalMove || personalMove.totalGames === 0) return null;
      return <ExplorerPersonalOverlay move={personalMove} />;
    },
    [overlayEnabled, overlayData],
  );

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
        {isAuthenticated && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "personal"}
            className={`${styles.tab}${activeTab === "personal" ? ` ${styles.tabActive}` : ""}`}
            onClick={() => setActiveTab("personal")}
          >
            My Games
          </button>
        )}
      </div>

      {isAuthenticated && (activeTab === "masters" || activeTab === "platform") && (
        <div className={styles.overlayToggle}>
          <label className={styles.overlayToggleLabel} htmlFor="personal-overlay-toggle">
            Show my stats
          </label>
          <input
            id="personal-overlay-toggle"
            type="checkbox"
            className={styles.overlayToggleInput}
            checked={overlayEnabled}
            onChange={(e) => setOverlayEnabled(e.target.checked)}
          />
        </div>
      )}
      {(activeTab === "personal" ||
        (overlayEnabled &&
          isAuthenticated &&
          (activeTab === "masters" || activeTab === "platform"))) && (
        <div className={styles.colorSelector}>
          <button
            type="button"
            className={`${styles.colorButton}${personalColor === "white" ? ` ${styles.colorButtonActive}` : ""}`}
            onClick={() => setPersonalColor("white")}
            aria-pressed={personalColor === "white"}
          >
            White
          </button>
          <button
            type="button"
            className={`${styles.colorButton}${personalColor === "black" ? ` ${styles.colorButtonActive}` : ""}`}
            onClick={() => setPersonalColor("black")}
            aria-pressed={personalColor === "black"}
          >
            Black
          </button>
        </div>
      )}

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
            renderOverlay={overlayEnabled && isAuthenticated ? renderOverlay : undefined}
          />
        )}
        {activeTab === "platform" && (
          <PlatformTabContent
            fen={fen}
            filters={platformFilters}
            onMoveClick={onMoveClick}
            onHoverMove={handleHoverMove}
            onMovesLoaded={handleMovesLoaded}
            renderOverlay={overlayEnabled && isAuthenticated ? renderOverlay : undefined}
          />
        )}
        {activeTab === "personal" && (
          <PersonalTabContent
            fen={fen}
            color={personalColor}
            onMoveClick={onMoveClick}
            onHoverMove={handleHoverMove}
            onMovesLoaded={handleMovesLoaded}
          />
        )}
        {activeTab === "engine" && <EngineTabContent fen={fen} depth={engineDepth} />}
        {activeTab !== "engine" && currentTopGames.length > 0 && (
          <ExplorerTopGames
            games={currentTopGames}
            source={activeTab === "personal" ? "personal" : (activeTab as ExplorerSource)}
          />
        )}
      </div>
    </div>
  );
}

export { ExplorerPanel };
export type { ExplorerPanelProps, ExplorerTab };
