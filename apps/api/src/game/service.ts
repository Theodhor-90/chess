import { Chess, type Move } from "chess.js";
import type {
  GameState,
  ClockConfig,
  MoveRequest,
  MoveResponse,
  PlayerColor,
} from "@chess/shared";
import type { DrizzleDb } from "../db/index.js";
import * as store from "./store.js";
import { GameError } from "./errors.js";

function getPlayerColor(game: GameState, userId: number): PlayerColor {
  if (game.players.white?.userId === userId) return "white";
  if (game.players.black?.userId === userId) return "black";
  throw new GameError("NOT_A_PLAYER", "You are not a player in this game");
}

export function createGame(db: DrizzleDb, creatorUserId: number, clock?: ClockConfig): GameState {
  return store.createGame(db, creatorUserId, clock);
}

export function joinGame(
  db: DrizzleDb,
  gameId: number,
  userId: number,
  inviteToken: string,
): GameState {
  const game = store.getGame(db, gameId);
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

  return store.updateGame(db, gameId, { status: "active", players: updatedPlayers });
}

export function makeMove(
  db: DrizzleDb,
  gameId: number,
  userId: number,
  move: MoveRequest,
): MoveResponse {
  const game = store.getGame(db, gameId);
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

  db.transaction((tx) => {
    store.addMove(tx as unknown as DrizzleDb, gameId, game.moves.length + 1, san);
    store.updateGame(tx as unknown as DrizzleDb, gameId, {
      fen,
      pgn,
      currentTurn: nextTurn,
      drawOffer: finalDrawOffer,
      status,
      ...(gameResult ? { result: gameResult } : {}),
    });
  });

  return {
    fen,
    pgn,
    san,
    status,
    ...(gameResult ? { result: gameResult } : {}),
  };
}

export function resignGame(db: DrizzleDb, gameId: number, userId: number): GameState {
  const game = store.getGame(db, gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "active") {
    throw new GameError("INVALID_STATUS", "Game is not active");
  }

  const playerColor = getPlayerColor(game, userId);
  const winner: PlayerColor = playerColor === "white" ? "black" : "white";

  return store.updateGame(db, gameId, {
    status: "resigned",
    result: { winner, reason: "resigned" },
    drawOffer: null,
  });
}

export function offerOrAcceptDraw(db: DrizzleDb, gameId: number, userId: number): GameState {
  const game = store.getGame(db, gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  if (game.status !== "active") {
    throw new GameError("INVALID_STATUS", "Game is not active");
  }

  const playerColor = getPlayerColor(game, userId);

  if (game.drawOffer === null) {
    return store.updateGame(db, gameId, { drawOffer: playerColor });
  }

  if (game.drawOffer === playerColor) {
    return game;
  }

  return store.updateGame(db, gameId, {
    status: "draw",
    result: { reason: "draw" },
    drawOffer: null,
  });
}

export function abortGame(db: DrizzleDb, gameId: number, userId: number): GameState {
  const game = store.getGame(db, gameId);
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

  return store.updateGame(db, gameId, { status: "aborted", drawOffer: null });
}

export function getGame(db: DrizzleDb, gameId: number): GameState {
  const game = store.getGame(db, gameId);
  if (!game) {
    throw new GameError("GAME_NOT_FOUND", "Game not found");
  }
  return game;
}
