import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  buildTreeFromPgn,
  serializeTree,
  deserializeTree,
  addChild,
  getParent,
  getChild,
  getMainLine,
  getVariations,
  getMainLinePath,
} from "../src/services/move-tree.js";

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

describe("addChild", () => {
  it("inserting a new move at a mid-game node creates a child with correct fields", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    // Navigate to node after 1. e4 e5 2. Qh5 (the Qh5 node)
    const qh5Node = root.children[0].children[0].children[0];

    // Compute valid FEN for the alternative move d5 after 1. e4 e5 2. Qh5
    const chess = new Chess();
    chess.move("e4");
    chess.move("e5");
    chess.move("Qh5");
    chess.move("d5");
    const expectedFen = chess.fen();

    const newNode = addChild(qh5Node, "d5", expectedFen);

    expect(newNode.san).toBe("d5");
    expect(newNode.fen).toBe(expectedFen);
    expect(newNode.eval).toBeNull();
    expect(newNode.classification).toBeNull();
    expect(newNode.children).toEqual([]);
    expect(newNode.parent).toBe(qh5Node);
    expect(qh5Node.children).toHaveLength(2);
    expect(qh5Node.children[1]).toBe(newNode);
  });

  it("inserting the same SAN at the same parent returns the existing child (no duplicate)", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const existingChild = root.children[0];

    const result = addChild(root, "e4", existingChild.fen);

    expect(result).toBe(existingChild);
    expect(root.children).toHaveLength(1);
  });

  it("inserting at a node with existing children appends as a variation", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);

    const chess = new Chess();
    chess.move("d4");
    const d4Fen = chess.fen();

    const newNode = addChild(root, "d4", d4Fen);

    expect(root.children).toHaveLength(2);
    expect(root.children[0].san).toBe("e4");
    expect(root.children[1].san).toBe("d4");
    expect(newNode.san).toBe("d4");
  });

  it("parent reference is correctly set on new children", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    // Node after 1. e4
    const e4Node = root.children[0];

    const chess = new Chess();
    chess.move("e4");
    chess.move("d5");
    const d5Fen = chess.fen();

    const newNode = addChild(e4Node, "d5", d5Fen);

    expect(newNode.parent).toBe(e4Node);
  });

  it("multiple insertions at the same parent produce correct children ordering", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);

    const chess1 = new Chess();
    chess1.move("d4");

    const chess2 = new Chess();
    chess2.move("c4");

    const chess3 = new Chess();
    chess3.move("Nf3");

    addChild(root, "d4", chess1.fen());
    addChild(root, "c4", chess2.fen());
    addChild(root, "Nf3", chess3.fen());

    expect(root.children).toHaveLength(4);
    expect(root.children.map((c) => c.san)).toEqual(["e4", "d4", "c4", "Nf3"]);
  });

  it("tree remains serializable after branch insertions", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);

    const chess = new Chess();
    chess.move("d4");
    addChild(root, "d4", chess.fen());

    const serialized = serializeTree(root);
    const json = JSON.stringify(serialized);
    expect(() => JSON.parse(json)).not.toThrow();

    const parsed = JSON.parse(json) as { children: unknown[] };
    expect(parsed.children).toHaveLength(2);
  });
});

describe("tree navigation", () => {
  it("getParent returns correct parent for a mid-tree node", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const e4Node = root.children[0];
    const e5Node = e4Node.children[0];
    expect(getParent(e5Node)).toBe(e4Node);
  });

  it("getParent returns null for the root node", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    expect(getParent(root)).toBeNull();
  });

  it("getChild returns correct child by index", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    expect(getChild(root, 0)).toBe(root.children[0]);
  });

  it("getChild returns null for out-of-bounds index", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    expect(getChild(root, 5)).toBeNull();
  });

  it("getChild returns null for a leaf node", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const path = getMainLinePath(root);
    const lastNode = path[path.length - 1];
    expect(getChild(lastNode, 0)).toBeNull();
  });

  it("getMainLine returns the first child", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    expect(getMainLine(root)).toBe(root.children[0]);
  });

  it("getMainLine returns null for a leaf node", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const path = getMainLinePath(root);
    const lastNode = path[path.length - 1];
    expect(getMainLine(lastNode)).toBeNull();
  });

  it("getVariations returns children from index 1 onward", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);

    const chess = new Chess();
    chess.move("d4");
    const d4Node = addChild(root, "d4", chess.fen());

    const variations = getVariations(root);
    expect(variations).toHaveLength(1);
    expect(variations[0]).toBe(d4Node);
  });

  it("getVariations returns empty array if node has 0 or 1 children", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    expect(getVariations(root)).toEqual([]);
  });

  it("getMainLinePath returns all nodes from root to end of main line in order", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const path = getMainLinePath(root);
    expect(path).toHaveLength(8);
    expect(path[0]).toBe(root);
    expect(path[path.length - 1].san).toBe("Qxf7#");
  });

  it("getMainLinePath returns [root] for a root-only tree", () => {
    const root = buildTreeFromPgn("");
    const path = getMainLinePath(root);
    expect(path).toHaveLength(1);
    expect(path[0]).toBe(root);
  });

  it("navigating through main line from root to end visits every node in order", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);
    const collected: typeof root[] = [];
    let current: typeof root | null = root;
    while (current !== null) {
      collected.push(current);
      current = getMainLine(current);
    }
    const path = getMainLinePath(root);
    expect(collected).toHaveLength(path.length);
    for (let i = 0; i < path.length; i++) {
      expect(collected[i]).toBe(path[i]);
    }
  });

  it("navigating into a variation and back to parent works correctly", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);

    const chess = new Chess();
    chess.move("d4");
    const d4Node = addChild(root, "d4", chess.fen());

    expect(getParent(d4Node)).toBe(root);
  });

  it("navigating to a variation then following its main line produces correct sequence", () => {
    const root = buildTreeFromPgn(SCHOLARS_MATE_PGN);

    const chess = new Chess();
    chess.move("d4");
    const d4Fen = chess.fen();
    const d4Node = addChild(root, "d4", d4Fen);

    chess.move("d5");
    const d5Fen = chess.fen();
    const d5Node = addChild(d4Node, "d5", d5Fen);

    expect(getMainLine(d4Node)).toBe(d5Node);
    expect(getParent(d5Node)).toBe(d4Node);
  });
});
