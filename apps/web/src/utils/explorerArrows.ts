import type { DrawShape, DrawBrushes } from "chessground/draw";
import type { ExplorerMove } from "@chess/shared";

function parseUci(uci: string): { orig: string; dest: string } {
  return {
    orig: uci.slice(0, 2),
    dest: uci.slice(2, 4),
  };
}

const EXPLORER_BRUSHES: DrawBrushes = {
  green: { key: "green", color: "#15781B", opacity: 1, lineWidth: 10 },
  red: { key: "red", color: "#882020", opacity: 1, lineWidth: 10 },
  blue: { key: "blue", color: "#003088", opacity: 1, lineWidth: 10 },
  yellow: { key: "yellow", color: "#e68f00", opacity: 1, lineWidth: 10 },
  explorerGood: { key: "explorerGood", color: "#66bb6a", opacity: 0.6, lineWidth: 10 },
  explorerNeutral: { key: "explorerNeutral", color: "#42a5f5", opacity: 0.5, lineWidth: 10 },
  explorerPoor: { key: "explorerPoor", color: "#ef5350", opacity: 0.5, lineWidth: 10 },
  explorerHover: { key: "explorerHover", color: "#90caf9", opacity: 0.8, lineWidth: 14 },
};

function getBrush(move: ExplorerMove): string {
  const total = move.white + move.draws + move.black;
  if (total === 0) return "explorerNeutral";
  const score = (move.white + move.draws * 0.5) / total;
  if (score > 0.55) return "explorerGood";
  if (score < 0.45) return "explorerPoor";
  return "explorerNeutral";
}

function buildExplorerArrows(moves: ExplorerMove[], maxArrows = 5): DrawShape[] {
  if (moves.length === 0) return [];

  const topMoves = [...moves].sort((a, b) => b.totalGames - a.totalGames).slice(0, maxArrows);

  const maxTotalGames = topMoves[0].totalGames;

  return topMoves.map((move) => {
    const { orig, dest } = parseUci(move.uci);
    const lineWidth =
      maxTotalGames > 0 ? 3 + Math.round((move.totalGames / maxTotalGames) * 12) : 3;

    return {
      orig: orig as DrawShape["orig"],
      dest: dest as DrawShape["orig"],
      brush: getBrush(move),
      modifiers: { lineWidth },
    };
  });
}

function buildHoverArrow(uci: string): DrawShape[] {
  const { orig, dest } = parseUci(uci);
  return [
    {
      orig: orig as DrawShape["orig"],
      dest: dest as DrawShape["orig"],
      brush: "explorerHover",
      modifiers: { lineWidth: 14, hilite: true },
    },
  ];
}

export { EXPLORER_BRUSHES, buildExplorerArrows, buildHoverArrow, parseUci };
