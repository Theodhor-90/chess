import { Chess } from "chess.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LETTERS = ["a", "b", "c", "d", "e"] as const;
const BASE_URL = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";

interface OpeningEntry {
  fen: string;
  eco: string;
  name: string;
}

function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

async function main(): Promise<void> {
  const entries: OpeningEntry[] = [];

  for (const letter of LETTERS) {
    const url = `${BASE_URL}/${letter}.tsv`;
    console.log(`Downloading ${url}...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status}`);
    }
    const text = await response.text();
    const lines = text.trim().split("\n");

    // Skip the header row (first line: "eco\tname\tpgn")
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const [eco, name, pgn] = parts;

      const chess = new Chess();
      try {
        chess.loadPgn(pgn);
      } catch {
        console.warn(`Skipping invalid PGN for ${eco} ${name}: ${pgn}`);
        continue;
      }

      const fen = normalizeFen(chess.fen());
      entries.push({ fen, eco, name });
    }

    console.log(`  Processed ${letter}.tsv (${lines.length - 1} entries)`);
  }

  const outPath = resolve(__dirname, "..", "packages", "shared", "src", "data", "openings.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n");
  console.log(`\nWrote ${entries.length} openings to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
