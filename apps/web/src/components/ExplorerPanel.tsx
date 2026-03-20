import { useState, useCallback } from "react";
import {
  useGetExplorerMastersQuery,
  useGetExplorerPlatformQuery,
  usePostExplorerEngineMutation,
} from "../store/apiSlice.js";
import { ExplorerMoveTable } from "./ExplorerMoveTable.js";
import { EngineLinesPanel, formatEvalScore } from "./EngineLinesPanel.js";
import { Button } from "./ui/Button.js";
import { Skeleton } from "./ui/Skeleton.js";
import styles from "./ExplorerPanel.module.css";

type ExplorerTab = "masters" | "platform" | "engine";

interface ExplorerPanelProps {
  fen: string;
  onMoveClick: (san: string, uci: string) => void;
  onHoverMove: (uci: string | null) => void;
}

function MoveTableSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} height={28} width="100%" />
      ))}
    </div>
  );
}

function MastersTabContent({ fen, onMoveClick, onHoverMove }: ExplorerPanelProps) {
  const { data, isLoading, isError, refetch } = useGetExplorerMastersQuery({ fen }, { skip: !fen });

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

function PlatformTabContent({ fen, onMoveClick, onHoverMove }: ExplorerPanelProps) {
  const { data, isLoading, isError, refetch } = useGetExplorerPlatformQuery(
    { fen },
    { skip: !fen },
  );

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

function EngineTabContent({ fen }: { fen: string }) {
  const [evaluate, { data, isLoading, isError }] = usePostExplorerEngineMutation();
  const [lastEvaluatedFen, setLastEvaluatedFen] = useState<string | null>(null);

  const handleEvaluate = useCallback(() => {
    if (!fen) return;
    evaluate({ fen });
    setLastEvaluatedFen(fen);
  }, [fen, evaluate]);

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

function ExplorerPanel({ fen, onMoveClick, onHoverMove }: ExplorerPanelProps) {
  const [activeTab, setActiveTab] = useState<ExplorerTab>("masters");

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

      <div className={styles.content} role="tabpanel">
        {activeTab === "masters" && (
          <MastersTabContent fen={fen} onMoveClick={onMoveClick} onHoverMove={onHoverMove} />
        )}
        {activeTab === "platform" && (
          <PlatformTabContent fen={fen} onMoveClick={onMoveClick} onHoverMove={onHoverMove} />
        )}
        {activeTab === "engine" && <EngineTabContent fen={fen} />}
      </div>
    </div>
  );
}

export { ExplorerPanel };
export type { ExplorerPanelProps, ExplorerTab };
