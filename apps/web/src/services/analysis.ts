import type { AnalyzedPosition, EvalScore, MoveClassification } from "@chess/shared";
import type { StockfishService } from "./stockfish.js";

export function mateScoreToCp(mateValue: number): number {
  if (mateValue === 0) return 0;
  const sign = mateValue > 0 ? 1 : -1;
  return sign * Math.round(100000 / Math.abs(mateValue));
}

function evalToAbsoluteCp(score: EvalScore, isWhiteTurn: boolean): number {
  const raw = score.type === "mate" ? mateScoreToCp(score.value) : score.value;
  return isWhiteTurn ? raw : -raw;
}

export function classifyMove(
  evalBefore: EvalScore,
  evalAfter: EvalScore,
  bestMoveSan: string,
  playedMoveSan: string,
  isWhiteTurn: boolean,
): MoveClassification {
  if (playedMoveSan === bestMoveSan) return "best";

  const cpBefore = evalToAbsoluteCp(evalBefore, isWhiteTurn);
  const cpAfter = evalToAbsoluteCp(evalAfter, !isWhiteTurn);
  const loss = isWhiteTurn ? cpBefore - cpAfter : cpAfter - cpBefore;

  if (loss <= 30) return "good";
  if (loss <= 100) return "inaccuracy";
  if (loss <= 250) return "mistake";
  return "blunder";
}

export function computeAccuracy(centipawnLosses: number[]): number {
  if (centipawnLosses.length === 0) return 100;
  const total = centipawnLosses.reduce(
    (sum, loss) => sum + Math.min(100, Math.max(0, 100 - loss)),
    0,
  );
  return total / centipawnLosses.length;
}

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
