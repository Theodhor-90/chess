import type { Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ServerSocketData,
  ClockState,
  GameState,
  PlayerColor,
  MoveResponse,
} from "@chess/shared";
import type { TypedSocketServer } from "./index.js";
import * as gameService from "../game/service.js";
import * as store from "../game/store.js";
import { GameError } from "../game/errors.js";
import { getUserSockets } from "./connections.js";
import {
  startClock,
  stopClock,
  switchClock,
  getClockState,
  getClockRemainingTimes,
} from "../game/clock.js";

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  ServerSocketData
>;

function buildClockStateForGame(game: GameState): ClockState {
  const activeClock = getClockState(game.id);
  if (activeClock) {
    return activeClock;
  }
  const initialMs = game.clock.initialTime * 1000;
  return {
    white: game.clockWhiteRemaining ?? initialMs,
    black: game.clockBlackRemaining ?? initialMs,
    activeColor: game.status === "active" ? game.currentTurn : null,
    lastUpdate: Date.now(),
  };
}

function getPlayerColor(game: GameState, userId: number): PlayerColor | null {
  if (game.players.white?.userId === userId) return "white";
  if (game.players.black?.userId === userId) return "black";
  return null;
}

function isOpponentInRoom(
  io: TypedSocketServer,
  gameId: number,
  game: GameState,
  currentUserId: number,
): boolean {
  const room = io.sockets.adapter.rooms.get(`game:${gameId}`);
  if (!room) return false;
  const opponentColor: PlayerColor =
    game.players.white?.userId === currentUserId ? "black" : "white";
  const opponentUserId = game.players[opponentColor]?.userId;
  if (opponentUserId === undefined) return false;
  const opponentSockets = getUserSockets(opponentUserId);
  if (!opponentSockets) return false;
  for (const socketId of opponentSockets) {
    if (room.has(socketId)) return true;
  }
  return false;
}

export function registerGameHandlers(io: TypedSocketServer, socket: TypedSocket): void {
  function onTick(gameId: number, clockState: ClockState): void {
    io.to(`game:${gameId}`).emit("clockUpdate", clockState);
  }

  function onTimeout(gameId: number, timedOutColor: PlayerColor, clockState: ClockState): void {
    const roomName = `game:${gameId}`;
    try {
      const game = gameService.timeoutGame(gameId, timedOutColor);
      io.to(roomName).emit("gameOver", {
        status: game.status,
        result: game.result!,
        clock: clockState,
      });
    } catch {
      // Game may have already ended via resign/draw/abort before timeout fires
    }
  }

  socket.on("joinRoom", (data) => {
    const userId = socket.data.userId;
    const { gameId } = data;

    let game: GameState;
    try {
      game = gameService.getGame(gameId);
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", { message: err.message });
        return;
      }
      throw err;
    }

    const playerColor = getPlayerColor(game, userId);
    if (!playerColor) {
      socket.emit("error", { message: "You are not a player in this game" });
      return;
    }

    const roomName = `game:${gameId}`;
    socket.join(roomName);

    // Start clock if game is active and clock not yet running
    if (game.status === "active" && !getClockState(gameId)) {
      const persisted =
        game.clockWhiteRemaining != null && game.clockBlackRemaining != null
          ? { white: game.clockWhiteRemaining, black: game.clockBlackRemaining }
          : undefined;
      startClock(gameId, game.clock, game.currentTurn, onTick, onTimeout, persisted);
    }

    const clockState = buildClockStateForGame(game);
    socket.emit("gameState", { ...game, clock: { ...game.clock, ...clockState } });

    if (game.status === "active" && isOpponentInRoom(io, gameId, game, userId)) {
      socket.to(roomName).emit("opponentReconnected", {});
    }
  });

  socket.on("leaveRoom", (data) => {
    const userId = socket.data.userId;
    const { gameId } = data;
    const roomName = `game:${gameId}`;
    const wasInRoom = socket.rooms.has(roomName);

    if (!wasInRoom) {
      return;
    }

    let game: GameState;
    try {
      game = gameService.getGame(gameId);
    } catch (err) {
      if (err instanceof GameError) {
        return;
      }
      throw err;
    }

    if (!getPlayerColor(game, userId)) {
      return;
    }

    socket.leave(roomName);

    const userSockets = getUserSockets(userId);
    const stillInRoom = io.sockets.adapter.rooms.get(roomName);
    let hasOtherSocketInRoom = false;
    if (userSockets && stillInRoom) {
      for (const sid of userSockets) {
        if (sid !== socket.id && stillInRoom.has(sid)) {
          hasOtherSocketInRoom = true;
          break;
        }
      }
    }

    if (!hasOtherSocketInRoom) {
      socket.to(roomName).emit("opponentDisconnected", {});
    }
  });

  socket.on("move", (data) => {
    const userId = socket.data.userId;
    const { gameId, from, to, promotion } = data;
    const roomName = `game:${gameId}`;

    let game: GameState;
    try {
      game = gameService.getGame(gameId);
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", { message: err.message });
        return;
      }
      throw err;
    }

    const hadDrawOffer = game.drawOffer !== null;
    const drawOfferBy = game.drawOffer;
    const playerColor = getPlayerColor(game, userId);

    let moveResult: MoveResponse;
    try {
      moveResult = gameService.makeMove(gameId, userId, { from, to, promotion });
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", { message: err.message });
        return;
      }
      throw err;
    }

    // Switch clock and get updated state
    const rtt = socket.data.rtt ?? 0;
    const clockFromSwitch = playerColor ? switchClock(gameId, playerColor, rtt) : null;
    const remainingTimes = getClockRemainingTimes(gameId);
    if (remainingTimes) {
      store.updateGame(gameId, {
        clockWhiteRemaining: remainingTimes.white,
        clockBlackRemaining: remainingTimes.black,
      });
    }

    // If game ended on this move, stop the clock
    const isTerminal =
      moveResult.status === "checkmate" ||
      moveResult.status === "stalemate" ||
      moveResult.status === "draw";
    if (isTerminal) {
      stopClock(gameId);
    }

    const updatedGame = gameService.getGame(gameId);
    const clockState = clockFromSwitch ?? buildClockStateForGame(updatedGame);

    if (hadDrawOffer && drawOfferBy !== playerColor) {
      io.to(roomName).emit("drawDeclined", {});
    }

    io.to(roomName).emit("moveMade", {
      fen: moveResult.fen,
      san: moveResult.san,
      pgn: moveResult.pgn,
      status: moveResult.status,
      ...(moveResult.result ? { result: moveResult.result } : {}),
      clock: clockState,
    });

    if (isTerminal) {
      io.to(roomName).emit("gameOver", {
        status: moveResult.status,
        result: moveResult.result!,
        clock: clockState,
      });
    }
  });

  socket.on("resign", (data) => {
    const { gameId } = data;
    const roomName = `game:${gameId}`;

    let game: GameState;
    try {
      game = gameService.resignGame(gameId, socket.data.userId);
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", { message: err.message });
        return;
      }
      throw err;
    }

    const clockState = buildClockStateForGame(game);
    stopClock(gameId);

    io.to(roomName).emit("gameOver", {
      status: game.status,
      result: game.result!,
      clock: clockState,
    });
  });

  socket.on("offerDraw", (data) => {
    const { gameId } = data;
    const roomName = `game:${gameId}`;

    let game: GameState;
    try {
      game = gameService.offerOrAcceptDraw(gameId, socket.data.userId);
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", { message: err.message });
        return;
      }
      throw err;
    }

    if (game.status === "draw") {
      const clockState = buildClockStateForGame(game);
      stopClock(gameId);
      io.to(roomName).emit("gameOver", {
        status: game.status,
        result: game.result!,
        clock: clockState,
      });
    } else if (game.drawOffer) {
      io.to(roomName).emit("drawOffered", { by: game.drawOffer });
    }
  });

  socket.on("acceptDraw", (data) => {
    const { gameId } = data;
    const roomName = `game:${gameId}`;

    let game: GameState;
    try {
      game = gameService.offerOrAcceptDraw(gameId, socket.data.userId);
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", { message: err.message });
        return;
      }
      throw err;
    }

    if (game.status === "draw") {
      const clockState = buildClockStateForGame(game);
      stopClock(gameId);
      io.to(roomName).emit("gameOver", {
        status: game.status,
        result: game.result!,
        clock: clockState,
      });
    }
  });

  socket.on("abort", (data) => {
    const { gameId } = data;
    const roomName = `game:${gameId}`;

    let game: GameState;
    try {
      game = gameService.abortGame(gameId, socket.data.userId);
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", { message: err.message });
        return;
      }
      throw err;
    }

    const clockState = buildClockStateForGame(game);
    stopClock(gameId);

    io.to(roomName).emit("gameOver", {
      status: game.status,
      result: { reason: "aborted" },
      clock: clockState,
    });
  });
}
