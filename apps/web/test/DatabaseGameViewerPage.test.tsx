import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { DatabaseGameViewerPage } from "../src/pages/DatabaseGameViewerPage.js";

const mockChessgroundSet = vi.fn();
const mockChessgroundDestroy = vi.fn();

vi.mock("chessground", () => ({
  Chessground: vi.fn(() => ({
    set: mockChessgroundSet,
    destroy: mockChessgroundDestroy,
  })),
}));

vi.mock("chess.js", () => ({
  Chess: vi.fn().mockImplementation(() => ({
    loadPgn: vi.fn(),
    history: vi.fn(() => ["e4", "e5"]),
    fen: vi
      .fn()
      .mockReturnValueOnce("start-fen")
      .mockReturnValueOnce("fen-after-e4")
      .mockReturnValue("fen-after-e5"),
    move: vi.fn(),
  })),
}));

const socketModule = vi.hoisted(() => {
  const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: true,
    disconnect: vi.fn(),
  };
  let currentSocket: typeof mockSocket | null = null;

  return {
    mockSocket,
    connectSocket: vi.fn(() => {
      currentSocket = mockSocket;
      return mockSocket;
    }),
    getSocket: vi.fn(() => currentSocket),
    reset: () => {
      currentSocket = null;
    },
  };
});

vi.mock("../src/socket.js", () => ({
  connectSocket: socketModule.connectSocket,
  disconnectSocket: vi.fn(),
  getSocket: socketModule.getSocket,
}));

function createTestStore() {
  return configureStore({
    reducer: {
      [apiSlice.reducerPath]: apiSlice.reducer,
      game: gameReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(apiSlice.middleware, socketMiddleware),
  });
}

function mockFetchSuccess(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function getSocketHandler(event: string) {
  const call = socketModule.mockSocket.on.mock.calls.find(
    (registeredEvent: unknown[]) => registeredEvent[0] === event,
  );
  return call?.[1] as ((data: unknown) => void) | undefined;
}

describe("DatabaseGameViewerPage", () => {
  beforeEach(() => {
    socketModule.reset();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    socketModule.mockSocket.on.mockClear();
    socketModule.mockSocket.off.mockClear();
    socketModule.mockSocket.emit.mockClear();
    socketModule.mockSocket.disconnect.mockClear();
    mockChessgroundSet.mockClear();
    mockChessgroundDestroy.mockClear();
    socketModule.connectSocket.mockClear();
    socketModule.getSocket.mockClear();
    socketModule.reset();
  });

  it("attaches PGN analysis listeners when analysis starts after the socket is created on demand", async () => {
    mockFetchSuccess({
      id: 42,
      white: "White",
      black: "Black",
      whiteElo: 2100,
      blackElo: 2050,
      result: "1-0",
      date: "2025.01.01",
      timeControl: "600+0",
      termination: "Normal",
      opening: "King's Pawn Game",
      eco: "C20",
      lichessUrl: "https://lichess.org/example",
      pgn: "1. e4 e5",
    });
    mockFetchSuccess({ user: { id: 1, email: "viewer@test.com", username: "viewer" } });

    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/database/games/42/view"]}>
          <Routes>
            <Route path="/database/games/:id/view" element={<DatabaseGameViewerPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("analyze-pgn-button")).toBeInTheDocument();
    });

    expect(socketModule.mockSocket.on).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("analyze-pgn-button"));

    await waitFor(() => {
      expect(socketModule.connectSocket).toHaveBeenCalledOnce();
      expect(socketModule.mockSocket.emit).toHaveBeenCalledWith("analyzePgn", {
        pgn: "1. e4 e5",
        requestId: "pgn-42-1700000000000",
      });
    });

    expect(getSocketHandler("pgnAnalysisProgress")).toBeDefined();
    expect(getSocketHandler("pgnAnalysisComplete")).toBeDefined();
    expect(getSocketHandler("pgnAnalysisError")).toBeDefined();

    getSocketHandler("pgnAnalysisComplete")!({
      requestId: "pgn-42-1700000000000",
      positions: [
        {
          fen: "start-fen",
          evaluation: {
            score: { type: "cp", value: 20 },
            bestLine: ["e4"],
            depth: 20,
            engineLines: [],
          },
          classification: null,
          centipawnLoss: null,
        },
      ],
      whiteAccuracy: 91.4,
      blackAccuracy: 84.2,
      completedPositions: 1,
      totalPositions: 1,
    });

    await waitFor(() => {
      expect(screen.getByTestId("pgn-accuracy-display")).toHaveTextContent(
        "White: 91.4% Black: 84.2%",
      );
    });
  });
});
