import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { AppRoutes } from "../src/App.js";

vi.mock("chessground", () => ({
  Chessground: vi.fn(() => ({
    set: vi.fn(),
    destroy: vi.fn(),
    state: {},
    getFen: vi.fn(() => ""),
  })),
}));

vi.mock("chess.js", () => ({
  Chess: vi.fn().mockImplementation(() => ({
    moves: vi.fn(() => []),
    get: vi.fn(() => null),
  })),
}));

const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  connected: true,
  disconnect: vi.fn(),
};

vi.mock("../src/socket.js", () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => mockSocket),
}));

afterEach(() => {
  cleanup();
  mockSocket.on.mockClear();
  mockSocket.emit.mockClear();
  mockSocket.disconnect.mockClear();
  vi.restoreAllMocks();
});

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

function renderWithProviders(ui: React.ReactElement, { route = "/" } = {}) {
  const store = createTestStore();
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </Provider>,
    ),
  };
}

function mockFetchSuccess(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(body: unknown, status: number) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchPending() {
  vi.spyOn(globalThis, "fetch").mockImplementationOnce(
    () =>
      new Promise<Response>(() => {
        // Intentionally unresolved to keep request loading.
      }),
  );
}

describe("AnalysisPage", () => {
  it("shows loading state while fetching", async () => {
    // Auth succeeds, then game + myGames stay pending
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchPending();
    mockFetchPending();

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analysis-loading")).toHaveTextContent("Loading analysis...");
    });
  });

  it("shows error when game not found", async () => {
    // Auth succeeds
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    // Game fetch returns 404
    mockFetchError({ error: "Not found" }, 404);
    // myGames returns empty
    mockFetchSuccess([]);

    renderWithProviders(<AppRoutes />, { route: "/analysis/999" });

    await waitFor(() => {
      expect(screen.getByTestId("analysis-error")).toHaveTextContent("Game not found.");
    });
  });

  it("shows active game guard when user has an active game", async () => {
    // Auth succeeds
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    // Game fetch returns completed game
    mockFetchSuccess({
      id: 10,
      status: "checkmate",
      pgn: "1. e4 e5",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      moves: ["e4", "e5"],
      players: { white: { userId: 1, color: "white" }, black: { userId: 2, color: "black" } },
      currentTurn: "white",
      inviteToken: "tok",
      drawOffer: null,
      createdAt: 1700000000,
    });
    // myGames returns a game with active status
    mockFetchSuccess([
      {
        id: 5,
        status: "active",
        players: { white: { userId: 1, color: "white" }, black: { userId: 3, color: "black" } },
        clock: { initialTime: 600, increment: 0 },
        createdAt: 1700000000,
      },
    ]);

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("active-game-guard")).toBeInTheDocument();
    });
    expect(screen.getByTestId("active-game-guard")).toHaveTextContent(
      "Can't use the analysis board while playing a game.",
    );
  });

  it("shows not-completed message for active game", async () => {
    // Auth succeeds
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    // Game fetch returns an active game
    mockFetchSuccess({
      id: 10,
      status: "active",
      pgn: "1. e4",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      moves: ["e4"],
      players: { white: { userId: 1, color: "white" }, black: { userId: 2, color: "black" } },
      currentTurn: "black",
      inviteToken: "tok",
      drawOffer: null,
      createdAt: 1700000000,
    });
    // myGames returns no active games
    mockFetchSuccess([]);

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analysis-not-completed")).toHaveTextContent(
        "This game is not completed.",
      );
    });
  });

  it("renders analysis page for completed game", async () => {
    // Auth succeeds
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    // Game fetch returns completed game
    mockFetchSuccess({
      id: 10,
      status: "checkmate",
      pgn: "1. e4 e5",
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      moves: ["e4", "e5"],
      players: { white: { userId: 1, color: "white" }, black: { userId: 2, color: "black" } },
      currentTurn: "white",
      inviteToken: "tok",
      drawOffer: null,
      createdAt: 1700000000,
    });
    // myGames returns no active games
    mockFetchSuccess([]);

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analysis-page")).toBeInTheDocument();
    });
    expect(screen.getByText("Game Analysis")).toBeInTheDocument();
  });

  it("shows invalid game ID for non-numeric param", async () => {
    // Auth succeeds
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });

    renderWithProviders(<AppRoutes />, { route: "/analysis/abc" });

    await waitFor(() => {
      expect(screen.getByText("Invalid game ID")).toBeInTheDocument();
    });
  });
});
