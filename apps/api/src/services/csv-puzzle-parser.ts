import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export interface ParsedPuzzleRow {
  puzzleId: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string;
  gameUrl: string;
  openingTags: string | null;
}

export async function parsePuzzleCsvStream(
  filePath: string,
  onPuzzle: (puzzle: ParsedPuzzleRow) => void,
): Promise<number> {
  const input = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input, crlfDelay: Infinity });

  let isFirstLine = true;
  let puzzleCount = 0;

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === "") continue;

    const fields = trimmed.split(",");
    if (fields.length < 9) continue;

    const rating = parseInt(fields[3], 10);
    const ratingDeviation = parseInt(fields[4], 10);
    const popularity = parseInt(fields[5], 10);
    const nbPlays = parseInt(fields[6], 10);

    if (
      Number.isNaN(rating) ||
      Number.isNaN(ratingDeviation) ||
      Number.isNaN(popularity) ||
      Number.isNaN(nbPlays)
    ) {
      continue;
    }

    onPuzzle({
      puzzleId: fields[0],
      fen: fields[1],
      moves: fields[2],
      rating,
      ratingDeviation,
      popularity,
      nbPlays,
      themes: fields[7],
      gameUrl: fields[8],
      openingTags: fields[9] && fields[9].trim() !== "" ? fields[9] : null,
    });

    puzzleCount += 1;
  }

  return puzzleCount;
}
