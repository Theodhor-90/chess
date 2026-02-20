import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import {
  gameReducer,
  setGameState,
  setDrawOffer,
  setOpponentConnected,
  setConnectionStatus,
} from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { Clock } from "../src/components/Clock.js";
import { MoveList } from "../src/components/MoveList.js";
import { GameActions } from "../src/components/GameActions.js";
import { GameOverOverlay } from "../src/components/GameOverOverlay.js";
import { DisconnectBanner } from "../src/components/DisconnectBanner.js";
import { ConnectionStatus } from "../src/components/ConnectionStatus.js";
import { AppRoutes } from "../src/App.js";
import { Chessground } from "chessground";
import { Chess } from "chess.js";
import type { GameState, ClockState, ClockConfig } from "@chess/shared";

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
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(Chessground).mockImplementation(
    () =>
      ({
        set: vi.fn(),
        destroy: vi.fn(),
        state: {},
        getFen: vi.fn(() => ""),
      }) as never,
  );

  vi.mocked(Chess).mockImplementation(
    () =>
      ({
        moves: vi.fn(() => []),
        get: vi.fn(() => null),
      }) as never,
  );
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

function makeFakeGameState(): GameState & { clock: ClockState } {
  return {
    id: 42,
    inviteToken: "test-token-abc",
    status: "active",
    players: {
      white: { userId: 1, color: "white" },
      black: { userId: 2, color: "black" },
    },
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    pgn: "1. e4",
    moves: ["e4"],
    currentTurn: "black",
    clock: {
      initialTime: 600,
      increment: 0,
      white: 599000,
      black: 600000,
      activeColor: "black",
      lastUpdate: Date.now(),
    } as ClockConfig & ClockState,
    drawOffer: null,
    createdAt: 1700000000,
  };
}

function renderWithStore(
  ui: React.ReactElement,
  { route = "/", store }: { route?: string; store?: ReturnType<typeof createTestStore> } = {},
) {
  const testStore = store ?? createTestStore();
  return {
    store: testStore,
    ...render(
      <Provider store={testStore}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </Provider>,
    ),
  };
}

describe("Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("displays time in MM:SS format when >= 10 seconds", () => {
    render(<Clock timeMs={305000} isActive={false} lastUpdate={Date.now()} />);
    expect(screen.getByTestId("clock")).toHaveTextContent("5:05");
  });

  it("displays time in M:SS.t format when < 10 seconds", () => {
    render(<Clock timeMs={9300} isActive={false} lastUpdate={Date.now()} />);
    expect(screen.getByTestId("clock")).toHaveTextContent("0:09.3");
  });

  it("displays 0:00.0 when time is 0", () => {
    render(<Clock timeMs={0} isActive={false} lastUpdate={Date.now()} />);
    expect(screen.getByTestId("clock")).toHaveTextContent("0:00.0");
  });

  it("counts down when active using requestAnimationFrame", () => {
    const startTime = Date.now();
    render(<Clock timeMs={60000} isActive={true} lastUpdate={startTime} />);

    // Initially shows 1:00
    expect(screen.getByTestId("clock")).toHaveTextContent("1:00");

    // Advance time by 5 seconds
    vi.advanceTimersByTime(5000);

    // Trigger rAF manually
    act(() => {
      vi.advanceTimersByTime(16); // One rAF tick
    });

    // Should now show approximately 0:55
    expect(screen.getByTestId("clock")).toHaveTextContent("0:55");
  });

  it("shows static time when not active", () => {
    const pastUpdate = Date.now() - 5000; // 5 seconds ago
    render(<Clock timeMs={60000} isActive={false} lastUpdate={pastUpdate} />);

    // Even though lastUpdate was 5 seconds ago, inactive clock shows timeMs directly
    expect(screen.getByTestId("clock")).toHaveTextContent("1:00");
  });

  it("applies red color when time < 30 seconds", () => {
    render(<Clock timeMs={25000} isActive={false} lastUpdate={Date.now()} />);
    const clock = screen.getByTestId("clock");
    expect(clock.style.color).toBe("rgb(204, 0, 0)");
  });

  it("applies bold font when active", () => {
    render(<Clock timeMs={300000} isActive={true} lastUpdate={Date.now()} />);
    const clock = screen.getByTestId("clock");
    expect(clock.style.fontWeight).toBe("bold");
  });

  it("applies normal font when not active", () => {
    render(<Clock timeMs={300000} isActive={false} lastUpdate={Date.now()} />);
    const clock = screen.getByTestId("clock");
    expect(clock.style.fontWeight).toBe("normal");
  });
});

describe("MoveList", () => {
  it("renders empty list when no moves", () => {
    render(<MoveList moves={[]} />);
    const list = screen.getByTestId("move-list");
    expect(list).toBeInTheDocument();
    expect(list.querySelectorAll("tr")).toHaveLength(0);
  });

  it("renders single white move", () => {
    render(<MoveList moves={["e4"]} />);
    const rows = screen.getByTestId("move-list").querySelectorAll("tr");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("1.");
    expect(rows[0]).toHaveTextContent("e4");
  });

  it("renders a complete move pair", () => {
    render(<MoveList moves={["e4", "e5"]} />);
    const rows = screen.getByTestId("move-list").querySelectorAll("tr");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("1.");
    expect(rows[0]).toHaveTextContent("e4");
    expect(rows[0]).toHaveTextContent("e5");
  });

  it("renders multiple move pairs", () => {
    render(<MoveList moves={["e4", "e5", "Nf3", "Nc6", "Bb5"]} />);
    const rows = screen.getByTestId("move-list").querySelectorAll("tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("1.");
    expect(rows[0]).toHaveTextContent("e4");
    expect(rows[0]).toHaveTextContent("e5");
    expect(rows[1]).toHaveTextContent("2.");
    expect(rows[1]).toHaveTextContent("Nf3");
    expect(rows[1]).toHaveTextContent("Nc6");
    expect(rows[2]).toHaveTextContent("3.");
    expect(rows[2]).toHaveTextContent("Bb5");
  });
});

describe("GamePage", () => {
  it("shows loading state when no game is loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithStore(<AppRoutes />, { route: "/game/42" });
    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("Loading game...");
    });
  });

  it("renders game board and clocks when game is loaded", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    await waitFor(() => {
      expect(screen.getByTestId("game-board")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("clock")).toHaveLength(2);
    expect(screen.getByTestId("move-list")).toBeInTheDocument();
  });

  it("updates board orientation when player color resolves after mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 2, email: "b@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    const chessgroundMock = vi.mocked(Chessground);

    await waitFor(() => {
      const boardApi = chessgroundMock.mock.results[0]?.value;
      const setCalls = vi.mocked(boardApi.set).mock.calls as Array<[unknown]>;
      expect(
        setCalls.some((call) => (call[0] as { orientation?: string }).orientation === "black"),
      ).toBeTruthy();
    });
  });

  it("displays game status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    await waitFor(() => {
      expect(screen.getByText(/active/)).toBeInTheDocument();
    });
  });

  it("displays move list with correct moves", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    const moveList = await waitFor(() => screen.getByTestId("move-list"));
    expect(moveList).toHaveTextContent("e4");
  });

  it("shows error message from Redux state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch({ type: "game/setError", payload: "Illegal move" });

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Illegal move");
    });
  });

  it("shows invalid game ID message for non-numeric ID", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithStore(<AppRoutes />, { route: "/game/abc" });

    await waitFor(() => {
      expect(screen.getByText("Invalid game ID")).toBeInTheDocument();
    });
  });

  it("dispatches clearGame on unmount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    const { unmount } = renderWithStore(<AppRoutes />, { route: "/game/42", store });
    await waitFor(() => {
      expect(screen.getByTestId("game-board")).toBeInTheDocument();
    });
    expect(store.getState().game.currentGame).not.toBeNull();
    unmount();
    expect(store.getState().game.currentGame).toBeNull();
  });
});

describe("App routing includes /game/:id", () => {
  it("renders GamePage at /game/42", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithStore(<AppRoutes />, { route: "/game/42" });

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toBeInTheDocument();
    });
  });
});

describe("GameActions", () => {
  it("renders resign and draw buttons when game is active", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    expect(screen.getByTestId("resign-button")).toBeInTheDocument();
    expect(screen.getByTestId("draw-button")).toHaveTextContent("Offer Draw");
  });

  it("renders nothing when playerColor is null", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    const { container } = renderWithStore(<GameActions gameId={42} playerColor={null} />, {
      store,
    });

    expect(container.innerHTML).toBe("");
  });

  it("shows resign confirmation on resign button click", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("resign-button"));

    expect(screen.getByTestId("resign-confirm")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to resign?")).toBeInTheDocument();
    expect(screen.getByTestId("resign-confirm-yes")).toBeInTheDocument();
    expect(screen.getByTestId("resign-confirm-no")).toBeInTheDocument();
  });

  it("dispatches resign on confirmation", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("resign-button"));
    fireEvent.click(screen.getByTestId("resign-confirm-yes"));

    expect(mockSocket.emit).toHaveBeenCalledWith("resign", { gameId: 42 });
  });

  it("cancels resign confirmation", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("resign-button"));
    expect(screen.getByTestId("resign-confirm")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("resign-confirm-no"));
    expect(screen.queryByTestId("resign-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("resign-button")).toBeInTheDocument();
  });

  it("shows 'Offer Draw' when no draw offer exists", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    const drawButton = screen.getByTestId("draw-button");
    expect(drawButton).toHaveTextContent("Offer Draw");
    expect(drawButton).not.toBeDisabled();
  });

  it("shows 'Draw Offered' (disabled) when player already offered", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setDrawOffer("white"));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    const drawButton = screen.getByTestId("draw-button");
    expect(drawButton).toHaveTextContent("Draw Offered");
    expect(drawButton).toBeDisabled();
  });

  it("shows 'Accept Draw' when opponent offered", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setDrawOffer("black"));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    const drawButton = screen.getByTestId("draw-button");
    expect(drawButton).toHaveTextContent("Accept Draw");
    expect(drawButton).not.toBeDisabled();
  });

  it("dispatches offerDraw on 'Offer Draw' click", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("draw-button"));

    expect(mockSocket.emit).toHaveBeenCalledWith("offerDraw", { gameId: 42 });
  });

  it("dispatches acceptDraw on 'Accept Draw' click", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setDrawOffer("black"));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("draw-button"));

    expect(mockSocket.emit).toHaveBeenCalledWith("acceptDraw", { gameId: 42 });
  });

  it("shows abort button when game is waiting and user is creator", () => {
    const store = createTestStore();
    const waitingGame = { ...makeFakeGameState(), status: "waiting" as const };
    store.dispatch(setGameState(waitingGame));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    expect(screen.getByTestId("abort-button")).toBeInTheDocument();
    expect(screen.getByTestId("abort-button")).toHaveTextContent("Abort Game");
  });

  it("does not show abort button when user is not creator", () => {
    const store = createTestStore();
    const waitingGame = { ...makeFakeGameState(), status: "waiting" as const };
    store.dispatch(setGameState(waitingGame));

    renderWithStore(<GameActions gameId={42} playerColor="black" />, { store });

    expect(screen.queryByTestId("abort-button")).not.toBeInTheDocument();
  });

  it("dispatches abort on abort button click", () => {
    const store = createTestStore();
    const waitingGame = { ...makeFakeGameState(), status: "waiting" as const };
    store.dispatch(setGameState(waitingGame));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("abort-button"));

    expect(mockSocket.emit).toHaveBeenCalledWith("abort", { gameId: 42 });
  });

  it("hides resign and draw buttons when game is not active", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    expect(screen.queryByTestId("resign-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("draw-button")).not.toBeInTheDocument();
  });
});

describe("GameOverOverlay", () => {
  it("renders nothing when game is active", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.queryByTestId("game-over-overlay")).not.toBeInTheDocument();
  });

  it("renders overlay on checkmate with winner message for player", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("game-over-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("result-message")).toHaveTextContent("You won by checkmate!");
  });

  it("renders loser message for losing player", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="black" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("result-message")).toHaveTextContent("You lost by checkmate.");
  });

  it("renders stalemate message", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "stalemate" as const,
      result: { reason: "stalemate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("result-message")).toHaveTextContent(/Stalemate.*Draw/);
  });

  it("renders resignation message for winner", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "resigned" as const,
      result: { winner: "white" as const, reason: "resigned" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("result-message")).toHaveTextContent("Opponent resigned. You win!");
  });

  it("renders resignation message for loser", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "resigned" as const,
      result: { winner: "black" as const, reason: "resigned" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("result-message")).toHaveTextContent("You resigned.");
  });

  it("renders draw by agreement message", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "draw" as const,
      result: { reason: "draw" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("result-message")).toHaveTextContent("Game drawn by agreement");
  });

  it("renders timeout message for winner", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "timeout" as const,
      result: { winner: "white" as const, reason: "timeout" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("result-message")).toHaveTextContent(
      "Opponent ran out of time. You win!",
    );
  });

  it("renders aborted message", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "aborted" as const,
      result: { reason: "aborted" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("result-message")).toHaveTextContent("Game aborted");
  });

  it("displays final clock times", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    const clocks = screen.getByTestId("final-clocks");
    expect(clocks).toHaveTextContent("White");
    expect(clocks).toHaveTextContent("Black");
    // Clock values from makeFakeGameState: white=599000, black=600000
    expect(clocks).toHaveTextContent("9:59");
    expect(clocks).toHaveTextContent("10:00");
  });

  it("calls onDismiss when 'View Board' is clicked", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    const onDismiss = vi.fn();
    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={onDismiss} />, { store });

    fireEvent.click(screen.getByTestId("view-board"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("has a 'Back to Dashboard' button", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("back-to-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("back-to-dashboard")).toHaveTextContent("Back to Dashboard");
  });
});

describe("DisconnectBanner", () => {
  it("renders nothing when opponent is connected", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<DisconnectBanner />, { store });

    expect(screen.queryByTestId("disconnect-banner")).not.toBeInTheDocument();
  });

  it("shows banner when opponent is disconnected and game is active", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setOpponentConnected(false));

    renderWithStore(<DisconnectBanner />, { store });

    expect(screen.getByTestId("disconnect-banner")).toBeInTheDocument();
    expect(screen.getByTestId("disconnect-banner")).toHaveTextContent("Opponent disconnected");
  });

  it("hides banner when opponent reconnects", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setOpponentConnected(false));

    renderWithStore(<DisconnectBanner />, { store });
    expect(screen.getByTestId("disconnect-banner")).toBeInTheDocument();

    act(() => {
      store.dispatch(setOpponentConnected(true));
    });

    expect(screen.queryByTestId("disconnect-banner")).not.toBeInTheDocument();
  });

  it("does not show banner when game is not active", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));
    store.dispatch(setOpponentConnected(false));

    renderWithStore(<DisconnectBanner />, { store });

    expect(screen.queryByTestId("disconnect-banner")).not.toBeInTheDocument();
  });
});

describe("ConnectionStatus", () => {
  it("shows green dot and 'Connected' when connected", () => {
    const store = createTestStore();
    store.dispatch(setConnectionStatus("connected"));

    renderWithStore(<ConnectionStatus />, { store });

    expect(screen.getByTestId("connection-label")).toHaveTextContent("Connected");
    expect(screen.getByTestId("connection-dot").style.backgroundColor).toBe("rgb(40, 167, 69)");
  });

  it("shows yellow dot and 'Reconnecting...' when connecting", () => {
    const store = createTestStore();
    store.dispatch(setConnectionStatus("connecting"));

    renderWithStore(<ConnectionStatus />, { store });

    expect(screen.getByTestId("connection-label")).toHaveTextContent("Reconnecting...");
    expect(screen.getByTestId("connection-dot").style.backgroundColor).toBe("rgb(255, 193, 7)");
  });

  it("shows red dot and 'Disconnected' when disconnected", () => {
    const store = createTestStore();

    renderWithStore(<ConnectionStatus />, { store });

    // Default connectionStatus is "disconnected"
    expect(screen.getByTestId("connection-label")).toHaveTextContent("Disconnected");
    expect(screen.getByTestId("connection-dot").style.backgroundColor).toBe("rgb(220, 53, 69)");
  });
});
