import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router";
import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import type { DrawShape } from "chessground/draw";
import type { RepertoireNode } from "@chess/shared";
import {
  useGetRepertoireQuery,
  useAddRepertoireMoveMutation,
  useDeleteRepertoireMoveMutation,
  useUpdateRepertoireMoveMutation,
  useLazyGetRepertoireExportQuery,
} from "../store/apiSlice.js";
import { useBoardTheme } from "../components/BoardThemeProvider.js";
import { ExplorerPanel } from "../components/ExplorerPanel.js";
import { RepertoireMoveTree } from "../components/RepertoireMoveTree.js";
import { EXPLORER_BRUSHES } from "../utils/explorerArrows.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { Modal } from "../components/ui/Modal.js";
import { useToast } from "../components/ui/ToastProvider.js";
import { PageSkeleton } from "../components/ui/Skeleton.js";
import { RepertoirePgnImport } from "../components/RepertoirePgnImport.js";
import { OpponentPrepPanel } from "../components/OpponentPrepPanel.js";
import type { GapInfo } from "../components/OpponentPrepPanel.js";
import styles from "./RepertoireBuilderPage.module.css";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
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

function findNodeByFen(node: RepertoireNode, fen: string): RepertoireNode | null {
  if (node.fen === fen) return node;
  for (const child of node.children) {
    const found = findNodeByFen(child, fen);
    if (found) return found;
  }
  return null;
}

function findChildBySan(
  tree: RepertoireNode,
  parentFen: string,
  san: string,
): RepertoireNode | null {
  const parent = findNodeByFen(tree, parentFen);
  if (!parent) return null;
  return parent.children.find((c) => c.san === san) ?? null;
}

function findParentNode(node: RepertoireNode, targetFen: string): RepertoireNode | null {
  for (const child of node.children) {
    if (child.fen === targetFen) return node;
    const found = findParentNode(child, targetFen);
    if (found) return found;
  }
  return null;
}

export function RepertoireBuilderPage() {
  const [currentFen, setCurrentFen] = useState(STARTING_FEN);
  const [pendingMove, setPendingMove] = useState<{ san: string; fen: string } | null>(null);
  const [autoAdd, setAutoAdd] = useState(false);
  const [explorerVisible, setExplorerVisible] = useState(true);
  const [explorerArrows, setExplorerArrows] = useState<DrawShape[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  const { id: idParam } = useParams<{ id: string }>();
  const repertoireId = Number(idParam);
  const {
    data: repertoire,
    isLoading,
    isError,
  } = useGetRepertoireQuery(repertoireId, { skip: isNaN(repertoireId) });
  const [addMove, { isLoading: isAdding }] = useAddRepertoireMoveMutation();
  const [deleteMove] = useDeleteRepertoireMoveMutation();
  const [updateMove] = useUpdateRepertoireMoveMutation();
  const { showToast } = useToast();
  const { boardTheme, pieceTheme } = useBoardTheme();

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [opponentPrepVisible, setOpponentPrepVisible] = useState(false);
  const [opponentGaps, setOpponentGaps] = useState<Map<string, GapInfo[]>>(new Map());

  const [triggerExport, { isFetching: isExporting }] = useLazyGetRepertoireExportQuery();

  const themeClasses = [
    boardTheme !== "brown" ? `board-theme-${boardTheme}` : "",
    pieceTheme !== "cburnett" ? `piece-theme-${pieceTheme}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const orientation = repertoire?.color ?? "white";

  const repertoireArrows: DrawShape[] = useMemo(() => {
    if (!repertoire) return [];
    const currentNode = findNodeByFen(repertoire.tree, currentFen);
    if (!currentNode || currentNode.children.length === 0) return [];

    const shapes: DrawShape[] = [];
    const fullFen = `${currentFen} 0 1`;
    const chess = new Chess(fullFen);

    for (const child of currentNode.children) {
      if (!child.san) continue;
      try {
        const moveResult = chess.move(child.san);
        if (moveResult) {
          shapes.push({
            orig: moveResult.from as DrawShape["orig"],
            dest: moveResult.to as DrawShape["orig"],
            brush: child.isMainLine ? "green" : "blue",
          });
          chess.undo();
        }
      } catch {
        // Invalid move — skip
      }
    }
    return shapes;
  }, [repertoire, currentFen]);

  const arrowShapes = useMemo(() => {
    if (explorerVisible && explorerArrows.length > 0) {
      return [...repertoireArrows, ...explorerArrows];
    }
    return repertoireArrows;
  }, [repertoireArrows, explorerArrows, explorerVisible]);

  const dests = useMemo(() => {
    return toDests(`${currentFen} 0 1`);
  }, [currentFen]);

  const handleBoardMove = useCallback(
    (orig: Key, dest: Key) => {
      const fullFen = `${currentFen} 0 1`;
      const chess = new Chess(fullFen);

      // Try with queen promotion by default
      let moveResult;
      try {
        moveResult = chess.move({ from: orig, to: dest, promotion: "q" });
      } catch {
        return;
      }
      if (!moveResult) return;

      const san = moveResult.san;
      const resultFen = normalizeFen(chess.fen());

      // Check if this move already exists in the repertoire tree
      const existingChild = repertoire ? findChildBySan(repertoire.tree, currentFen, san) : null;

      if (existingChild) {
        // Move exists in repertoire — navigate to it
        setCurrentFen(existingChild.fen);
        setPendingMove(null);
      } else if (autoAdd) {
        // Auto-add mode — add immediately
        addMove({
          repertoireId,
          positionFen: currentFen,
          moveSan: san,
        })
          .unwrap()
          .then((result) => {
            setCurrentFen(normalizeFen(result.resultFen));
            setPendingMove(null);
          })
          .catch(() => {
            showToast("Failed to add move", "error");
          });
      } else {
        // Prompt to add
        setPendingMove({ san, fen: resultFen });
      }
    },
    [currentFen, repertoire, autoAdd, repertoireId, addMove, showToast],
  );

  const handleConfirmAdd = useCallback(async () => {
    if (!pendingMove) return;
    try {
      const result = await addMove({
        repertoireId,
        positionFen: currentFen,
        moveSan: pendingMove.san,
      }).unwrap();
      setCurrentFen(normalizeFen(result.resultFen));
      setPendingMove(null);
    } catch {
      showToast("Failed to add move", "error");
    }
  }, [pendingMove, currentFen, repertoireId, addMove, showToast]);

  const handleCancelAdd = useCallback(() => {
    setPendingMove(null);
  }, []);

  const handleNavigate = useCallback((fen: string) => {
    setCurrentFen(fen);
    setPendingMove(null);
  }, []);

  const handleDeleteMove = useCallback((moveId: number) => {
    setDeleteTarget(moveId);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteTarget === null) return;
    try {
      await deleteMove({ repertoireId, moveId: deleteTarget }).unwrap();
      setDeleteTarget(null);
      // Reset to starting position if the deleted node was on the current path
      setCurrentFen(STARTING_FEN);
      showToast("Branch deleted", "success");
    } catch {
      showToast("Failed to delete branch", "error");
    }
  }, [deleteTarget, repertoireId, deleteMove, showToast]);

  const handleSetMainLine = useCallback(
    async (moveId: number) => {
      try {
        await updateMove({ repertoireId, moveId, isMainLine: true }).unwrap();
      } catch {
        showToast("Failed to set main line", "error");
      }
    },
    [repertoireId, updateMove, showToast],
  );

  const handleExplorerMoveClick = useCallback(
    (san: string, _uci: string) => {
      const fullFen = `${currentFen} 0 1`;
      const chess = new Chess(fullFen);
      let moveResult;
      try {
        moveResult = chess.move(san);
      } catch {
        return;
      }
      if (!moveResult) return;

      const resultFen = normalizeFen(chess.fen());

      const existingChild = repertoire ? findChildBySan(repertoire.tree, currentFen, san) : null;

      if (existingChild) {
        setCurrentFen(existingChild.fen);
        setPendingMove(null);
      } else if (autoAdd) {
        addMove({ repertoireId, positionFen: currentFen, moveSan: san })
          .unwrap()
          .then((result) => {
            setCurrentFen(normalizeFen(result.resultFen));
            setPendingMove(null);
          })
          .catch(() => showToast("Failed to add move", "error"));
      } else {
        setPendingMove({ san, fen: resultFen });
      }
    },
    [currentFen, repertoire, autoAdd, repertoireId, addMove, showToast],
  );

  const handleExplorerHoverMove = useCallback((_uci: string | null) => {}, []);

  const handleExplorerArrowsChange = useCallback((shapes: DrawShape[]) => {
    setExplorerArrows(shapes);
  }, []);

  const handleExplorerToggle = useCallback(() => {
    setExplorerVisible((prev) => !prev);
  }, []);

  const handleExportPgn = useCallback(async () => {
    try {
      const result = await triggerExport(repertoireId).unwrap();
      const sanitizedName = (repertoire?.name ?? "repertoire")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase();
      const color = repertoire?.color ?? "white";
      const filename = `${sanitizedName}-${color}.pgn`;
      const blob = new Blob([result.pgn], { type: "application/x-chess-pgn" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("PGN exported", "success");
    } catch {
      showToast("Failed to export PGN", "error");
    }
  }, [repertoireId, repertoire, triggerExport, showToast]);

  const handleOpponentPrepToggle = useCallback(() => {
    setOpponentPrepVisible((prev) => {
      if (prev) {
        setOpponentGaps(new Map());
      }
      return !prev;
    });
  }, []);

  const handleGapsChange = useCallback((newGaps: Map<string, GapInfo[]>) => {
    setOpponentGaps(newGaps);
  }, []);

  const gapFens = useMemo(() => {
    const fens = new Set<string>();
    for (const [fen, gapList] of opponentGaps.entries()) {
      if (gapList.length > 0) {
        fens.add(fen);
      }
    }
    return fens;
  }, [opponentGaps]);

  const overallCoverage = useMemo(() => {
    if (!opponentPrepVisible || opponentGaps.size === 0) return null;

    let gapCount = 0;
    for (const gapList of opponentGaps.values()) {
      if (gapList.length > 0) gapCount++;
    }

    const coveredCount = opponentGaps.size - gapCount;
    return Math.round((coveredCount / opponentGaps.size) * 100);
  }, [opponentPrepVisible, opponentGaps]);

  const coverageMapForTree = useMemo(() => {
    if (!opponentPrepVisible) return undefined;
    const map = new Map<string, number>();
    for (const [fen, gapList] of opponentGaps.entries()) {
      map.set(fen, gapList.length === 0 ? 100 : 0);
    }
    return map.size > 0 ? map : undefined;
  }, [opponentPrepVisible, opponentGaps]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't handle keyboard shortcuts when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "ArrowLeft") {
        // Navigate back: find the parent of the current node in the tree
        if (!repertoire) return;
        const parent = findParentNode(repertoire.tree, currentFen);
        if (parent) {
          setCurrentFen(parent.fen);
          setPendingMove(null);
        }
      } else if (e.key === "ArrowRight") {
        // Navigate forward: go to the main line child
        if (!repertoire) return;
        const current = findNodeByFen(repertoire.tree, currentFen);
        if (current && current.children.length > 0) {
          const mainChild = current.children.find((c) => c.isMainLine) ?? current.children[0];
          setCurrentFen(mainChild.fen);
          setPendingMove(null);
        }
      } else if (e.key === "a" || e.key === "A") {
        // Keyboard shortcut to add pending move
        if (pendingMove) {
          handleConfirmAdd();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [repertoire, currentFen, pendingMove, handleConfirmAdd]);

  // Chessground initialization
  useEffect(() => {
    if (!containerRef.current) return;
    const fullFen = `${currentFen} 0 1`;
    apiRef.current = Chessground(containerRef.current, {
      fen: fullFen,
      orientation,
      viewOnly: false,
      movable: {
        free: false,
        color: "both",
        dests,
        showDests: true,
        events: {
          after: handleBoardMove,
        },
      },
      animation: { enabled: true, duration: 200 },
      drawable: {
        brushes: {
          ...EXPLORER_BRUSHES,
          green: { key: "green", color: "#15781B", opacity: 0.8, lineWidth: 10 },
          blue: { key: "blue", color: "#003088", opacity: 0.6, lineWidth: 10 },
        },
      },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  // Chessground update
  useEffect(() => {
    if (!apiRef.current) return;
    const fullFen = `${currentFen} 0 1`;
    const currentDests = toDests(fullFen);
    apiRef.current.set({
      fen: fullFen,
      orientation,
      movable: {
        free: false,
        color: "both",
        dests: currentDests,
        showDests: true,
        events: {
          after: handleBoardMove,
        },
      },
      drawable: { autoShapes: arrowShapes },
    });
  }, [currentFen, orientation, arrowShapes, handleBoardMove]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      apiRef.current?.redrawAll();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (isNaN(repertoireId)) {
    return <div className={styles.errorMessage}>Invalid repertoire ID</div>;
  }

  if (isLoading) {
    return <PageSkeleton testId="repertoire-builder-loading" />;
  }

  if (isError || !repertoire) {
    return (
      <div className={styles.errorMessage}>
        Repertoire not found. <Link to="/repertoires">Back to repertoires</Link>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="repertoire-builder-page">
      <div className={styles.header}>
        <h1 className={styles.title}>{repertoire.name}</h1>
        <div className={styles.headerMeta}>
          <Badge variant={repertoire.color === "white" ? "neutral" : "info"} size="sm">
            {repertoire.color === "white" ? "White" : "Black"}
          </Badge>
          <Link to="/repertoires">
            <Button variant="secondary" size="sm">
              Back
            </Button>
          </Link>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Button variant="secondary" size="sm" onClick={() => setImportModalOpen(true)}>
          Import PGN
        </Button>
        <Button variant="secondary" size="sm" onClick={handleExportPgn} loading={isExporting}>
          Export PGN
        </Button>
        <Button
          variant={opponentPrepVisible ? "primary" : "secondary"}
          size="sm"
          onClick={handleOpponentPrepToggle}
        >
          {opponentPrepVisible ? "Close Prep" : "Prep vs Opponent"}
        </Button>
        {overallCoverage !== null && (
          <span
            className={`${styles.coverageBadge} ${
              overallCoverage >= 100
                ? styles.coverageBadgeGreen
                : overallCoverage >= 50
                  ? styles.coverageBadgeYellow
                  : styles.coverageBadgeRed
            }`}
          >
            Coverage: {overallCoverage}%
          </span>
        )}
      </div>

      <div className={styles.layout}>
        <div className={styles.boardColumn}>
          <div className={themeClasses || undefined}>
            <div ref={containerRef} className={styles.board} data-testid="repertoire-board" />
          </div>

          {/* "Add to Repertoire" prompt bar */}
          {pendingMove && (
            <div className={styles.addMoveBar} data-testid="add-move-bar">
              <span className={styles.addMoveText}>
                Add <strong>{pendingMove.san}</strong> to repertoire?
              </span>
              <Button size="sm" onClick={handleConfirmAdd} loading={isAdding}>
                Add
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCancelAdd}>
                Cancel
              </Button>
              <span className={styles.addMoveHint}>or press A</span>
            </div>
          )}

          {/* Auto-add toggle */}
          <div className={styles.autoAddToggle}>
            <input
              id="auto-add-toggle"
              type="checkbox"
              checked={autoAdd}
              onChange={(e) => setAutoAdd(e.target.checked)}
            />
            <label htmlFor="auto-add-toggle" className={styles.autoAddLabel}>
              Auto-add new moves
            </label>
          </div>
        </div>

        <div className={styles.sidePanel}>
          <Card header="Move Tree">
            <RepertoireMoveTree
              tree={repertoire.tree}
              currentFen={currentFen}
              onNavigate={handleNavigate}
              onDeleteMove={handleDeleteMove}
              onSetMainLine={handleSetMainLine}
              coverageMap={coverageMapForTree}
              gapFens={opponentPrepVisible ? gapFens : undefined}
            />
          </Card>

          {opponentPrepVisible && (
            <OpponentPrepPanel
              repertoireColor={repertoire.color}
              currentFen={currentFen}
              tree={repertoire.tree}
              onNavigate={handleNavigate}
              onGapsChange={handleGapsChange}
            />
          )}

          <button
            type="button"
            className={styles.explorerToggle}
            onClick={handleExplorerToggle}
            aria-label={explorerVisible ? "Close opening explorer" : "Open opening explorer"}
            aria-pressed={explorerVisible}
            data-testid="explorer-toggle"
          >
            <span className={styles.explorerToggleIcon} aria-hidden="true">
              &#x1F4D6;
            </span>
            {explorerVisible ? "Close Explorer" : "Opening Explorer"}
          </button>

          {explorerVisible && (
            <ExplorerPanel
              fen={`${currentFen} 0 1`}
              onMoveClick={handleExplorerMoveClick}
              onHoverMove={handleExplorerHoverMove}
              onArrowsChange={handleExplorerArrowsChange}
            />
          )}
        </div>
      </div>

      <RepertoirePgnImport
        repertoireId={repertoireId}
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />

      {/* Delete Branch Confirmation Modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Branch"
        footer={
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-2)",
            }}
          >
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        }
      >
        <p>Delete this move and all subsequent moves? This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
