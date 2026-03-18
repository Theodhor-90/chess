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
import { computeCapturedPieces, PlayerInfoBar } from "../src/components/PlayerInfoBar.js";
import { MoveList } from "../src/components/MoveList.js";
import { GameActions } from "../src/components/GameActions.js";
import { GameOverOverlay } from "../src/components/GameOverOverlay.js";
import { DisconnectBanner } from "../src/components/DisconnectBanner.js";
import { ConnectionStatus } from "../src/components/ConnectionStatus.js";
import { PromotionModal } from "../src/components/PromotionModal.js";
import { AppRoutes } from "../src/App.js";
import { Chessground } from "chessground";
import { Chess } from "chess.js";
import type { GameState, ClockState, ClockConfig } from "@chess/shared";

vi.mock("../src/components/Clock.module.css", () => ({
  default: {
    clock: "clock",
    active: "active",
    lowTime: "lowTime",
  },
}));

vi.mock("../src/components/PlayerInfoBar.module.css", () => ({
  default: {
    bar: "bar",
    playerInfo: "playerInfo",
    usernameLink: "usernameLink",
    username: "username",
    captured: "captured",
    capturedPiece: "capturedPiece",
  },
}));

vi.mock("../src/pages/GamePage.module.css", () => ({
  default: {
    page: "page",
    layout: "layout",
    boardColumn: "boardColumn",
    sidePanel: "sidePanel",
    gameInfo: "gameInfo",
    errorBanner: "errorBanner",
    viewingMoveIndicator: "viewingMoveIndicator",
    backToLiveButton: "backToLiveButton",
    desktopActions: "desktopActions",
    mobileActionBar: "mobileActionBar",
  },
}));

vi.mock("../src/components/MoveList.module.css", () => ({
  default: {
    container: "container",
    table: "table",
    row: "row",
    rowAlt: "rowAlt",
    currentMove: "currentMove",
    moveNumber: "moveNumber",
    moveCell: "moveCell",
  },
}));

vi.mock("../src/components/GameActions.module.css", () => ({
  default: {
    container: "container",
    drawGroup: "drawGroup",
    resignConfirm: "resignConfirm",
    resignConfirmText: "resignConfirmText",
    resignConfirmButtons: "resignConfirmButtons",
  },
}));

vi.mock("../src/components/ui/Button.module.css", () => ({
  default: {
    button: "button",
    primary: "primary",
    secondary: "secondary",
    danger: "danger",
    ghost: "ghost",
    sm: "sm",
    md: "md",
    lg: "lg",
    loading: "loading",
    spinner: "spinner",
  },
}));

vi.mock("../src/components/GameOverOverlay.module.css", () => ({
  default: {
    content: "content",
    resultMessage: "resultMessage",
    finalClocks: "finalClocks",
    clockLabel: "clockLabel",
    actions: "actions",
  },
}));

vi.mock("../src/components/ui/Modal.module.css", () => ({
  default: {
    backdrop: "backdrop",
    panel: "panel",
    header: "header",
    title: "title",
    closeButton: "closeButton",
    body: "body",
    footer: "footer",
  },
}));

vi.mock("../src/components/PromotionModal.module.css", () => ({
  default: {
    overlay: "overlay",
    panel: "panel",
    title: "title",
    pieces: "pieces",
    pieceButton: "pieceButton",
  },
}));

vi.mock("../src/components/DisconnectBanner.module.css", () => ({
  default: {
    banner: "banner",
    warning: "warning",
    error: "error",
  },
}));

vi.mock("../src/components/ConnectionStatus.module.css", () => ({
  default: {
    container: "container",
    dot: "dot",
    dotConnected: "dotConnected",
    dotConnecting: "dotConnecting",
    dotDisconnected: "dotDisconnected",
  },
}));

vi.mock("../src/components/GameBoard.module.css", () => ({
  default: {
    boardContainer: "boardContainer",
  },
}));

vi.mock("chessground", () => ({
  Chessground: vi.fn(() => ({
    set: vi.fn(),
    destroy: vi.fn(),
    state: {},
    getFen: vi.fn(() => ""),
    redrawAll: vi.fn(),
  })),
}));

vi.mock("chess.js", () => ({
  Chess: vi.fn().mockImplementation(() => ({
    moves: vi.fn(() => []),
    get: vi.fn(() => null),
    move: vi.fn(() => ({ from: "e2", to: "e4", san: "e4" })),
    fen: vi.fn(() => "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"),
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
        redrawAll: vi.fn(),
      }) as never,
  );

  vi.mocked(Chess).mockImplementation(
    () =>
      ({
        moves: vi.fn(() => []),
        get: vi.fn(() => null),
        move: vi.fn(() => ({ from: "e2", to: "e4", san: "e4" })),
        fen: vi.fn(() => "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"),
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
    expect(clock).toHaveClass("clock");
    expect(clock).toHaveClass("lowTime");
    expect(clock).not.toHaveClass("active");
  });

  it("applies bold font when active", () => {
    render(<Clock timeMs={300000} isActive={true} lastUpdate={Date.now()} />);
    const clock = screen.getByTestId("clock");
    expect(clock).toHaveClass("clock");
    expect(clock).toHaveClass("active");
    expect(clock).not.toHaveClass("lowTime");
  });

  it("applies normal font when not active", () => {
    render(<Clock timeMs={300000} isActive={false} lastUpdate={Date.now()} />);
    const clock = screen.getByTestId("clock");
    expect(clock).toHaveClass("clock");
    expect(clock).not.toHaveClass("active");
    expect(clock).not.toHaveClass("lowTime");
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

  it("highlights the current (last) white move", () => {
    render(<MoveList moves={["e4"]} />);
    const currentMove = screen.getByTestId("current-move");
    expect(currentMove).toHaveTextContent("e4");
    expect(currentMove).toHaveClass("currentMove");
  });

  it("highlights the current (last) black move", () => {
    render(<MoveList moves={["e4", "e5"]} />);
    const currentMove = screen.getByTestId("current-move");
    expect(currentMove).toHaveTextContent("e5");
    expect(currentMove).toHaveClass("currentMove");
  });

  it("highlights the last move in a longer game", () => {
    render(<MoveList moves={["e4", "e5", "Nf3", "Nc6", "Bb5"]} />);
    const currentMove = screen.getByTestId("current-move");
    expect(currentMove).toHaveTextContent("Bb5");
    expect(currentMove).toHaveClass("currentMove");
    expect(screen.getAllByTestId("current-move")).toHaveLength(1);
  });

  it("does not highlight any move when list is empty", () => {
    render(<MoveList moves={[]} />);
    expect(screen.queryByTestId("current-move")).toBeNull();
  });

  it("applies alternating row classes", () => {
    render(<MoveList moves={["e4", "e5", "Nf3", "Nc6"]} />);
    const rows = screen.getByTestId("move-list").querySelectorAll("tr");
    expect(rows[0]).toHaveClass("row");
    expect(rows[1]).toHaveClass("rowAlt");
  });

  it("uses monospace font class on table", () => {
    render(<MoveList moves={["e4"]} />);
    expect(screen.getByTestId("move-list").querySelector("table")).toHaveClass("table");
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
    expect(screen.getByTestId("top-player-bar")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-player-bar")).toBeInTheDocument();
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

  it("board container has no inline styles (uses CSS module)", async () => {
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

    expect(screen.getByTestId("game-board").getAttribute("style")).toBeNull();
  });

  it("renders mobile action bar when game is active and player is assigned", async () => {
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
      expect(screen.getByTestId("mobile-action-bar")).toBeInTheDocument();
    });
    // The action bar should contain resign and draw buttons
    const actionBar = screen.getByTestId("mobile-action-bar");
    expect(actionBar.querySelector('[data-testid="resign-button"]')).toBeInTheDocument();
    expect(actionBar.querySelector('[data-testid="draw-button"]')).toBeInTheDocument();
  });

  it("does not render mobile action bar when game is finished", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, email: "a@b.com" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<AppRoutes />, { route: "/game/42", store });

    await waitFor(() => {
      expect(screen.getByTestId("game-board")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("mobile-action-bar")).not.toBeInTheDocument();
  });

  it("does not render mobile action bar when playerColor is null (spectator)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 999, email: "spectator@test.com" } }), {
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
    expect(screen.queryByTestId("mobile-action-bar")).not.toBeInTheDocument();
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

  it("shows accept and decline buttons when opponent offered draw", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setDrawOffer("black"));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    // The single "draw-button" should NOT be rendered when opponent has offered
    expect(screen.queryByTestId("draw-button")).not.toBeInTheDocument();
    // Instead, separate accept and decline buttons appear
    expect(screen.getByTestId("accept-draw-button")).toHaveTextContent("Accept Draw");
    expect(screen.getByTestId("decline-draw-button")).toHaveTextContent("Decline");
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

    fireEvent.click(screen.getByTestId("accept-draw-button"));

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

  it("decline draw clears draw offer from state", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setDrawOffer("black"));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("decline-draw-button"));

    // Draw offer cleared from Redux state
    expect(store.getState().game.drawOffer).toBeNull();
    // UI returns to showing the single "Offer Draw" button
    expect(screen.getByTestId("draw-button")).toHaveTextContent("Offer Draw");
  });

  it("resign button has danger class", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    expect(screen.getByTestId("resign-button")).toHaveClass("danger");
  });

  it("draw button has secondary class", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    expect(screen.getByTestId("draw-button")).toHaveClass("secondary");
  });

  it("no inline styles on game-actions container", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    expect(screen.getByTestId("game-actions").getAttribute("style")).toBeNull();
  });

  it("no inline styles on resign confirm panel", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<GameActions gameId={42} playerColor="white" />, { store });

    fireEvent.click(screen.getByTestId("resign-button"));

    expect(screen.getByTestId("resign-confirm").getAttribute("style")).toBeNull();
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

  it("renders inside a Modal with 'Game Over' title", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Game Over")).toBeInTheDocument();
  });

  it("has an 'Analyze Game' link to analysis page", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("analyze-game")).toBeInTheDocument();
    expect(screen.getByTestId("analyze-game")).toHaveTextContent("Analyze Game");
  });

  it("has no inline styles on overlay", () => {
    const store = createTestStore();
    const endedGame = {
      ...makeFakeGameState(),
      status: "checkmate" as const,
      result: { winner: "white" as const, reason: "checkmate" as const },
    };
    store.dispatch(setGameState(endedGame));

    renderWithStore(<GameOverOverlay playerColor="white" onDismiss={vi.fn()} />, { store });

    expect(screen.getByTestId("game-over-overlay").getAttribute("style")).toBeNull();
    expect(screen.getByTestId("result-message").getAttribute("style")).toBeNull();
    expect(screen.getByTestId("final-clocks").getAttribute("style")).toBeNull();
  });
});

describe("DisconnectBanner", () => {
  it("renders nothing when opponent is connected", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));

    renderWithStore(<DisconnectBanner />, { store });

    expect(screen.queryByTestId("disconnect-banner")).not.toBeInTheDocument();
  });

  it("shows warning banner when opponent is disconnected and user is still connected", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setConnectionStatus("connected"));
    store.dispatch(setOpponentConnected(false));

    renderWithStore(<DisconnectBanner />, { store });

    expect(screen.getByTestId("disconnect-banner")).toBeInTheDocument();
    expect(screen.getByTestId("disconnect-banner")).toHaveTextContent(
      "Opponent disconnected — waiting for reconnection...",
    );
    expect(screen.getByTestId("disconnect-banner")).toHaveClass("warning");
  });

  it("shows error banner when user's own connection is lost", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setConnectionStatus("disconnected"));
    store.dispatch(setOpponentConnected(false));

    renderWithStore(<DisconnectBanner />, { store });

    expect(screen.getByTestId("disconnect-banner")).toBeInTheDocument();
    expect(screen.getByTestId("disconnect-banner")).toHaveTextContent(
      "Connection lost — reconnecting...",
    );
    expect(screen.getByTestId("disconnect-banner")).toHaveClass("error");
  });

  it("has no inline styles on disconnect banner", () => {
    const store = createTestStore();
    store.dispatch(setGameState(makeFakeGameState()));
    store.dispatch(setOpponentConnected(false));

    renderWithStore(<DisconnectBanner />, { store });

    expect(screen.getByTestId("disconnect-banner").getAttribute("style")).toBeNull();
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
  it("shows connected state with correct class and label", () => {
    const store = createTestStore();
    store.dispatch(setConnectionStatus("connected"));

    renderWithStore(<ConnectionStatus />, { store });

    expect(screen.getByTestId("connection-label")).toHaveTextContent("Connected");
    expect(screen.getByTestId("connection-dot")).toHaveClass("dotConnected");
  });

  it("shows connecting state with correct class and label", () => {
    const store = createTestStore();
    store.dispatch(setConnectionStatus("connecting"));

    renderWithStore(<ConnectionStatus />, { store });

    expect(screen.getByTestId("connection-label")).toHaveTextContent("Reconnecting...");
    expect(screen.getByTestId("connection-dot")).toHaveClass("dotConnecting");
  });

  it("shows disconnected state with correct class and label", () => {
    const store = createTestStore();

    renderWithStore(<ConnectionStatus />, { store });

    // Default connectionStatus is "disconnected"
    expect(screen.getByTestId("connection-label")).toHaveTextContent("Disconnected");
    expect(screen.getByTestId("connection-dot")).toHaveClass("dotDisconnected");
  });

  it("has no inline styles on connection status", () => {
    const store = createTestStore();

    renderWithStore(<ConnectionStatus />, { store });

    expect(screen.getByTestId("connection-status").getAttribute("style")).toBeNull();
    expect(screen.getByTestId("connection-dot").getAttribute("style")).toBeNull();
  });
});

describe("PromotionModal", () => {
  it("renders four promotion piece buttons for white", () => {
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId("promotion-modal")).toBeInTheDocument();
    expect(screen.getByTestId("promote-q")).toBeInTheDocument();
    expect(screen.getByTestId("promote-r")).toBeInTheDocument();
    expect(screen.getByTestId("promote-b")).toBeInTheDocument();
    expect(screen.getByTestId("promote-n")).toBeInTheDocument();
  });

  it("renders correct unicode symbols for white pieces", () => {
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId("promote-q")).toHaveTextContent("\u2655");
    expect(screen.getByTestId("promote-r")).toHaveTextContent("\u2656");
    expect(screen.getByTestId("promote-b")).toHaveTextContent("\u2657");
    expect(screen.getByTestId("promote-n")).toHaveTextContent("\u2658");
  });

  it("renders correct unicode symbols for black pieces", () => {
    render(<PromotionModal color="black" onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId("promote-q")).toHaveTextContent("\u265B");
    expect(screen.getByTestId("promote-r")).toHaveTextContent("\u265C");
    expect(screen.getByTestId("promote-b")).toHaveTextContent("\u265D");
    expect(screen.getByTestId("promote-n")).toHaveTextContent("\u265E");
  });

  it("calls onSelect with the chosen piece", () => {
    const onSelect = vi.fn();
    render(<PromotionModal color="white" onSelect={onSelect} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByTestId("promote-r"));
    expect(onSelect).toHaveBeenCalledWith("r");

    fireEvent.click(screen.getByTestId("promote-n"));
    expect(onSelect).toHaveBeenCalledWith("n");
  });

  it("calls onCancel when overlay is clicked", () => {
    const onCancel = vi.fn();
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByTestId("promotion-modal"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onCancel when panel is clicked", () => {
    const onCancel = vi.fn();
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={onCancel} />);

    // Click the title text inside the panel — this should not propagate to the overlay
    fireEvent.click(screen.getByText("Promote to:"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("has no inline styles", () => {
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId("promotion-modal").getAttribute("style")).toBeNull();
  });

  it("piece buttons are accessible buttons with aria-labels", () => {
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={vi.fn()} />);

    const queenBtn = screen.getByTestId("promote-q");
    const rookBtn = screen.getByTestId("promote-r");
    const bishopBtn = screen.getByTestId("promote-b");
    const knightBtn = screen.getByTestId("promote-n");

    expect(queenBtn.tagName).toBe("BUTTON");
    expect(rookBtn.tagName).toBe("BUTTON");
    expect(bishopBtn.tagName).toBe("BUTTON");
    expect(knightBtn.tagName).toBe("BUTTON");

    expect(queenBtn).toHaveAttribute("aria-label", "Promote to Queen");
    expect(rookBtn).toHaveAttribute("aria-label", "Promote to Rook");
    expect(bishopBtn).toHaveAttribute("aria-label", "Promote to Bishop");
    expect(knightBtn).toHaveAttribute("aria-label", "Promote to Knight");
  });

  it("piece buttons have type='button' attribute", () => {
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByTestId("promote-q")).toHaveAttribute("type", "button");
    expect(screen.getByTestId("promote-r")).toHaveAttribute("type", "button");
    expect(screen.getByTestId("promote-b")).toHaveAttribute("type", "button");
    expect(screen.getByTestId("promote-n")).toHaveAttribute("type", "button");
  });

  it("renders overlay with correct data-testid for backdrop click", () => {
    render(<PromotionModal color="white" onSelect={vi.fn()} onCancel={vi.fn()} />);

    const overlay = screen.getByTestId("promotion-modal");
    expect(overlay).toHaveClass("overlay");
  });
});

describe("computeCapturedPieces", () => {
  it("returns empty array for starting position", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(computeCapturedPieces(fen, "white")).toEqual([]);
    expect(computeCapturedPieces(fen, "black")).toEqual([]);
  });

  it("returns captured pawns", () => {
    const fen = "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";
    expect(computeCapturedPieces(fen, "white")).toEqual(["\u265F"]);
    expect(computeCapturedPieces(fen, "black")).toEqual([]);
  });

  it("returns captured queens", () => {
    const fen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
    expect(computeCapturedPieces(fen, "white")).toEqual(["\u265B"]);
    expect(computeCapturedPieces(fen, "black")).toEqual(["\u2655"]);
  });

  it("handles multiple captures of same piece type", () => {
    const fen = "rnbqkbnr/6pp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(computeCapturedPieces(fen, "white")).toEqual([
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
    ]);
  });

  it("orders pieces by value (queen, rook, bishop, knight, pawn)", () => {
    const fen = "4k3/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1";
    const result = computeCapturedPieces(fen, "white");
    expect(result).toEqual([
      "\u265B",
      "\u265C",
      "\u265C",
      "\u265D",
      "\u265D",
      "\u265E",
      "\u265E",
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
      "\u265F",
    ]);
  });
});

describe("PlayerInfoBar", () => {
  it("renders username as link when userId is provided", () => {
    render(
      <MemoryRouter>
        <PlayerInfoBar
          username="alice"
          userId={5}
          timeMs={300000}
          isActive={false}
          lastUpdate={Date.now()}
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          color="white"
          testIdPrefix="top"
        />
      </MemoryRouter>,
    );
    const label = screen.getByTestId("top-player-label");
    expect(label).toHaveTextContent("alice");
    expect(label.tagName).toBe("A");
    expect(label.getAttribute("href")).toContain("/profile/5");
  });

  it("renders username as span when userId is null", () => {
    render(
      <MemoryRouter>
        <PlayerInfoBar
          username="Unknown"
          userId={null}
          timeMs={300000}
          isActive={false}
          lastUpdate={Date.now()}
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          color="white"
          testIdPrefix="bottom"
        />
      </MemoryRouter>,
    );
    const label = screen.getByTestId("bottom-player-label");
    expect(label).toHaveTextContent("Unknown");
    expect(label.tagName).toBe("SPAN");
  });

  it("renders captured pieces from FEN", () => {
    const fen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    render(
      <MemoryRouter>
        <PlayerInfoBar
          username="alice"
          userId={1}
          timeMs={300000}
          isActive={false}
          lastUpdate={Date.now()}
          fen={fen}
          color="white"
          testIdPrefix="top"
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("top-captured")).toHaveTextContent("\u265B");
  });

  it("renders empty captured area for starting position", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    render(
      <MemoryRouter>
        <PlayerInfoBar
          username="alice"
          userId={1}
          timeMs={300000}
          isActive={false}
          lastUpdate={Date.now()}
          fen={fen}
          color="white"
          testIdPrefix="top"
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("top-captured")).toHaveTextContent("");
  });

  it("renders Clock component", () => {
    render(
      <MemoryRouter>
        <PlayerInfoBar
          username="alice"
          userId={1}
          timeMs={120000}
          isActive={true}
          lastUpdate={Date.now()}
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          color="white"
          testIdPrefix="top"
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("clock")).toBeInTheDocument();
  });
});
