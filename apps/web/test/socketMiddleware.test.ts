import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { socketMiddleware, socketActions } from "../src/store/socketMiddleware.js";
import { gameReducer } from "../src/store/gameSlice.js";
import type { GameState, ClockState, ClockConfig } from "@chess/shared";

const mockOn = vi.fn();
const mockEmit = vi.fn();
const mockDisconnect = vi.fn();

let mockSocket: {
  on: typeof mockOn;
  emit: typeof mockEmit;
  disconnect: typeof mockDisconnect;
  connected: boolean;
};

vi.mock("../src/socket.js", () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => mockSocket),
}));

import { connectSocket, disconnectSocket } from "../src/socket.js";

function createTestStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socketMiddleware),
  });
}

function getEventCallback(eventName: string): ((...args: unknown[]) => void) | undefined {
  const call = mockOn.mock.calls.find(([name]) => name === eventName);
  return call ? call[1] : undefined;
}

function makeFakeGameState(): GameState & { clock: ClockState } {
  return {
    id: 1,
    inviteToken: "abc123",
    status: "active",
    players: {
      white: { userId: 1, color: "white" },
      black: { userId: 2, color: "black" },
    },
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: "",
    moves: [],
    currentTurn: "white",
    clock: {
      initialTime: 600,
      increment: 0,
      white: 600000,
      black: 600000,
      activeColor: "white",
      lastUpdate: 1700000000000,
    } as ClockConfig & ClockState,
    drawOffer: null,
    createdAt: 1700000000,
  };
}

describe("socketMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = {
      on: mockOn,
      emit: mockEmit,
      disconnect: mockDisconnect,
      connected: true,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("socket/connect", () => {
    it("calls connectSocket and sets connection status to connecting when socket is not yet connected", () => {
      const store = createTestStore();
      mockSocket.connected = false;
      store.dispatch(socketActions.connect());
      expect(connectSocket).toHaveBeenCalledOnce();
      expect(store.getState().game.connectionStatus).toBe("connecting");
    });

    it("sets connection status to connected immediately when socket is already connected", () => {
      const store = createTestStore();
      mockSocket.connected = true;
      store.dispatch(socketActions.connect());
      expect(store.getState().game.connectionStatus).toBe("connected");
    });

    it("registers all server event listeners on the socket", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const registeredEvents = mockOn.mock.calls.map(([name]) => name);
      expect(registeredEvents).toContain("gameState");
      expect(registeredEvents).toContain("moveMade");
      expect(registeredEvents).toContain("gameOver");
      expect(registeredEvents).toContain("opponentJoined");
      expect(registeredEvents).toContain("opponentDisconnected");
      expect(registeredEvents).toContain("opponentReconnected");
      expect(registeredEvents).toContain("drawOffered");
      expect(registeredEvents).toContain("drawDeclined");
      expect(registeredEvents).toContain("clockUpdate");
      expect(registeredEvents).toContain("error");
      expect(registeredEvents).toContain("connect");
      expect(registeredEvents).toContain("disconnect");
    });

    it("sets connectionStatus to connected when socket fires connect event", () => {
      const store = createTestStore();
      mockSocket.connected = false;
      store.dispatch(socketActions.connect());
      const connectCallback = getEventCallback("connect");
      connectCallback!();
      expect(store.getState().game.connectionStatus).toBe("connected");
    });

    it("does not re-register listeners or reset status on repeated socket/connect", () => {
      const store = createTestStore();
      mockSocket.connected = false;
      store.dispatch(socketActions.connect());
      const connectCallback = getEventCallback("connect");
      connectCallback!();
      expect(store.getState().game.connectionStatus).toBe("connected");

      mockOn.mockClear();
      mockSocket.connected = true;
      store.dispatch(socketActions.connect());

      expect(store.getState().game.connectionStatus).toBe("connected");
      expect(mockOn).not.toHaveBeenCalled();
    });
  });

  describe("socket/disconnect", () => {
    it("calls disconnectSocket and sets connection status to disconnected", () => {
      const store = createTestStore();
      store.dispatch(socketActions.disconnect());
      expect(disconnectSocket).toHaveBeenCalledOnce();
      expect(store.getState().game.connectionStatus).toBe("disconnected");
    });
  });

  describe("client -> server event emission", () => {
    it("socket/joinRoom emits joinRoom event", () => {
      const store = createTestStore();
      store.dispatch(socketActions.joinRoom({ gameId: 42 }));
      expect(mockEmit).toHaveBeenCalledWith("joinRoom", { gameId: 42 });
    });

    it("socket/leaveRoom emits leaveRoom event", () => {
      const store = createTestStore();
      store.dispatch(socketActions.leaveRoom({ gameId: 42 }));
      expect(mockEmit).toHaveBeenCalledWith("leaveRoom", { gameId: 42 });
    });

    it("socket/sendMove emits move event and sets optimistic move", () => {
      const store = createTestStore();
      store.dispatch(socketActions.sendMove({ gameId: 1, from: "e2", to: "e4" }));
      expect(mockEmit).toHaveBeenCalledWith("move", { gameId: 1, from: "e2", to: "e4" });
      expect(store.getState().game.pendingMove).toEqual({ from: "e2", to: "e4" });
    });

    it("socket/sendMove includes promotion when provided", () => {
      const store = createTestStore();
      store.dispatch(socketActions.sendMove({ gameId: 1, from: "e7", to: "e8", promotion: "q" }));
      expect(mockEmit).toHaveBeenCalledWith("move", {
        gameId: 1,
        from: "e7",
        to: "e8",
        promotion: "q",
      });
      expect(store.getState().game.pendingMove).toEqual({
        from: "e7",
        to: "e8",
        promotion: "q",
      });
    });

    it("socket/resign emits resign event", () => {
      const store = createTestStore();
      store.dispatch(socketActions.resign({ gameId: 1 }));
      expect(mockEmit).toHaveBeenCalledWith("resign", { gameId: 1 });
    });

    it("socket/offerDraw emits offerDraw event", () => {
      const store = createTestStore();
      store.dispatch(socketActions.offerDraw({ gameId: 1 }));
      expect(mockEmit).toHaveBeenCalledWith("offerDraw", { gameId: 1 });
    });

    it("socket/acceptDraw emits acceptDraw event", () => {
      const store = createTestStore();
      store.dispatch(socketActions.acceptDraw({ gameId: 1 }));
      expect(mockEmit).toHaveBeenCalledWith("acceptDraw", { gameId: 1 });
    });

    it("socket/abort emits abort event", () => {
      const store = createTestStore();
      store.dispatch(socketActions.abort({ gameId: 1 }));
      expect(mockEmit).toHaveBeenCalledWith("abort", { gameId: 1 });
    });
  });

  describe("server event -> Redux action dispatch", () => {
    it("gameState event sets currentGame", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const callback = getEventCallback("gameState");
      callback!(makeFakeGameState());
      const state = store.getState().game;
      expect(state.currentGame).not.toBeNull();
      expect(state.currentGame!.id).toBe(1);
      expect(state.currentGame!.fen).toBe(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      );
      expect(state.currentGame!.clockState).toEqual({
        white: 600000,
        black: 600000,
        activeColor: "white",
        lastUpdate: 1700000000000,
      });
    });

    it("moveMade event updates game state and clears optimistic move", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const gameCallback = getEventCallback("gameState");
      gameCallback!(makeFakeGameState());
      store.dispatch(socketActions.sendMove({ gameId: 1, from: "e2", to: "e4" }));
      expect(store.getState().game.pendingMove).not.toBeNull();

      const moveCallback = getEventCallback("moveMade");
      moveCallback!({
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        san: "e4",
        pgn: "1. e4",
        status: "active",
        clock: {
          white: 599000,
          black: 600000,
          activeColor: "black",
          lastUpdate: 1700000001000,
        },
      });

      const state = store.getState().game;
      expect(state.currentGame!.fen).toBe(
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      );
      expect(state.currentGame!.moves).toEqual(["e4"]);
      expect(state.pendingMove).toBeNull();
    });

    it("gameOver event updates game status and result", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const gameCallback = getEventCallback("gameState");
      gameCallback!(makeFakeGameState());

      const gameOverCallback = getEventCallback("gameOver");
      gameOverCallback!({
        status: "checkmate",
        result: { winner: "white", reason: "checkmate" },
        clock: { white: 500000, black: 0, activeColor: null, lastUpdate: 1700000010000 },
      });

      const state = store.getState().game;
      expect(state.currentGame!.status).toBe("checkmate");
      expect(state.currentGame!.result).toEqual({ winner: "white", reason: "checkmate" });
    });

    it("opponentDisconnected sets opponentConnected to false", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const callback = getEventCallback("opponentDisconnected");
      callback!();
      expect(store.getState().game.opponentConnected).toBe(false);
    });

    it("opponentReconnected sets opponentConnected to true", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const disconnectCallback = getEventCallback("opponentDisconnected");
      disconnectCallback!();
      expect(store.getState().game.opponentConnected).toBe(false);
      const reconnectCallback = getEventCallback("opponentReconnected");
      reconnectCallback!();
      expect(store.getState().game.opponentConnected).toBe(true);
    });

    it("drawOffered sets drawOffer", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const callback = getEventCallback("drawOffered");
      callback!({ by: "black" });
      expect(store.getState().game.drawOffer).toBe("black");
    });

    it("drawDeclined clears drawOffer", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const offerCallback = getEventCallback("drawOffered");
      offerCallback!({ by: "white" });
      expect(store.getState().game.drawOffer).toBe("white");
      const declineCallback = getEventCallback("drawDeclined");
      declineCallback!();
      expect(store.getState().game.drawOffer).toBeNull();
    });

    it("clockUpdate updates clock state on current game", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const gameCallback = getEventCallback("gameState");
      gameCallback!(makeFakeGameState());

      const clockCallback = getEventCallback("clockUpdate");
      const newClock = {
        white: 550000,
        black: 600000,
        activeColor: "white" as const,
        lastUpdate: 1700000005000,
      };
      clockCallback!(newClock);
      expect(store.getState().game.currentGame!.clockState).toEqual(newClock);
    });

    it("error event sets error message and clears pending move without mutating confirmed history", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const gameCallback = getEventCallback("gameState");
      gameCallback!(makeFakeGameState());

      const moveCallback = getEventCallback("moveMade");
      moveCallback!({
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        san: "e4",
        pgn: "1. e4",
        status: "active",
        clock: {
          white: 599000,
          black: 600000,
          activeColor: "black",
          lastUpdate: 1700000001000,
        },
      });

      store.dispatch(socketActions.sendMove({ gameId: 1, from: "e2", to: "e4" }));
      expect(store.getState().game.pendingMove).not.toBeNull();

      const errorCallback = getEventCallback("error");
      errorCallback!({ message: "Illegal move" });

      expect(store.getState().game.currentGame!.moves).toEqual(["e4"]);
      expect(store.getState().game.currentGame!.currentTurn).toBe("black");
      expect(store.getState().game.pendingMove).toBeNull();
      expect(store.getState().game.error).toBe("Illegal move");
    });

    it("disconnect event sets connectionStatus to disconnected", () => {
      const store = createTestStore();
      store.dispatch(socketActions.connect());
      const connectCb = getEventCallback("connect");
      connectCb!();
      expect(store.getState().game.connectionStatus).toBe("connected");

      const disconnectCb = getEventCallback("disconnect");
      disconnectCb!();
      expect(store.getState().game.connectionStatus).toBe("disconnected");
    });
  });
});
