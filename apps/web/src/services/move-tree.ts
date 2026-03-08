import { Chess } from "chess.js";
import type { MoveTreeNode, SerializedMoveTreeNode } from "@chess/shared";

export function buildTreeFromPgn(pgn: string): MoveTreeNode {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history();
  chess.reset();

  const root: MoveTreeNode = {
    fen: chess.fen(),
    eval: null,
    classification: null,
    san: null,
    children: [],
    parent: null,
  };

  let currentNode = root;
  for (const san of history) {
    chess.move(san);
    const child: MoveTreeNode = {
      fen: chess.fen(),
      eval: null,
      classification: null,
      san,
      children: [],
      parent: currentNode,
    };
    currentNode.children.push(child);
    currentNode = child;
  }

  return root;
}

export function serializeTree(root: MoveTreeNode): SerializedMoveTreeNode {
  return {
    fen: root.fen,
    eval: root.eval,
    classification: root.classification,
    san: root.san,
    children: root.children.map((child) => serializeTree(child)),
  };
}

export function deserializeTree(
  data: SerializedMoveTreeNode,
  parent?: MoveTreeNode | null,
): MoveTreeNode {
  const node: MoveTreeNode = {
    fen: data.fen,
    eval: data.eval,
    classification: data.classification,
    san: data.san,
    children: [],
    parent: parent ?? null,
  };
  node.children = data.children.map((child) => deserializeTree(child, node));
  return node;
}

export function addChild(parent: MoveTreeNode, san: string, fen: string): MoveTreeNode {
  const existing = parent.children.find((child) => child.san === san);
  if (existing) {
    return existing;
  }

  const node: MoveTreeNode = {
    fen,
    san,
    eval: null,
    classification: null,
    children: [],
    parent,
  };
  parent.children.push(node);
  return node;
}

export function getParent(node: MoveTreeNode): MoveTreeNode | null {
  return node.parent;
}

export function getChild(node: MoveTreeNode, index: number): MoveTreeNode | null {
  return node.children[index] ?? null;
}

export function getMainLine(node: MoveTreeNode): MoveTreeNode | null {
  return node.children[0] ?? null;
}

export function getVariations(node: MoveTreeNode): MoveTreeNode[] {
  return node.children.slice(1);
}

export function getMainLinePath(root: MoveTreeNode): MoveTreeNode[] {
  const path: MoveTreeNode[] = [root];
  let current = root;
  while (current.children.length > 0) {
    current = current.children[0];
    path.push(current);
  }
  return path;
}
