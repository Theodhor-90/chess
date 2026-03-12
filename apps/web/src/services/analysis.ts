import type { AnalyzedPosition, MoveClassification } from "@chess/shared";
import { mateScoreToCp, evalToAbsoluteCp, classifyMove, computeAccuracy } from "@chess/shared";
import type { StockfishService } from "./stockfish.js";

export { mateScoreToCp, evalToAbsoluteCp, classifyMove, computeAccuracy };

export async function analyzeGame(
  service: StockfishService,
  fens: string[],
  playedMoves: string[],
  onProgress?: (moveIndex: number, total: number) => void,
): Promise<{
  positions: AnalyzedPosition[];
  whiteAccuracy: number;
  blackAccuracy: number;
}> {
  const positions: AnalyzedPosition[] = [];
  const whiteLosses: number[] = [];
  const blackLosses: number[] = [];

  for (let i = 0; i < fens.length; i++) {
    onProgress?.(i, fens.length);
    const evaluation = await service.evaluate(fens[i]);

    let classification: MoveClassification | null = null;
    let centipawnLoss: number | null = null;

    if (i > 0) {
      const prevEval = positions[i - 1].evaluation;
      const isWhiteMove = i % 2 === 1;
      classification = classifyMove(
        prevEval.score,
        evaluation.score,
        prevEval.bestLine[0] ?? "",
        playedMoves[i - 1],
        isWhiteMove,
      );

      const cpBefore = evalToAbsoluteCp(prevEval.score, isWhiteMove);
      const cpAfter = evalToAbsoluteCp(evaluation.score, !isWhiteMove);
      const loss = isWhiteMove ? cpBefore - cpAfter : cpAfter - cpBefore;
      centipawnLoss = Math.max(0, loss);

      if (isWhiteMove) {
        whiteLosses.push(centipawnLoss);
      } else {
        blackLosses.push(centipawnLoss);
      }
    }

    positions.push({ fen: fens[i], evaluation, classification, centipawnLoss });
  }

  return {
    positions,
    whiteAccuracy: computeAccuracy(whiteLosses),
    blackAccuracy: computeAccuracy(blackLosses),
  };
}
