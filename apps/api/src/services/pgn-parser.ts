import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export interface ParsedPgnGame {
  headers: Record<string, string>;
  moveText: string;
  rawPgn: string;
}

export async function parsePgnStream(
  filePath: string,
  onGame: (game: ParsedPgnGame) => void,
): Promise<number> {
  const input = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input, crlfDelay: Infinity });

  let headerLines: string[] = [];
  let moveTextLines: string[] = [];
  let inMoveText = false;
  let gameCount = 0;

  function emitGame(): void {
    if (headerLines.length === 0) {
      moveTextLines = [];
      inMoveText = false;
      return;
    }

    const headers: Record<string, string> = {};

    for (const line of headerLines) {
      const match = line.match(/^\[(\w+)\s+"(.*)"\]$/);
      if (match) {
        headers[match[1]] = match[2];
      }
    }

    const moveText = moveTextLines.join("\n").trim();
    const rawPgn = headerLines.join("\n") + "\n\n" + moveText;

    onGame({ headers, moveText, rawPgn });
    gameCount += 1;

    headerLines = [];
    moveTextLines = [];
    inMoveText = false;
  }

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === "") {
      if (inMoveText) {
        emitGame();
      } else if (headerLines.length > 0) {
        inMoveText = true;
      }

      continue;
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]") && !inMoveText) {
      headerLines.push(trimmed);
    } else {
      inMoveText = true;
      moveTextLines.push(trimmed);
    }
  }

  emitGame();

  return gameCount;
}
