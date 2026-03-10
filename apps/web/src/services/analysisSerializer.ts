import type { AnalyzedPosition, SerializedAnalysisNode } from "@chess/shared";

export function positionsToTree(
  fens: string[],
  moves: string[],
  positions: AnalyzedPosition[],
): SerializedAnalysisNode {
  const root: SerializedAnalysisNode = {
    fen: fens[0],
    san: null,
    evaluation: positions[0].evaluation,
    classification: null,
    children: [],
  };

  let current = root;
  for (let i = 0; i < moves.length; i++) {
    const child: SerializedAnalysisNode = {
      fen: fens[i + 1],
      san: moves[i],
      evaluation: positions[i + 1].evaluation,
      classification: positions[i + 1].classification,
      children: [],
    };
    current.children.push(child);
    current = child;
  }

  return root;
}

export function treeToPositions(tree: SerializedAnalysisNode): AnalyzedPosition[] {
  const positions: AnalyzedPosition[] = [];
  let current: SerializedAnalysisNode | null = tree;

  while (current !== null) {
    positions.push({
      fen: current.fen,
      evaluation: current.evaluation!,
      classification: current.classification,
      centipawnLoss: null,
    });
    current = current.children.length > 0 ? current.children[0] : null;
  }

  return positions;
}
