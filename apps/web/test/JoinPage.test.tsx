import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { JoinPage } from "../src/pages/JoinPage.js";

vi.mock("../src/socket.js", () => ({
  connectSocket: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    connected: true,
    disconnect: vi.fn(),
  })),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => null),
}));

afterEach(() => {
  cleanup();
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

function renderJoinPage(inviteToken: string) {
  const store = createTestStore();
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/join/${inviteToken}`]}>
          <Routes>
            <Route path="/join/:inviteToken" element={<JoinPage />} />
            <Route path="/game/:id" element={<div data-testid="game-page">Game Page</div>} />
            <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
          </Routes>
        </MemoryRouter>
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

describe("JoinPage", () => {
  it("shows loading state while resolving invite token", () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise<Response>(() => {}));
    renderJoinPage("test-token");
    expect(screen.getByTestId("join-loading")).toHaveTextContent("Joining game...");
  });

  it("shows error for invalid invite token", async () => {
    mockFetchError({ error: "Invalid invite token" }, 404);
    renderJoinPage("invalid-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("join-error")).toHaveTextContent("Invalid invite token");
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/");
  });

  it("shows already started message for non-waiting game", async () => {
    mockFetchSuccess({ gameId: 5, status: "active" });
    mockFetchError({ error: "Unauthorized" }, 401);
    renderJoinPage("active-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-already-started")).toBeInTheDocument();
    });
    expect(screen.getByText("This game is already in progress.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Game" })).toHaveAttribute("href", "/game/5");
  });

  it("redirects to game page when authenticated player opens active invite link", async () => {
    mockFetchSuccess({ gameId: 5, status: "active" });
    mockFetchSuccess({ user: { id: 1, email: "player@example.com" } });
    mockFetchSuccess({
      id: 5,
      inviteToken: "active-token",
      status: "active",
      players: {
        white: { userId: 1, color: "white" },
        black: { userId: 2, color: "black" },
      },
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      pgn: "",
      moves: [],
      currentTurn: "white",
      clock: { initialTime: 600, increment: 0 },
      drawOffer: null,
      createdAt: 0,
    });
    renderJoinPage("active-token");
    await waitFor(() => {
      expect(screen.getByTestId("game-page")).toBeInTheDocument();
    });
  });

  it("joins game and navigates to game page on success", async () => {
    mockFetchSuccess({ gameId: 3, status: "waiting" });
    mockFetchSuccess({
      id: 3,
      status: "active",
      players: {
        white: { userId: 1, color: "white" },
        black: { userId: 2, color: "black" },
      },
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      pgn: "",
      moves: [],
      currentTurn: "white",
      clock: { initialTime: 600, increment: 0 },
      inviteToken: "valid-token",
      drawOffer: null,
      createdAt: 0,
    });
    renderJoinPage("valid-token");
    await waitFor(() => {
      expect(screen.getByTestId("game-page")).toBeInTheDocument();
    });
  });

  it("shows own-game message when join fails with own-game error", async () => {
    mockFetchSuccess({ gameId: 3, status: "waiting" });
    mockFetchError({ error: "Cannot join your own game" }, 400);
    renderJoinPage("own-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-own-game")).toBeInTheDocument();
    });
    expect(
      screen.getByText("You created this game — share the link with your opponent."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/");
  });
});
