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

describe("JoinPage edge cases", () => {
  it("shows 'already in progress' for active game", async () => {
    mockFetchSuccess({ gameId: 5, status: "active" });
    mockFetchError({ error: "Unauthorized" }, 401);
    renderJoinPage("active-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-already-started")).toBeInTheDocument();
    });
    expect(screen.getByText("This game is already in progress.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Game" })).toHaveAttribute("href", "/game/5");
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/");
  });

  it("redirects player to game when active invite belongs to authenticated participant", async () => {
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

  it("shows 'already ended' for checkmate game", async () => {
    mockFetchSuccess({ gameId: 7, status: "checkmate" });
    renderJoinPage("checkmate-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-ended")).toBeInTheDocument();
    });
    expect(screen.getByText("This game has already ended.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Game" })).toHaveAttribute("href", "/game/7");
  });

  it("shows 'already ended' for resigned game", async () => {
    mockFetchSuccess({ gameId: 8, status: "resigned" });
    renderJoinPage("resigned-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-ended")).toBeInTheDocument();
    });
    expect(screen.getByText("This game has already ended.")).toBeInTheDocument();
  });

  it("shows 'already ended' for draw game", async () => {
    mockFetchSuccess({ gameId: 9, status: "draw" });
    renderJoinPage("draw-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-ended")).toBeInTheDocument();
    });
  });

  it("shows 'already ended' for timeout game", async () => {
    mockFetchSuccess({ gameId: 10, status: "timeout" });
    renderJoinPage("timeout-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-ended")).toBeInTheDocument();
    });
  });

  it("shows 'already ended' for stalemate game", async () => {
    mockFetchSuccess({ gameId: 11, status: "stalemate" });
    renderJoinPage("stalemate-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-ended")).toBeInTheDocument();
    });
  });

  it("shows 'already ended' for aborted game", async () => {
    mockFetchSuccess({ gameId: 12, status: "aborted" });
    renderJoinPage("aborted-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-ended")).toBeInTheDocument();
    });
  });

  it("shows own game message with copy link when joining own game", async () => {
    mockFetchSuccess({ gameId: 3, status: "waiting" }); // resolve
    mockFetchError({ error: "Cannot join your own game" }, 400); // join
    renderJoinPage("own-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-own-game")).toBeInTheDocument();
    });
    expect(
      screen.getByText("You created this game — share the link with your opponent."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("invite-url")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Game" })).toHaveAttribute("href", "/game/3");
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/");
  });

  it("shows generic error for non-own-game join failure", async () => {
    mockFetchSuccess({ gameId: 3, status: "waiting" }); // resolve
    mockFetchError({ error: "Server error" }, 500); // join
    renderJoinPage("error-token");
    await waitFor(() => {
      expect(screen.getByTestId("join-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("join-error")).toHaveTextContent("Server error");
  });
});
