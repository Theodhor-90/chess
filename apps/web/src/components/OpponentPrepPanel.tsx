import { useState, useEffect, useMemo, useCallback } from "react";
import type { RepertoireNode } from "@chess/shared";
import { useGetGameHistoryQuery, useLazyGetExplorerPlayerQuery } from "../store/apiSlice.js";
import { Button } from "./ui/Button.js";
import styles from "./OpponentPrepPanel.module.css";

interface GapInfo {
  fen: string;
  moveSan: string;
  frequency: number;
  parentSan: string | null;
}

interface OpponentPrepPanelProps {
  repertoireColor: "white" | "black";
  currentFen: string;
  tree: RepertoireNode;
  onNavigate: (fen: string) => void;
  onGapsChange: (gaps: Map<string, GapInfo[]>) => void;
}

function findNodeByFenInTree(node: RepertoireNode, fen: string): RepertoireNode | null {
  if (node.fen === fen) return node;
  for (const child of node.children) {
    const found = findNodeByFenInTree(child, fen);
    if (found) return found;
  }
  return null;
}

export function OpponentPrepPanel({
  repertoireColor,
  currentFen,
  tree,
  onNavigate,
  onGapsChange,
}: OpponentPrepPanelProps) {
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<{
    userId: number;
    username: string;
  } | null>(null);
  const [gaps, setGaps] = useState<Map<string, GapInfo[]>>(new Map());

  const { data: historyData } = useGetGameHistoryQuery({ limit: 100 });
  const [fetchPlayerStats, { isFetching: isLoadingStats }] = useLazyGetExplorerPlayerQuery();

  const opponents = useMemo(() => {
    if (!historyData?.items) return [];
    const opponentMap = new Map<number, { userId: number; username: string; games: number }>();
    for (const item of historyData.items) {
      if (item.botLevel != null) continue;
      const existing = opponentMap.get(item.opponentId);
      if (existing) {
        existing.games++;
      } else {
        opponentMap.set(item.opponentId, {
          userId: item.opponentId,
          username: item.opponentUsername,
          games: 1,
        });
      }
    }
    return Array.from(opponentMap.values()).sort((a, b) => b.games - a.games);
  }, [historyData]);

  const filteredOpponents = useMemo(() => {
    if (!searchFilter.trim()) return opponents;
    const lower = searchFilter.toLowerCase();
    return opponents.filter((o) => o.username.toLowerCase().includes(lower));
  }, [opponents, searchFilter]);

  const scanCurrentPosition = useCallback(async () => {
    if (!selectedOpponent) return;

    const opponentColor = repertoireColor === "white" ? "black" : "white";

    const isOpponentTurn =
      repertoireColor === "white" ? currentFen.includes(" b ") : currentFen.includes(" w ");

    if (!isOpponentTurn) return;

    const currentNode = findNodeByFenInTree(tree, currentFen);
    if (!currentNode) return;

    try {
      const result = await fetchPlayerStats({
        fen: currentFen,
        userId: selectedOpponent.userId,
        color: opponentColor,
      }).unwrap();

      const totalGames = result.white + result.draws + result.black;
      if (totalGames === 0) {
        setGaps((prev) => {
          const next = new Map(prev);
          next.set(currentFen, []);
          return next;
        });
        return;
      }

      const newGaps: GapInfo[] = [];
      for (const move of result.moves) {
        const frequency = move.totalGames / totalGames;
        if (frequency < 0.1) continue;

        const isCovered = currentNode.children.some((child) => child.san === move.san);
        if (!isCovered) {
          newGaps.push({
            fen: currentFen,
            moveSan: move.san,
            frequency,
            parentSan: currentNode.san,
          });
        }
      }

      setGaps((prev) => {
        const next = new Map(prev);
        next.set(currentFen, newGaps);
        return next;
      });
    } catch {
      // Silently ignore — stats may not be available
    }
  }, [selectedOpponent, repertoireColor, currentFen, tree, fetchPlayerStats]);

  useEffect(() => {
    scanCurrentPosition();
  }, [scanCurrentPosition]);

  useEffect(() => {
    onGapsChange(gaps);
  }, [gaps, onGapsChange]);

  const handleSelectOpponent = useCallback((userId: number, username: string) => {
    setSelectedOpponent({ userId, username });
    setGaps(new Map());
  }, []);

  const handleClearOpponent = useCallback(() => {
    setSelectedOpponent(null);
    setGaps(new Map());
  }, []);

  const allGaps = useMemo(() => {
    const result: GapInfo[] = [];
    for (const gapList of gaps.values()) {
      result.push(...gapList);
    }
    return result;
  }, [gaps]);

  return (
    <div className={styles.panel} data-testid="opponent-prep-panel">
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>Opponent Preparation</h3>
        {selectedOpponent && (
          <Button variant="ghost" size="sm" onClick={handleClearOpponent}>
            Clear
          </Button>
        )}
      </div>

      {!selectedOpponent ? (
        <>
          <div className={styles.searchContainer}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter opponents..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Filter opponents"
            />
          </div>

          {filteredOpponents.length === 0 ? (
            <div className={styles.emptyState}>
              {opponents.length === 0
                ? "No opponents found. Play some games first!"
                : "No matching opponents."}
            </div>
          ) : (
            <div className={styles.opponentList}>
              {filteredOpponents.map((opp) => (
                <button
                  key={opp.userId}
                  type="button"
                  className={styles.opponentItem}
                  onClick={() => handleSelectOpponent(opp.userId, opp.username)}
                >
                  <span>{opp.username}</span>
                  <span className={styles.opponentGames}>
                    {opp.games} game{opp.games !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className={styles.activeOpponent}>
            <span className={styles.activeOpponentName}>vs. {selectedOpponent.username}</span>
            {isLoadingStats && <span className={styles.loading}>Checking...</span>}
          </div>

          {allGaps.length > 0 ? (
            <div className={`${styles.gapSummary} ${styles.gapSummaryWarning}`}>
              {allGaps.length} gap{allGaps.length !== 1 ? "s" : ""} found &mdash; opponent plays
              moves not covered by your repertoire
            </div>
          ) : (
            !isLoadingStats && (
              <div className={`${styles.gapSummary} ${styles.gapSummaryClear}`}>
                No gaps at this position
              </div>
            )
          )}

          {allGaps.length > 0 && (
            <div className={styles.gapList}>
              {allGaps.map((gap) => (
                <button
                  key={`${gap.fen}-${gap.moveSan}`}
                  type="button"
                  className={styles.gapItem}
                  onClick={() => onNavigate(gap.fen)}
                >
                  <span className={styles.gapBadge}>!</span>
                  <span className={styles.gapMoves}>{gap.moveSan}</span>
                  <span className={styles.gapFrequency}>{Math.round(gap.frequency * 100)}%</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export type { GapInfo };
