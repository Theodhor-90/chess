import { useState, useEffect, useRef, useCallback } from "react";
import type { RepertoireNode } from "@chess/shared";
import styles from "./RepertoireMoveTree.module.css";

interface RepertoireMoveTreeProps {
  tree: RepertoireNode;
  currentFen: string;
  onNavigate: (fen: string) => void;
  onDeleteMove: (moveId: number) => void;
  onSetMainLine: (moveId: number) => void;
  coverageMap?: Map<string, number>;
  gapFens?: Set<string>;
}

export function RepertoireMoveTree({
  tree,
  currentFen,
  onNavigate,
  onDeleteMove,
  onSetMainLine,
  coverageMap,
  gapFens,
}: RepertoireMoveTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: RepertoireNode;
  } | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Auto-scroll to active move
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentFen]);

  // Close context menu on outside click
  useEffect(() => {
    if (contextMenu === null) return;
    function handleClick() {
      setContextMenu(null);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  function renderMoveButton(
    node: RepertoireNode,
    ply: number,
    afterSideline: boolean,
  ): React.ReactNode {
    const isActive = node.fen === currentFen;
    const isWhiteMove = ply % 2 === 1;
    const moveNum = Math.ceil(ply / 2);

    const classNames = [
      styles.moveButton,
      isActive && styles.moveButtonActive,
      node.isMainLine && styles.moveButtonMainLine,
    ]
      .filter(Boolean)
      .join(" ");

    let coverageDot: React.ReactNode = null;
    if (coverageMap && coverageMap.has(node.fen)) {
      const pct = coverageMap.get(node.fen)!;
      let dotClass = styles.coverageDotGreen;
      if (pct < 50) dotClass = styles.coverageDotRed;
      else if (pct < 100) dotClass = styles.coverageDotYellow;
      coverageDot = (
        <span className={`${styles.coverageDot} ${dotClass}`} title={`Coverage: ${pct}%`} />
      );
    }

    let gapIndicator: React.ReactNode = null;
    if (gapFens && gapFens.has(node.fen)) {
      gapIndicator = (
        <span className={styles.gapWarning} title="Opponent plays uncovered move here" />
      );
    }

    return (
      <span key={`${node.id ?? "root"}-${node.fen}-${ply}`} className={styles.movePair}>
        {isWhiteMove && <span className={styles.moveNumber}>{moveNum}. </span>}
        {!isWhiteMove && afterSideline && <span className={styles.moveNumber}>{moveNum}... </span>}
        {coverageDot}
        {gapIndicator}
        <button
          type="button"
          ref={isActive ? activeRef : undefined}
          className={classNames}
          onClick={() => onNavigate(node.fen)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (node.id !== null) {
              setContextMenu({ x: e.clientX, y: e.clientY, node });
            }
          }}
        >
          {node.san}
        </button>{" "}
      </span>
    );
  }

  function renderTree(): React.ReactNode {
    if (tree.children.length === 0) {
      return (
        <div className={styles.emptyTree}>
          No moves yet. Play a move on the board or use the explorer to add moves.
        </div>
      );
    }

    const elements: React.ReactNode[] = [];
    renderLineRecursive(tree, 0, 0, elements, false);
    return <>{elements}</>;
  }

  function renderLineRecursive(
    parentNode: RepertoireNode,
    ply: number,
    depth: number,
    elements: React.ReactNode[],
    afterSideline: boolean,
  ): void {
    if (parentNode.children.length === 0) return;

    const mainChild = parentNode.children.find((c) => c.isMainLine) ?? parentNode.children[0];
    const sidelines = parentNode.children.filter((c) => c !== mainChild);

    const currentPly = ply + 1;

    // Render main move
    elements.push(renderMoveButton(mainChild, currentPly, afterSideline));

    // Render sidelines (alternative moves from the same position)
    let hadSideline = false;
    for (const side of sidelines) {
      if (depth >= 3 && !expandedPaths.has(`${side.id ?? "x"}-${side.fen}`)) {
        // Collapsed deep sideline
        const lineLength = countLineDepth(side);
        elements.push(
          <span
            key={`collapse-${side.id ?? "x"}-${side.fen}-${currentPly}`}
            className={styles.sideline}
          >
            <button
              type="button"
              className={styles.collapsibleToggle}
              onClick={() => toggleExpanded(`${side.id ?? "x"}-${side.fen}`)}
            >
              [{lineLength} moves...]
            </button>
          </span>,
        );
      } else {
        // Expanded sideline
        const sideElements: React.ReactNode[] = [];
        sideElements.push(renderMoveButton(side, currentPly, false));
        renderLineRecursive(side, currentPly, depth + 1, sideElements, false);

        elements.push(
          <span
            key={`side-${side.id ?? "x"}-${side.fen}-${currentPly}`}
            className={depth >= 2 ? styles.sidelineDeep : styles.sideline}
          >
            <span className={styles.sidelineBracket}>(</span>
            {sideElements}
            <span className={styles.sidelineBracket}>)</span>
          </span>,
        );
      }
      hadSideline = true;
    }

    // Continue the main line — pass `hadSideline` so the next move knows
    // whether to re-state the black move number
    renderLineRecursive(mainChild, currentPly, depth, elements, hadSideline);
  }

  function countLineDepth(node: RepertoireNode): number {
    let count = 1;
    let current = node;
    while (current.children.length > 0) {
      const main = current.children.find((c) => c.isMainLine) ?? current.children[0];
      count++;
      current = main;
    }
    return count;
  }

  return (
    <div ref={containerRef} className={styles.container} data-testid="repertoire-move-tree">
      {renderTree()}

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.id !== null && !contextMenu.node.isMainLine && (
            <button
              type="button"
              className={styles.contextMenuItem}
              onClick={() => {
                onSetMainLine(contextMenu.node.id!);
                setContextMenu(null);
              }}
            >
              Set as Main Line
            </button>
          )}
          {contextMenu.node.id !== null && (
            <button
              type="button"
              className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
              onClick={() => {
                onDeleteMove(contextMenu.node.id!);
                setContextMenu(null);
              }}
            >
              Delete Branch
            </button>
          )}
        </div>
      )}
    </div>
  );
}
