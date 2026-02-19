import { createAction, type Middleware, type Dispatch, type UnknownAction } from "@reduxjs/toolkit";
import { connectSocket, disconnectSocket, getSocket, type TypedSocket } from "../socket.js";
import {
  setGameState,
  applyMove,
  clearOptimisticMove,
  setGameOver,
  setOpponentConnected,
  setDrawOffer,
  clearDrawOffer,
  updateClock,
  setError,
  rollbackMove,
  setConnectionStatus,
  setOptimisticMove,
  type GameSliceState,
} from "./gameSlice.js";

interface MiddlewareState {
  game: GameSliceState;
}

export const socketActions = {
  connect: createAction("socket/connect"),
  disconnect: createAction("socket/disconnect"),
  joinRoom: createAction<{ gameId: number }>("socket/joinRoom"),
  leaveRoom: createAction<{ gameId: number }>("socket/leaveRoom"),
  sendMove: createAction<{ gameId: number; from: string; to: string; promotion?: string }>(
    "socket/sendMove",
  ),
  resign: createAction<{ gameId: number }>("socket/resign"),
  offerDraw: createAction<{ gameId: number }>("socket/offerDraw"),
  acceptDraw: createAction<{ gameId: number }>("socket/acceptDraw"),
  abort: createAction<{ gameId: number }>("socket/abort"),
};

const initializedSockets = new WeakSet<TypedSocket>();

function setupSocketListeners(
  socket: TypedSocket,
  dispatch: Dispatch<UnknownAction>,
  getState: () => MiddlewareState,
): void {
  socket.on("gameState", (data) => {
    dispatch(setGameState(data));
  });

  socket.on("moveMade", (data) => {
    dispatch(applyMove(data));
    dispatch(clearOptimisticMove());
  });

  socket.on("gameOver", (data) => {
    dispatch(setGameOver(data));
  });

  socket.on("opponentJoined", (_data) => {
    dispatch(setOpponentConnected(true));
  });

  socket.on("opponentDisconnected", () => {
    dispatch(setOpponentConnected(false));
  });

  socket.on("opponentReconnected", () => {
    dispatch(setOpponentConnected(true));
  });

  socket.on("drawOffered", (data) => {
    dispatch(setDrawOffer(data.by));
  });

  socket.on("drawDeclined", () => {
    dispatch(clearDrawOffer());
  });

  socket.on("clockUpdate", (data) => {
    dispatch(updateClock(data));
  });

  socket.on("error", (data) => {
    dispatch(setError(data.message));
    const state = getState();
    if (state.game.pendingMove && state.game.currentGame) {
      dispatch(rollbackMove(state.game.currentGame.fen));
    }
  });

  socket.on("connect", () => {
    dispatch(setConnectionStatus("connected"));
  });

  socket.on("disconnect", () => {
    dispatch(setConnectionStatus("disconnected"));
  });
}

export const socketMiddleware: Middleware<object, MiddlewareState> = (storeApi) => {
  return (next) => (action) => {
    if (socketActions.connect.match(action)) {
      const socket = connectSocket();
      if (!initializedSockets.has(socket)) {
        setupSocketListeners(socket, storeApi.dispatch, storeApi.getState);
        initializedSockets.add(socket);
      }
      if (socket.connected) {
        storeApi.dispatch(setConnectionStatus("connected"));
      } else {
        storeApi.dispatch(setConnectionStatus("connecting"));
      }
      return next(action);
    }

    if (socketActions.disconnect.match(action)) {
      const socket = getSocket();
      if (socket) {
        initializedSockets.delete(socket);
      }
      disconnectSocket();
      storeApi.dispatch(setConnectionStatus("disconnected"));
      return next(action);
    }

    if (socketActions.joinRoom.match(action)) {
      const socket = getSocket();
      if (socket) {
        socket.emit("joinRoom", action.payload);
      }
      return next(action);
    }

    if (socketActions.leaveRoom.match(action)) {
      const socket = getSocket();
      if (socket) {
        socket.emit("leaveRoom", action.payload);
      }
      return next(action);
    }

    if (socketActions.sendMove.match(action)) {
      const socket = getSocket();
      if (socket) {
        const { from, to, promotion } = action.payload;
        storeApi.dispatch(setOptimisticMove({ from, to, promotion }));
        socket.emit("move", action.payload);
      }
      return next(action);
    }

    if (socketActions.resign.match(action)) {
      const socket = getSocket();
      if (socket) {
        socket.emit("resign", action.payload);
      }
      return next(action);
    }

    if (socketActions.offerDraw.match(action)) {
      const socket = getSocket();
      if (socket) {
        socket.emit("offerDraw", action.payload);
      }
      return next(action);
    }

    if (socketActions.acceptDraw.match(action)) {
      const socket = getSocket();
      if (socket) {
        socket.emit("acceptDraw", action.payload);
      }
      return next(action);
    }

    if (socketActions.abort.match(action)) {
      const socket = getSocket();
      if (socket) {
        socket.emit("abort", action.payload);
      }
      return next(action);
    }

    return next(action);
  };
};
