import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer, setError, setGameState } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { DashboardPage } from "../src/pages/DashboardPage.js";
import { CreateGameForm } from "../src/components/CreateGameForm.js";
import { InviteLink } from "../src/components/InviteLink.js";
import { GameList } from "../src/components/GameList.js";
import type { ClockConfig, ClockState, GameState } from "@chess/shared";

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
  vi.useRealTimers();
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

function makeWaitingGameState(gameId: number): GameState & { clock: ClockState } {
  return {
    id: gameId,
    inviteToken: "tok-123",
    status: "waiting",
    players: {
      white: { userId: 1, color: "white" },
    },
    fen: "startpos",
    pgn: "",
    moves: [],
    currentTurn: "white",
    clock: {
      initialTime: 600,
      increment: 0,
      white: 600000,
      black: 600000,
      activeColor: "white",
      lastUpdate: Date.now(),
    } as ClockConfig & ClockState,
    drawOffer: null,
    createdAt: 1700000000,
  };
}

describe("CreateGameForm", () => {
  it("renders preset buttons and create button", () => {
    renderWithProviders(<CreateGameForm onGameCreated={vi.fn()} />);

    expect(screen.getByText("Bullet 1+0")).toBeInTheDocument();
    expect(screen.getByText("Blitz 3+2")).toBeInTheDocument();
    expect(screen.getByText("Rapid 10+0")).toBeInTheDocument();
    expect(screen.getByText("Classical 30+0")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getByTestId("create-game-submit")).toHaveTextContent("Create Game");
  });

  it("shows custom inputs when Custom is selected", () => {
    renderWithProviders(<CreateGameForm onGameCreated={vi.fn()} />);

    fireEvent.click(screen.getByText("Custom"));

    expect(screen.getByLabelText("Minutes")).toBeInTheDocument();
    expect(screen.getByLabelText("Increment (sec)")).toBeInTheDocument();
  });

  it("hides custom inputs when a preset is selected", () => {
    renderWithProviders(<CreateGameForm onGameCreated={vi.fn()} />);

    fireEvent.click(screen.getByText("Custom"));
    fireEvent.click(screen.getByText("Blitz 3+2"));

    expect(screen.queryByLabelText("Minutes")).not.toBeInTheDocument();
  });

  it("calls onGameCreated with game data on successful creation", async () => {
    mockFetchSuccess({ gameId: 1, inviteToken: "abc-123", color: "white" }, 201);
    const onGameCreated = vi.fn();

    renderWithProviders(<CreateGameForm onGameCreated={onGameCreated} />);

    fireEvent.click(screen.getByTestId("create-game-submit"));

    await waitFor(() => {
      expect(onGameCreated).toHaveBeenCalledWith(1, "abc-123", "white");
    });
  });

  it("disables submit while creating", async () => {
    mockFetchPending();

    renderWithProviders(<CreateGameForm onGameCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId("create-game-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("create-game-submit")).toBeDisabled();
      expect(screen.getByTestId("create-game-submit")).toHaveTextContent("Creating…");
    });
  });

  it("shows error message on creation failure", async () => {
    mockFetchError({ error: "Server error" }, 500);

    renderWithProviders(<CreateGameForm onGameCreated={vi.fn()} />);

    fireEvent.click(screen.getByTestId("create-game-submit"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Server error");
    });
  });
});

describe("InviteLink", () => {
  it("displays invite URL", () => {
    renderWithProviders(<InviteLink inviteToken="test-token-123" />);

    expect((screen.getByTestId("invite-url") as HTMLInputElement).value).toContain(
      "/join/test-token-123",
    );
  });

  it("copy button changes text after click", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderWithProviders(<InviteLink inviteToken="test-token-123" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-link-button"));
    });
    expect(screen.getByTestId("copy-link-button")).toHaveTextContent("Copied!");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("copy-link-button")).toHaveTextContent("Copy Link");
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});

describe("GameList", () => {
  it("shows loading state", () => {
    mockFetchPending();
    mockFetchPending();

    renderWithProviders(<GameList />);

    expect(screen.getByTestId("game-list-loading")).toHaveTextContent("Loading games...");
  });

  it("shows empty state when no games", async () => {
    mockFetchSuccess([]);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });

    renderWithProviders(<GameList />);

    await waitFor(() => {
      expect(screen.getByText("No games yet")).toBeInTheDocument();
    });
  });

  it("renders game rows with correct data", async () => {
    mockFetchSuccess([
      {
        id: 10,
        status: "active",
        players: {
          white: { userId: 1, color: "white" },
          black: { userId: 2, color: "black" },
        },
        clock: { initialTime: 600, increment: 0 },
        createdAt: 1700000000,
      },
    ]);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });

    renderWithProviders(<GameList />);

    await waitFor(() => {
      expect(screen.getByTestId("game-row-10")).toBeInTheDocument();
    });

    expect(screen.getByText("User #2")).toBeInTheDocument();
    expect(screen.getByText("10+0")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    mockFetchError({ error: "Failed" }, 500);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });

    renderWithProviders(<GameList />);

    await waitFor(() => {
      expect(screen.getByTestId("game-list-error")).toBeInTheDocument();
    });
  });
});

describe("DashboardPage", () => {
  it("renders create game form and game list", async () => {
    mockFetchSuccess([]);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("create-game-form")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Your Games")).toBeInTheDocument();
    });
    expect(screen.getByText("Chess Platform")).toBeInTheDocument();
  });

  it("switches to waiting screen after game creation", async () => {
    mockFetchSuccess([]);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess({ gameId: 5, inviteToken: "tok-123", color: "white" }, 201);
    mockFetchSuccess([]);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("create-game-form")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("create-game-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("waiting-screen")).toBeInTheDocument();
    });
    expect(screen.getByText(/You are playing as/i)).toHaveTextContent("white");
    expect((screen.getByTestId("invite-url") as HTMLInputElement).value).toContain("/join/tok-123");
  });

  it("cancel waits for abort result before returning to form", async () => {
    mockFetchSuccess([]);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess({ gameId: 5, inviteToken: "tok-123", color: "white" }, 201);
    mockFetchSuccess([]);

    const { store } = renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("create-game-form")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("create-game-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("waiting-screen")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("cancel-game-button"));

    expect(screen.getByTestId("waiting-screen")).toBeInTheDocument();
    expect(screen.queryByTestId("create-game-form")).not.toBeInTheDocument();

    act(() => {
      store.dispatch(
        setGameState({
          ...makeWaitingGameState(5),
          status: "aborted",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("create-game-form")).toBeInTheDocument();
    });
  });

  it("cancel recover path keeps waiting screen mounted when abort fails", async () => {
    mockFetchSuccess([]);
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchSuccess({ gameId: 5, inviteToken: "tok-123", color: "white" }, 201);
    mockFetchSuccess([]);

    const { store } = renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId("create-game-form")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("create-game-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("waiting-screen")).toBeInTheDocument();
    });

    act(() => {
      store.dispatch(setGameState(makeWaitingGameState(5)));
    });

    fireEvent.click(screen.getByTestId("cancel-game-button"));
    act(() => {
      store.dispatch(setError("Game can only be aborted while waiting"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("waiting-screen")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("create-game-form")).not.toBeInTheDocument();
    expect(mockSocket.emit).toHaveBeenCalledWith("abort", { gameId: 5 });
    expect(mockSocket.emit).toHaveBeenCalledWith("leaveRoom", { gameId: 5 });
    expect(mockSocket.emit).toHaveBeenCalledWith("joinRoom", { gameId: 5 });
  });
});
