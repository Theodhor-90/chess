import { randomUUID } from "node:crypto";
import type { GameState, ClockConfig, PlayerColor } from "@chess/shared";

const DEFAULT_CLOCK: ClockConfig = { initialTime: 600, increment: 0 };
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const games = new Map<number, GameState>();
let nextId = 1;

export function createGame(creatorUserId: number, clock?: ClockConfig): GameState {
  const id = nextId++;
  const inviteToken = randomUUID();
  const creatorColor: PlayerColor = Math.random() < 0.5 ? "white" : "black";

  const game: GameState = {
    id,
    inviteToken,
    status: "waiting",
    players: {
      [creatorColor]: { userId: creatorUserId, color: creatorColor },
    },
    fen: STARTING_FEN,
    pgn: "",
    moves: [],
    currentTurn: "white",
    clock: clock ? { ...clock } : { ...DEFAULT_CLOCK },
    drawOffer: null,
    createdAt: Math.floor(Date.now() / 1000),
  };

  games.set(id, game);
  return game;
}

export function getGame(id: number): GameState | undefined {
  return games.get(id);
}

export function updateGame(id: number, updates: Partial<GameState>): GameState {
  const game = games.get(id);
  if (!game) {
    throw new Error(`Game ${id} not found`);
  }
  const updated = { ...game, ...updates };
  games.set(id, updated);
  return updated;
}
