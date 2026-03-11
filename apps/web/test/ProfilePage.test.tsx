import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { ProfilePage } from "../src/pages/ProfilePage.js";
import { NavHeader } from "../src/components/NavHeader.js";
import type { PlayerStatsResponse } from "@chess/shared";

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

function renderWithProviders(ui: React.ReactElement, { route = "/profile/5" } = {}) {
  const store = createTestStore();
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/profile/:id" element={ui} />
            <Route path="/analysis/:gameId" element={<div data-testid="analysis-page" />} />
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

function mockFetchPending() {
  vi.spyOn(globalThis, "fetch").mockImplementationOnce(
    () =>
      new Promise<Response>(() => {
        // Intentionally unresolved to keep request loading.
      }),
  );
}

function makeStatsResponse(overrides: Partial<PlayerStatsResponse> = {}): PlayerStatsResponse {
  return {
    userId: 5,
    username: "test_user",
    totalGames: 42,
    wins: 20,
    losses: 15,
    draws: 7,
    winRate: 47.6,
    avgAccuracy: { white: 80.1, black: 76.9 },
    recentGames: [],
    ...overrides,
  };
}

describe("ProfilePage", () => {
  it("renders stats dashboard with correct values", async () => {
    mockFetchSuccess(
      makeStatsResponse({
        recentGames: [
          {
            gameId: 1,
            opponentUsername: "alice",
            opponentId: 2,
            result: "win",
            resultReason: "checkmate",
            myColor: "white",
            playedAt: 1710000000,
          },
        ],
      }),
    );

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("test_user")).toBeInTheDocument();
    });

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("47.6%")).toBeInTheDocument();
    expect(screen.getByText(/20W/)).toBeInTheDocument();
    expect(screen.getByText(/15L/)).toBeInTheDocument();
    expect(screen.getByText(/7D/)).toBeInTheDocument();
    expect(screen.getByText(/80\.1%/)).toBeInTheDocument();
    expect(screen.getByText(/76\.9%/)).toBeInTheDocument();
  });

  it("recent games table renders correct data", async () => {
    mockFetchSuccess(
      makeStatsResponse({
        recentGames: [
          {
            gameId: 10,
            opponentUsername: "alice",
            opponentId: 2,
            result: "win",
            resultReason: "checkmate",
            myColor: "white",
            playedAt: 1710000000,
          },
          {
            gameId: 11,
            opponentUsername: "bob",
            opponentId: 3,
            result: "loss",
            resultReason: "resigned",
            myColor: "black",
            playedAt: 1710100000,
          },
        ],
      }),
    );

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId("profile-game-10")).toBeInTheDocument();
    });

    expect(screen.getByTestId("profile-game-11")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("Checkmate")).toBeInTheDocument();
    expect(screen.getByText("Resigned")).toBeInTheDocument();
    expect(
      screen.getByText(new Date(1710000000 * 1000).toLocaleDateString()),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new Date(1710100000 * 1000).toLocaleDateString()),
    ).toBeInTheDocument();
  });

  it("recent game row click navigates to analysis page", async () => {
    mockFetchSuccess(
      makeStatsResponse({
        recentGames: [
          {
            gameId: 42,
            opponentUsername: "alice",
            opponentId: 2,
            result: "win",
            resultReason: "checkmate",
            myColor: "white",
            playedAt: 1710000000,
          },
        ],
      }),
    );

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId("profile-game-42")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("profile-game-42"));

    await waitFor(() => {
      expect(screen.getByTestId("analysis-page")).toBeInTheDocument();
    });
  });

  it("loading state renders while fetching", () => {
    mockFetchPending();

    renderWithProviders(<ProfilePage />);

    expect(screen.getByTestId("profile-loading")).toBeInTheDocument();
  });

  it("error state renders for 404 response", async () => {
    mockFetchError({ error: "Not found" }, 404);

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId("profile-error")).toBeInTheDocument();
    });

    expect(screen.getByTestId("profile-error")).toHaveTextContent("User not found.");
  });

  it("displays N/A when accuracy is null", async () => {
    mockFetchSuccess(
      makeStatsResponse({
        avgAccuracy: { white: null, black: null },
      }),
    );

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("test_user")).toBeInTheDocument();
    });

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("shows 'No games played yet' when recentGames is empty", async () => {
    mockFetchSuccess(makeStatsResponse({ recentGames: [] }));

    renderWithProviders(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByTestId("profile-no-games")).toBeInTheDocument();
    });

    expect(screen.getByTestId("profile-no-games")).toHaveTextContent("No games played yet.");
  });
});

describe("NavHeader profile link", () => {
  it("username links to user profile", async () => {
    mockFetchSuccess({ user: { id: 5, email: "test@test.com", username: "player_one" } });

    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="*" element={<NavHeader />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user-display-name")).toHaveTextContent("player_one");
    });

    expect(screen.getByTestId("user-display-name")).toHaveAttribute("href", "/profile/5");
  });
});
