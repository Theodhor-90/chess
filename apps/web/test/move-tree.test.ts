import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { buildTreeFromPgn, serializeTree, deserializeTree } from "../src/services/move-tree.js";

const SCHOLARS_MATE_PGN = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#";

function walkMainLine(root: { children: { children: unknown[] }[] }): unknown[] {
  const nodes: unknown[] = [root];
  let current = root;
  while (current.children.length > 0) {
    current = current.children[0] as typeof current;
    nodes.push(current);
  }
  return nodes;
}

describe("buildTreeFromPgn", () => {
  it("produces correct number of nodes", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const nodes = walkMainLine(root);
    expect(nodes).toHaveLength(8);
  });

  it("root node has correct properties", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const chess = new Chess();
    expect(root.san).toBeNull();
    expect(root.parent).toBeNull();
    expect(root.fen).toBe(chess.fen());
    expect(root.eval).toBeNull();
    expect(root.classification).toBeNull();
  });

  it("each node has correct FEN", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const chess = new Chess();
    chess.loadPgn(SCHOLARS_MATE_PGN);
    const history = chess.history();
    chess.reset();

    const expectedFens = [chess.fen()];
    for (const san of history) {
      chess.move(san);
      expectedFens.push(chess.fen());
    }

    const nodes = walkMainLine(root) as { fen: string }[];
    for (let i = 0; i < nodes.length; i++) {
      expect(nodes[i].fen).toBe(expectedFens[i]);
    }
  });

  it("each non-root node has correct SAN", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const chess = new Chess();
    chess.loadPgn(SCHOLARS_MATE_PGN);
    const history = chess.history();

    const nodes = walkMainLine(root) as { san: string | null }[];
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i].san).toBe(history[i - 1]);
    }
  });

  it("eval and classification are null on all nodes", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const nodes = walkMainLine(root) as { eval: unknown; classification: unknown }[];
    for (const node of nodes) {
      expect(node.eval).toBeNull();
      expect(node.classification).toBeNull();
    }
  });

  it("parent references are wired correctly", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    expect(root.parent).toBeNull();

    let prev = root;
    let current = root.children[0];
    while (current) {
      expect(current.parent).toBe(prev);
      prev = current;
      current = current.children[0];
    }
  });
});

describe("serializeTree", () => {
  it("strips parent references", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const serialized = serializeTree(root);
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    function checkNoParent(node: Record<string, unknown>) {
      expect(node).not.toHaveProperty("parent");
      const children = node.children as Record<string, unknown>[];
      for (const child of children) {
        checkNoParent(child);
      }
    }

    checkNoParent(parsed);
  });

  it("preserves all data fields", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const serialized = serializeTree(root);

    const chess = new Chess();
    expect(serialized.fen).toBe(chess.fen());
    expect(serialized.san).toBeNull();
    expect(serialized.eval).toBeNull();
    expect(serialized.classification).toBeNull();
    expect(serialized.children).toHaveLength(1);

    const nodes = walkMainLine(serialized) as { fen: string }[];
    expect(nodes).toHaveLength(8);
  });
});

describe("deserializeTree", () => {
  it("round-trip preserves data", () => {
    const original = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const deserialized = deserializeTree(serializeTree(original));

    const originalNodes = walkMainLine(original) as {
      fen: string;
      san: string | null;
      eval: unknown;
      classification: unknown;
    }[];
    const deserializedNodes = walkMainLine(deserialized) as typeof originalNodes;

    expect(deserializedNodes).toHaveLength(originalNodes.length);
    for (let i = 0; i < originalNodes.length; i++) {
      expect(deserializedNodes[i].fen).toBe(originalNodes[i].fen);
      expect(deserializedNodes[i].san).toBe(originalNodes[i].san);
      expect(deserializedNodes[i].eval).toEqual(originalNodes[i].eval);
      expect(deserializedNodes[i].classification).toBe(originalNodes[i].classification);
    }
  });

  it("reconstructs parent references", () => {
    const original = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const deserialized = deserializeTree(serializeTree(original));

    expect(deserialized.parent).toBeNull();

    let prev = deserialized;
    let current = deserialized.children[0];
    while (current) {
      expect(current.parent).toBe(prev);
      prev = current;
      current = current.children[0];
    }
  });
});
