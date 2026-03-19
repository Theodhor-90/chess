export function computeRatingUpdate(
  userRating: number,
  userRD: number,
  puzzleRating: number,
  solved: boolean,
): { newRating: number; newRD: number; delta: number } {
  const k = 32 * (userRD / 350);
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - userRating) / 400));
  const score = solved ? 1 : 0;
  const delta = Math.round(k * (score - expected));
  const newRating = userRating + delta;
  const newRD = Math.max(50, userRD - 1);
  return { newRating, newRD, delta };
}
