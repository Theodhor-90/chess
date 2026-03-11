import { randomUUID } from "node:crypto";
import { eq, or, desc, asc, inArray } from "drizzle-orm";
import type { GameState, ClockConfig, PlayerColor, GamePlayer, GameStatus } from "@chess/shared";
import { db } from "../db/index.js";
import { games, moves, users } from "../db/schema.js";

const DEFAULT_CLOCK: ClockConfig = { initialTime: 600, increment: 0 };
const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type GamesRow = typeof games.$inferSelect;
type MovesRow = typeof moves.$inferSelect;
type GamesUpdate = Partial<typeof games.$inferInsert>;

function lookupUsernames(
  whitePlayerId: number | null,
  blackPlayerId: number | null,
): { white?: string; black?: string } {
  const result: { white?: string; black?: string } = {};
  if (whitePlayerId !== null) {
    const row = db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, whitePlayerId))
      .get();
    if (row) result.white = row.username;
  }
  if (blackPlayerId !== null) {
    const row = db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, blackPlayerId))
      .get();
    if (row) result.black = row.username;
  }
  return result;
}

function rowToGameState(
  row: GamesRow,
  movesRows: MovesRow[],
  usernames?: { white?: string; black?: string },
): GameState {
  const names = usernames ?? lookupUsernames(row.whitePlayerId, row.blackPlayerId);
  const players: { white?: GamePlayer; black?: GamePlayer } = {};
  if (row.whitePlayerId !== null) {
    players.white = { userId: row.whitePlayerId, color: "white", username: names.white };
  }
  if (row.blackPlayerId !== null) {
    players.black = { userId: row.blackPlayerId, color: "black", username: names.black };
  }

  const state: GameState = {
    id: row.id,
    inviteToken: row.inviteToken,
    status: row.status as GameStatus,
    players,
    fen: row.fen,
    pgn: row.pgn,
    moves: movesRows.map((m) => m.san),
    currentTurn: row.currentTurn as PlayerColor,
    clock: {
      initialTime: row.clockInitialTime,
      increment: row.clockIncrement,
    },
    drawOffer: (row.drawOffer as PlayerColor) ?? null,
    createdAt: row.createdAt,
    clockWhiteRemaining: row.clockWhiteRemaining ?? null,
    clockBlackRemaining: row.clockBlackRemaining ?? null,
  };

  if (row.resultReason !== null) {
    state.result = {
      reason: row.resultReason as GameStatus,
      ...(row.resultWinner !== null ? { winner: row.resultWinner as PlayerColor } : {}),
    };
  }

  return state;
}

export function createGame(creatorUserId: number, clock?: ClockConfig): GameState {
  const inviteToken = randomUUID();
  const creatorColor: PlayerColor = Math.random() < 0.5 ? "white" : "black";
  const clockConfig = clock ?? DEFAULT_CLOCK;

  const row = db
    .insert(games)
    .values({
      inviteToken,
      status: "waiting",
      whitePlayerId: creatorColor === "white" ? creatorUserId : null,
      blackPlayerId: creatorColor === "black" ? creatorUserId : null,
      fen: STARTING_FEN,
      pgn: "",
      currentTurn: "white",
      clockInitialTime: clockConfig.initialTime,
      clockIncrement: clockConfig.increment,
    })
    .returning()
    .get();

  return rowToGameState(row, []);
}

export function getGame(id: number): GameState | undefined {
  const row = db.select().from(games).where(eq(games.id, id)).get();
  if (!row) return undefined;
  const movesRows = db
    .select()
    .from(moves)
    .where(eq(moves.gameId, id))
    .orderBy(asc(moves.moveNumber))
    .all();
  return rowToGameState(row, movesRows);
}

export function updateGame(id: number, updates: Partial<GameState>): GameState {
  const setValues: GamesUpdate = {};

  if (updates.status !== undefined) setValues.status = updates.status;
  if (updates.fen !== undefined) setValues.fen = updates.fen;
  if (updates.pgn !== undefined) setValues.pgn = updates.pgn;
  if (updates.currentTurn !== undefined) setValues.currentTurn = updates.currentTurn;
  if (updates.drawOffer !== undefined) setValues.drawOffer = updates.drawOffer;
  if (updates.drawOffer === null) setValues.drawOffer = null;

  if (updates.players !== undefined) {
    if (updates.players.white !== undefined) {
      setValues.whitePlayerId = updates.players.white.userId;
    }
    if (updates.players.black !== undefined) {
      setValues.blackPlayerId = updates.players.black.userId;
    }
  }

  if (updates.clock !== undefined) {
    setValues.clockInitialTime = updates.clock.initialTime;
    setValues.clockIncrement = updates.clock.increment;
  }

  if (updates.result !== undefined) {
    setValues.resultWinner = updates.result.winner ?? null;
    setValues.resultReason = updates.result.reason;
  }

  if (updates.clockWhiteRemaining !== undefined) {
    setValues.clockWhiteRemaining = updates.clockWhiteRemaining;
  }
  if (updates.clockBlackRemaining !== undefined) {
    setValues.clockBlackRemaining = updates.clockBlackRemaining;
  }

  if (Object.keys(setValues).length > 0) {
    db.update(games).set(setValues).where(eq(games.id, id)).run();
  }

  const game = getGame(id);
  if (!game) {
    throw new Error(`Game ${id} not found`);
  }
  return game;
}

export function getGameByInviteToken(inviteToken: string): GameState | undefined {
  const row = db.select().from(games).where(eq(games.inviteToken, inviteToken)).get();
  if (!row) return undefined;
  const movesRows = db
    .select()
    .from(moves)
    .where(eq(moves.gameId, row.id))
    .orderBy(asc(moves.moveNumber))
    .all();
  return rowToGameState(row, movesRows);
}

export function getGamesByUserId(userId: number): GameState[] {
  const rows = db
    .select()
    .from(games)
    .where(or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)))
    .orderBy(desc(games.createdAt), desc(games.id))
    .all();

  // Collect all unique player IDs for batch username lookup
  const playerIds = new Set<number>();
  for (const row of rows) {
    if (row.whitePlayerId !== null) playerIds.add(row.whitePlayerId);
    if (row.blackPlayerId !== null) playerIds.add(row.blackPlayerId);
  }

  // Batch fetch usernames
  const usernameMap = new Map<number, string>();
  if (playerIds.size > 0) {
    const userRows = db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, [...playerIds]))
      .all();
    for (const u of userRows) {
      usernameMap.set(u.id, u.username);
    }
  }

  return rows.map((row) => {
    const movesRows = db
      .select()
      .from(moves)
      .where(eq(moves.gameId, row.id))
      .orderBy(asc(moves.moveNumber))
      .all();
    const names = {
      white: row.whitePlayerId !== null ? usernameMap.get(row.whitePlayerId) : undefined,
      black: row.blackPlayerId !== null ? usernameMap.get(row.blackPlayerId) : undefined,
    };
    return rowToGameState(row, movesRows, names);
  });
}

export function addMove(gameId: number, moveNumber: number, san: string): void {
  db.insert(moves).values({ gameId, moveNumber, san }).run();
}
