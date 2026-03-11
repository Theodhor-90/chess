import { Chess, type Move } from "chess.js";
import type {
  GameState,
  GameListItem,
  GameHistoryItem,
  GameHistoryResponse,
  GameStatus,
  ClockConfig,
  MoveRequest,
  MoveResponse,
  PlayerColor,
  PlayerStatsResponse,
  RecentGameItem,
} from "@chess/shared";
import { and, eq, or, sql, inArray, isNull, desc as descOp, asc as ascOp } from "drizzle-orm";
import * as store from "./store.js";
import { GameError } from "./errors.js";
import { db } from "../db/index.js";
import { games, users, gameAnalyses } from "../db/schema.js";

function getPlayerColor(game: GameState, userId: number): PlayerColor {
  if (game.players.white?.userId === userId) return "white";
  if (game.players.black?.userId === userId) return "black";
  throw new GameError("NOT_A_PLAYER", "You are not a player in this game");
}

export function createGame(creatorUserId: number, clock?: ClockConfig): GameState {
  return store.createGame(creatorUserId, clock);
}

export function joinGame(gameId: number, userId: number, inviteToken: string): GameState {
  const game = store.getGame(gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "waiting") {
    throw new GameError("INVALID_STATUS", "Game is not waiting for players");
  }
  if (game.inviteToken !== inviteToken) {
    throw new GameError("INVALID_INVITE_TOKEN", "Invalid invite token");
  }

  const creatorUserId = game.players.white?.userId ?? game.players.black?.userId;
  if (userId === creatorUserId) {
    throw new GameError("CANNOT_JOIN_OWN_GAME", "Cannot join your own game");
  }

  const remainingColor: PlayerColor = game.players.white ? "black" : "white";
  const updatedPlayers = {
    ...game.players,
    [remainingColor]: { userId, color: remainingColor },
  };

  return store.updateGame(gameId, { status: "active", players: updatedPlayers });
}

export function makeMove(gameId: number, userId: number, move: MoveRequest): MoveResponse {
  const game = store.getGame(gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "active") {
    throw new GameError("INVALID_STATUS", "Game is not active");
  }

  const playerColor = getPlayerColor(game, userId);
  if (playerColor !== game.currentTurn) {
    throw new GameError("NOT_YOUR_TURN", "It is not your turn");
  }

  const chess = new Chess(game.fen);
  let chessMove: Move;
  try {
    chessMove = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Illegal move";
    throw new GameError("ILLEGAL_MOVE", message);
  }

  const fen = chess.fen();
  const pgn = chess.pgn();
  const san = chessMove.san;
  const moves = [...game.moves, san];
  const nextTurn: PlayerColor = chess.turn() === "w" ? "white" : "black";

  const drawOffer = game.drawOffer === playerColor ? null : game.drawOffer;

  let status: GameState["status"] = "active";
  let gameResult: GameState["result"] | undefined;

  if (chess.isCheckmate()) {
    status = "checkmate";
    gameResult = { winner: playerColor, reason: "checkmate" };
  } else if (chess.isStalemate()) {
    status = "stalemate";
    gameResult = { reason: "stalemate" };
  } else if (chess.isDraw()) {
    status = "draw";
    gameResult = { reason: "draw" };
  }

  const finalDrawOffer = gameResult ? null : drawOffer;

  store.addMove(gameId, moves.length, san);
  store.updateGame(gameId, {
    fen,
    pgn,
    currentTurn: nextTurn,
    drawOffer: finalDrawOffer,
    status,
    ...(gameResult ? { result: gameResult } : {}),
  });

  return {
    fen,
    pgn,
    san,
    status,
    ...(gameResult ? { result: gameResult } : {}),
  };
}

export function resignGame(gameId: number, userId: number): GameState {
  const game = store.getGame(gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "active") {
    throw new GameError("INVALID_STATUS", "Game is not active");
  }

  const playerColor = getPlayerColor(game, userId);
  const winner: PlayerColor = playerColor === "white" ? "black" : "white";

  return store.updateGame(gameId, {
    status: "resigned",
    result: { winner, reason: "resigned" },
    drawOffer: null,
  });
}

export function offerOrAcceptDraw(gameId: number, userId: number): GameState {
  const game = store.getGame(gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "active") {
    throw new GameError("INVALID_STATUS", "Game is not active");
  }

  const playerColor = getPlayerColor(game, userId);

  if (game.drawOffer === null) {
    return store.updateGame(gameId, { drawOffer: playerColor });
  }

  if (game.drawOffer === playerColor) {
    return game;
  }

  return store.updateGame(gameId, {
    status: "draw",
    result: { reason: "draw" },
    drawOffer: null,
  });
}

export function abortGame(gameId: number, userId: number): GameState {
  const game = store.getGame(gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "waiting") {
    throw new GameError("INVALID_STATUS", "Game can only be aborted while waiting");
  }

  const creatorUserId = game.players.white?.userId ?? game.players.black?.userId;
  if (userId !== creatorUserId) {
    throw new GameError("NOT_A_PLAYER", "Only the creator can abort the game");
  }

  return store.updateGame(gameId, { status: "aborted", drawOffer: null });
}

export function getGame(gameId: number): GameState {
  const game = store.getGame(gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  return game;
}

export function resolveInviteToken(inviteToken: string): {
  gameId: number;
  status: GameState["status"];
} {
  const game = store.getGameByInviteToken(inviteToken);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Invalid invite token");
  }
  return { gameId: game.id, status: game.status };
}

export function getUserGames(userId: number): GameListItem[] {
  const games = store.getGamesByUserId(userId);
  return games.map((game) => ({
    id: game.id,
    status: game.status,
    players: game.players,
    clock: game.clock,
    result: game.result,
    createdAt: game.createdAt,
  }));
}

export function timeoutGame(gameId: number, timedOutColor: PlayerColor): GameState {
  const game = store.getGame(gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "active") {
    throw new GameError("INVALID_STATUS", "Game is not active");
  }

  const winner: PlayerColor = timedOutColor === "white" ? "black" : "white";

  return store.updateGame(gameId, {
    status: "timeout",
    result: { winner, reason: "timeout" },
    drawOffer: null,
  });
}

const TERMINAL_STATUSES = ["checkmate", "stalemate", "resigned", "draw", "timeout"];

export function getGameHistory(
  userId: number,
  query: { page?: number; limit?: number; result?: "win" | "loss" | "draw"; sort?: "newest" | "oldest" },
): GameHistoryResponse {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.max(1, Math.min(50, query.limit ?? 20));
  const sort = query.sort ?? "newest";

  const baseCondition = and(
    or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
    inArray(games.status, TERMINAL_STATUSES),
  )!;

  let conditions = baseCondition;

  if (query.result === "win") {
    conditions = and(
      baseCondition,
      or(
        and(eq(games.whitePlayerId, userId), eq(games.resultWinner, "white")),
        and(eq(games.blackPlayerId, userId), eq(games.resultWinner, "black")),
      ),
    )!;
  } else if (query.result === "loss") {
    conditions = and(
      baseCondition,
      or(
        and(eq(games.whitePlayerId, userId), eq(games.resultWinner, "black")),
        and(eq(games.blackPlayerId, userId), eq(games.resultWinner, "white")),
      ),
    )!;
  } else if (query.result === "draw") {
    conditions = and(
      baseCondition,
      isNull(games.resultWinner),
      inArray(games.status, ["stalemate", "draw"]),
    )!;
  }

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(games)
    .where(conditions)
    .get();
  const total = countResult?.count ?? 0;

  const orderBy = sort === "newest" ? descOp(games.createdAt) : ascOp(games.createdAt);
  const offset = (page - 1) * limit;

  const rows = db
    .select()
    .from(games)
    .where(conditions)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)
    .all();

  const opponentIds = new Set<number>();
  for (const row of rows) {
    const opponentId =
      row.whitePlayerId === userId ? row.blackPlayerId : row.whitePlayerId;
    if (opponentId !== null) opponentIds.add(opponentId);
  }

  const usernameMap = new Map<number, string>();
  if (opponentIds.size > 0) {
    const userRows = db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, [...opponentIds]))
      .all();
    for (const u of userRows) {
      usernameMap.set(u.id, u.username);
    }
  }

  const items: GameHistoryItem[] = rows.map((row) => {
    const myColor: PlayerColor = row.whitePlayerId === userId ? "white" : "black";
    const opponentId =
      myColor === "white" ? row.blackPlayerId! : row.whitePlayerId!;
    const opponentUsername = usernameMap.get(opponentId) ?? "Unknown";

    let result: "win" | "loss" | "draw";
    if (row.resultWinner === myColor) {
      result = "win";
    } else if (row.resultWinner !== null) {
      result = "loss";
    } else {
      result = "draw";
    }

    const timeControl = `${Math.floor(row.clockInitialTime / 60)}+${row.clockIncrement}`;

    return {
      id: row.id,
      opponentUsername,
      opponentId,
      result,
      resultReason: row.status as GameStatus,
      myColor,
      timeControl,
      playedAt: row.createdAt,
    };
  });

  return { items, total };
}

export function getPlayerStats(userId: number): PlayerStatsResponse | null {
  const user = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return null;

  const baseCondition = and(
    or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
    inArray(games.status, TERMINAL_STATUSES),
  )!;

  const countResult = db
    .select({
      total: sql<number>`count(*)`,
      wins: sql<number>`count(*) FILTER (WHERE (${games.whitePlayerId} = ${userId} AND ${games.resultWinner} = 'white') OR (${games.blackPlayerId} = ${userId} AND ${games.resultWinner} = 'black'))`,
      losses: sql<number>`count(*) FILTER (WHERE (${games.whitePlayerId} = ${userId} AND ${games.resultWinner} = 'black') OR (${games.blackPlayerId} = ${userId} AND ${games.resultWinner} = 'white'))`,
    })
    .from(games)
    .where(baseCondition)
    .get();

  const totalGames = countResult?.total ?? 0;
  const wins = countResult?.wins ?? 0;
  const losses = countResult?.losses ?? 0;
  const draws = totalGames - wins - losses;
  const winRate = totalGames === 0 ? 0 : Math.round((wins / totalGames) * 1000) / 10;

  const accuracyWhiteResult = db
    .select({ avg: sql<number | null>`AVG(${gameAnalyses.whiteAccuracy})` })
    .from(gameAnalyses)
    .innerJoin(games, eq(gameAnalyses.gameId, games.id))
    .where(eq(games.whitePlayerId, userId))
    .get();

  const accuracyBlackResult = db
    .select({ avg: sql<number | null>`AVG(${gameAnalyses.blackAccuracy})` })
    .from(gameAnalyses)
    .innerJoin(games, eq(gameAnalyses.gameId, games.id))
    .where(eq(games.blackPlayerId, userId))
    .get();

  const avgWhite = accuracyWhiteResult?.avg ?? null;
  const avgBlack = accuracyBlackResult?.avg ?? null;

  const recentRows = db
    .select()
    .from(games)
    .where(baseCondition)
    .orderBy(descOp(games.createdAt))
    .limit(10)
    .all();

  const opponentIds = new Set<number>();
  for (const row of recentRows) {
    const opponentId = row.whitePlayerId === userId ? row.blackPlayerId : row.whitePlayerId;
    if (opponentId !== null) opponentIds.add(opponentId);
  }

  const usernameMap = new Map<number, string>();
  if (opponentIds.size > 0) {
    const userRows = db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, [...opponentIds]))
      .all();
    for (const u of userRows) {
      usernameMap.set(u.id, u.username);
    }
  }

  const recentGames: RecentGameItem[] = recentRows.map((row) => {
    const myColor: PlayerColor = row.whitePlayerId === userId ? "white" : "black";
    const opponentId = myColor === "white" ? row.blackPlayerId! : row.whitePlayerId!;
    const opponentUsername = usernameMap.get(opponentId) ?? "Unknown";

    let result: "win" | "loss" | "draw";
    if (row.resultWinner === myColor) {
      result = "win";
    } else if (row.resultWinner !== null) {
      result = "loss";
    } else {
      result = "draw";
    }

    return {
      gameId: row.id,
      opponentUsername,
      opponentId,
      result,
      resultReason: row.status as GameStatus,
      myColor,
      playedAt: row.createdAt,
    };
  });

  return {
    userId: user.id,
    username: user.username,
    totalGames,
    wins,
    losses,
    draws,
    winRate,
    avgAccuracy: {
      white: avgWhite !== null ? Math.round(avgWhite * 10) / 10 : null,
      black: avgBlack !== null ? Math.round(avgBlack * 10) / 10 : null,
    },
    recentGames,
  };
}
