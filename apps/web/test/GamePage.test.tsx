import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer, setGameState } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { Clock } from "../src/components/Clock.js";
import { MoveList } from "../src/components/MoveList.js";
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

vi.mock("../src/socket.js", () => ({
  connectSocket: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    connected: true,
    disconnect: vi.fn(),
  })),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    connected: true,
    disconnect: vi.fn(),
  })),
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
  {
    route = "/",
    store,
  }: { route?: string; store?: ReturnType<typeof createTestStore> } = {},
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
  it("shows loading state when no game is loaded", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithStore(<AppRoutes />, { route: "/game/42" });
    expect(screen.getByTestId("loading")).toHaveTextContent("Loading game...");
  });

  it("renders game board and clocks when game is loaded", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    expect(screen.getByTestId("game-board")).toBeInTheDocument();
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
        setCalls.some(
          (call) => (call[0] as { orientation?: string }).orientation === "black",
        ),
      ).toBeTruthy();
    });
  });

  it("displays game status", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    expect(screen.getByText(/active/)).toBeInTheDocument();
  });

  it("displays move list with correct moves", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    const moveList = screen.getByTestId("move-list");
    expect(moveList).toHaveTextContent("e4");
  });

  it("shows error message from Redux state", () => {
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

    expect(screen.getByRole("alert")).toHaveTextContent("Illegal move");
  });

  it("shows invalid game ID message for non-numeric ID", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithStore(<AppRoutes />, { route: "/game/abc" });

    expect(screen.getByText("Invalid game ID")).toBeInTheDocument();
  });

  it("dispatches clearGame on unmount", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    const { unmount } = renderWithStore(<AppRoutes />, { route: "/game/42", store });

    expect(store.getState().game.currentGame).not.toBeNull();
    unmount();
    expect(store.getState().game.currentGame).toBeNull();
  });
});

describe("App routing includes /game/:id", () => {
  it("renders GamePage at /game/42", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithStore(<AppRoutes />, { route: "/game/42" });

    // GamePage shows loading state when no game is loaded
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });
});
