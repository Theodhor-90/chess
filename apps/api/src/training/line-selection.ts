import { sqlite } from "../db/index.js";
import type { RepertoireNode } from "@chess/shared";
import type { TrainingLine, TrainingLineMove } from "@chess/shared";

interface CardRow {
  id: number;
  position_fen: string;
  move_san: string;
  move_uci: string;
  due: number;
  state: number;
}

/**
 * Select the best training line using greedy walk from the root.
 *
 * Algorithm:
 * 1. Load all cards for the repertoire and determine which are due.
 * 2. Build a lookup: "positionFen|moveSan" -> card data.
 * 3. Walk the tree from root. At each node, compute due card counts
 *    for all children's subtrees. Pick the child whose subtree
 *    contains the most due cards. Continue until a leaf is reached.
 * 4. Return the path as a TrainingLine, with isUserMove, cardId, isDue
 *    populated for each step.
 * 5. If no cards are due in the entire tree, return null.
 *
 * "Due" means: card.state === 0 (New) OR card.due <= nowUnix.
 *
 * Tree structure notes:
 * - Each node's `fen` is the position AFTER the move that led to it
 *   (i.e., the result position).
 * - Children of a node are moves played FROM that node's `fen`.
 * - A card's `position_fen` in the DB is the position BEFORE the move
 *   (where the user makes their choice). So to look up a card for a
 *   child node, use: parentNode.fen + child.san.
 * - `isUserMove` is determined by checking the side-to-move in the
 *   PARENT node's FEN against the repertoire's color.
 */
export function selectTrainingLine(
  repertoireId: number,
  tree: RepertoireNode,
  nowUnix: number,
): TrainingLine | null {
  // Fetch the repertoire to know the side
  const repRow = sqlite.prepare("SELECT color FROM repertoires WHERE id = ?").get(repertoireId) as
    | { color: string }
    | undefined;
  if (!repRow) return null;

  const userSideToMove = repRow.color === "white" ? "w" : "b";

  // Load all cards for this repertoire
  const cards = sqlite
    .prepare(
      "SELECT id, position_fen, move_san, move_uci, due, state FROM repertoire_cards WHERE repertoire_id = ?",
    )
    .all(repertoireId) as CardRow[];

  // Build a map: "positionFen|moveSan" -> CardRow
  const cardMap = new Map<string, CardRow>();
  for (const card of cards) {
    cardMap.set(`${card.position_fen}|${card.move_san}`, card);
  }

  // Helper: is a card due?
  function isCardDue(card: CardRow): boolean {
    return card.state === 0 || card.due <= nowUnix;
  }

  // Count due cards in a subtree rooted at a node.
  // parentFen is the FEN of the parent node (needed to look up the card
  // for the move leading to this node).
  // Results are cached by node reference for efficiency.
  const subtreeCache = new Map<RepertoireNode, number>();

  function getSubtreeDueCount(node: RepertoireNode, parentFen: string | null): number {
    if (subtreeCache.has(node)) return subtreeCache.get(node)!;

    let count = 0;

    // Check if the move leading to this node has a due card.
    // A card exists only for user-side moves (where the FEN side-to-move
    // of the PARENT position matches the repertoire color).
    if (node.san !== null && parentFen !== null) {
      const fenSideToMove = parentFen.split(" ")[1];
      if (fenSideToMove === userSideToMove) {
        const card = cardMap.get(`${parentFen}|${node.san}`);
        if (card && isCardDue(card)) {
          count += 1;
        }
      }
    }

    // Recurse into children — this node's fen is the parent fen for children
    for (const child of node.children) {
      count += getSubtreeDueCount(child, node.fen);
    }

    subtreeCache.set(node, count);
    return count;
  }

  // Compute total due count from root
  const totalDue = getSubtreeDueCount(tree, null);
  if (totalDue === 0) return null;

  // Now greedily walk the tree to build the best path.
  // At each branch point, pick the child with the most due cards.
  const line: TrainingLineMove[] = [];

  // Root node: the starting position
  line.push({
    fen: tree.fen,
    san: null,
    uci: null,
    isUserMove: false, // root has no move
    cardId: null,
    isDue: false,
  });

  let currentNode = tree;

  while (currentNode.children.length > 0) {
    // Pick the child with the most due cards in its subtree
    let bestChild = currentNode.children[0];
    let bestDue = getSubtreeDueCount(bestChild, currentNode.fen);

    for (let i = 1; i < currentNode.children.length; i++) {
      const child = currentNode.children[i];
      const childDue = getSubtreeDueCount(child, currentNode.fen);
      if (childDue > bestDue) {
        bestDue = childDue;
        bestChild = child;
      }
    }

    // Determine if the move leading to bestChild is a user move
    const fenSideToMove = currentNode.fen.split(" ")[1];
    const isUserMove = fenSideToMove === userSideToMove;

    // Look up the card for this move (if it's a user move)
    let cardId: number | null = null;
    let isDue = false;

    if (isUserMove && bestChild.san) {
      const card = cardMap.get(`${currentNode.fen}|${bestChild.san}`);
      if (card) {
        cardId = card.id;
        isDue = isCardDue(card);
      }
    }

    line.push({
      fen: bestChild.fen,
      san: bestChild.san,
      uci: bestChild.uci,
      isUserMove,
      cardId,
      isDue,
    });

    currentNode = bestChild;
  }

  return line;
}

/**
 * Count total due cards and new cards for a repertoire.
 * A card is "due" if state=0 (New) or due <= nowUnix.
 * "newCount" is specifically cards with state=0.
 */
export function countDueCards(
  repertoireId: number,
  nowUnix: number,
): { dueCount: number; newCount: number } {
  const dueRow = sqlite
    .prepare(
      "SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ? AND (state = 0 OR due <= ?)",
    )
    .get(repertoireId, nowUnix) as { cnt: number };

  const newRow = sqlite
    .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ? AND state = 0")
    .get(repertoireId) as { cnt: number };

  return { dueCount: dueRow.cnt, newCount: newRow.cnt };
}
