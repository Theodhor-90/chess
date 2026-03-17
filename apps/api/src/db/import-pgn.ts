import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";
import { resolve } from "node:path";

const PGN_PATH =
  process.argv[2] ?? resolve(import.meta.dirname!, "../../../../databases/test_sample.pgn");
const DB_PATH = process.argv[3] ?? resolve(import.meta.dirname!, "../../databases/games.db");
const BATCH_SIZE = 1000;

interface ParsedGame {
  white: string;
  black: string;
  whiteElo: number;
  blackElo: number;
  result: string;
  eco: string | null;
  opening: string | null;
  date: string | null;
  timeControl: string | null;
  termination: string | null;
  lichessUrl: string;
  pgn: string;
}

function parseHeaders(lines: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^\[(\w+)\s+"(.*)"\]$/);
    if (match) {
      headers[match[1]] = match[2];
    }
  }
  return headers;
}

function toGame(headerLines: string[], moveLines: string[]): ParsedGame | null {
  const h = parseHeaders(headerLines);
  const url = h["LichessURL"];
  if (!url || !h["White"] || !h["Black"] || !h["Result"]) return null;

  const whiteElo = parseInt(h["WhiteElo"] ?? "0", 10);
  const blackElo = parseInt(h["BlackElo"] ?? "0", 10);
  if (isNaN(whiteElo) || isNaN(blackElo)) return null;

  return {
    white: h["White"],
    black: h["Black"],
    whiteElo,
    blackElo,
    result: h["Result"],
    eco: h["ECO"] ?? null,
    opening: h["Opening"] ?? null,
    date: h["Date"] ?? null,
    timeControl: h["TimeControl"] ?? null,
    termination: h["Termination"] ?? null,
    lichessUrl: url,
    pgn: moveLines.join(" ").trim(),
  };
}

async function importPgn() {
  console.log(`Importing from: ${PGN_PATH}`);
  console.log(`Into database:  ${DB_PATH}`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");

  const insert = db.prepare(`
    INSERT OR IGNORE INTO database_games
      (white, black, white_elo, black_elo, result, eco, opening, date, time_control, termination, lichess_url, pgn)
    VALUES
      (@white, @black, @whiteElo, @blackElo, @result, @eco, @opening, @date, @timeControl, @termination, @lichessUrl, @pgn)
  `);

  const insertMany = db.transaction((games: ParsedGame[]) => {
    for (const g of games) {
      insert.run(g);
    }
  });

  const rl = createInterface({
    input: createReadStream(PGN_PATH, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let headerLines: string[] = [];
  let moveLines: string[] = [];
  let inMoves = false;
  let batch: ParsedGame[] = [];
  let imported = 0;
  let skipped = 0;

  for await (const line of rl) {
    if (line.startsWith("[")) {
      // If we were collecting moves, the previous game is done
      if (inMoves && headerLines.length > 0) {
        const game = toGame(headerLines, moveLines);
        if (game) {
          batch.push(game);
          if (batch.length >= BATCH_SIZE) {
            insertMany(batch);
            imported += batch.length;
            batch = [];
            if (imported % 10000 === 0) {
              console.log(`  ${imported} games imported...`);
            }
          }
        } else {
          skipped++;
        }
        headerLines = [];
        moveLines = [];
        inMoves = false;
      }
      headerLines.push(line);
    } else if (line.trim() === "") {
      if (headerLines.length > 0 && !inMoves) {
        inMoves = true;
      }
    } else {
      moveLines.push(line);
    }
  }

  // Final game
  if (headerLines.length > 0) {
    const game = toGame(headerLines, moveLines);
    if (game) {
      batch.push(game);
    } else {
      skipped++;
    }
  }

  if (batch.length > 0) {
    insertMany(batch);
    imported += batch.length;
  }

  db.close();
  console.log(`Done! Imported ${imported} games, skipped ${skipped}.`);
}

importPgn().catch(console.error);
