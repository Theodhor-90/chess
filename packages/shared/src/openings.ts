import openingsData from "./data/openings.json";

export interface OpeningInfo {
  eco: string;
  name: string;
}

export function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function loadOpenings(): Map<string, OpeningInfo> {
  const map = new Map<string, OpeningInfo>();
  for (const entry of openingsData) {
    map.set(entry.fen, { eco: entry.eco, name: entry.name });
  }
  return map;
}

export function classifyPosition(
  fen: string,
  openingsMap: Map<string, OpeningInfo>,
): OpeningInfo | null {
  const normalized = normalizeFen(fen);
  return openingsMap.get(normalized) ?? null;
}

export function classifyGame(
  fens: string[],
  openingsMap: Map<string, OpeningInfo>,
): OpeningInfo | null {
  let deepest: OpeningInfo | null = null;
  for (const fen of fens) {
    const info = classifyPosition(fen, openingsMap);
    if (info !== null) {
      deepest = info;
    }
  }
  return deepest;
}
