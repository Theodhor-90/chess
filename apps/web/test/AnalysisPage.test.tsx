import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { Chess } from "chess.js";
import type { DrawShape } from "chessground/draw";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { AppRoutes } from "../src/App.js";
import { BoardThemeProvider } from "../src/components/BoardThemeProvider.js";

const mockChessgroundSet = vi.fn();
const mockChessgroundDestroy = vi.fn();

vi.mock("chessground", () => ({
  Chessground: vi.fn(() => ({
    set: mockChessgroundSet,
    destroy: mockChessgroundDestroy,
    state: {},
    getFen: vi.fn(() => ""),
  })),
}));

vi.mock("chess.js", () => ({
  Chess: vi.fn().mockImplementation(() => ({
    moves: vi.fn(() => []),
    get: vi.fn(() => null),
    loadPgn: vi.fn(),
    history: vi.fn(() => []),
    fen: vi.fn(() => "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    move: vi.fn(),
  })),
}));

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
  disconnect: vi.fn(),
};

vi.mock("../src/socket.js", () => ({
  connectSocket: vi.fn(() => mockSocket),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => mockSocket),
}));

function getSocketHandler(event: string) {
  const call = mockSocket.on.mock.calls.find((c: unknown[]) => c[0] === event);
  return call?.[1] as ((...args: unknown[]) => void) | undefined;
}

afterEach(() => {
  cleanup();
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
  mockSocket.emit.mockClear();
  mockSocket.disconnect.mockClear();
  mockChessgroundSet.mockClear();
  mockChessgroundDestroy.mockClear();
  vi.clearAllMocks();
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
        <BoardThemeProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </BoardThemeProvider>
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

const analysisResultWithEngineLines = {
  positions: [
    {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      evaluation: {
        score: { type: "cp" as const, value: 20 },
        bestLine: ["e4"],
        depth: 18,
        engineLines: [
          { score: { type: "cp" as const, value: 20 }, moves: ["e4", "e5", "Nf3"], depth: 18 },
          { score: { type: "cp" as const, value: 15 }, moves: ["d4", "d5"], depth: 18 },
          { score: { type: "cp" as const, value: 10 }, moves: ["Nf3"], depth: 18 },
        ],
      },
      classification: null,
      centipawnLoss: null,
    },
    {
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      evaluation: {
        score: { type: "cp" as const, value: -25 },
        bestLine: ["e5"],
        depth: 18,
        engineLines: [
          { score: { type: "cp" as const, value: -25 }, moves: ["e5", "Nf3"], depth: 18 },
          { score: { type: "cp" as const, value: -20 }, moves: ["d5"], depth: 18 },
        ],
      },
      classification: "best" as const,
      centipawnLoss: 0,
    },
    {
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      evaluation: {
        score: { type: "cp" as const, value: 15 },
        bestLine: ["Nf3"],
        depth: 18,
        engineLines: [
          { score: { type: "cp" as const, value: 15 }, moves: ["Nf3", "Nc6"], depth: 18 },
        ],
      },
      classification: "good" as const,
      centipawnLoss: 5,
    },
  ],
  whiteAccuracy: 87.3,
  blackAccuracy: 72.1,
};

const storedAnalysisResponse = {
  gameId: 10,
  analysisTree: {
    fen: analysisResultWithEngineLines.positions[0].fen,
    san: null,
    evaluation: analysisResultWithEngineLines.positions[0].evaluation,
    classification: null,
    children: [
      {
        fen: analysisResultWithEngineLines.positions[1].fen,
        san: "e4",
        evaluation: analysisResultWithEngineLines.positions[1].evaluation,
        classification: analysisResultWithEngineLines.positions[1].classification,
        children: [
          {
            fen: analysisResultWithEngineLines.positions[2].fen,
            san: "e5",
            evaluation: analysisResultWithEngineLines.positions[2].evaluation,
            classification: analysisResultWithEngineLines.positions[2].classification,
            children: [],
          },
        ],
      },
    ],
  },
  whiteAccuracy: analysisResultWithEngineLines.whiteAccuracy,
  blackAccuracy: analysisResultWithEngineLines.blackAccuracy,
  engineDepth: 18,
  createdAt: 1700000000,
};

function queueCompletedGameFetches() {
  mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
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
  mockFetchSuccess([]);
}

async function setupCompletedAnalysis() {
  vi.mocked(Chess).mockImplementation(
    () =>
      ({
        moves: vi.fn(() => []),
        get: vi.fn(() => null),
        loadPgn: vi.fn(),
        history: vi.fn(() => ["e4", "e5"]),
        fen: vi
          .fn()
          .mockReturnValueOnce("start-fen")
          .mockReturnValueOnce("mainline-fen-after-e4")
          .mockReturnValue("mainline-fen-after-e5"),
        move: vi.fn((san: string) => ({ san })),
      }) as unknown as Chess,
  );

  queueCompletedGameFetches();
  mockFetchError({}, 404); // no stored analysis

  renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

  await waitFor(() => {
    expect(screen.getByTestId("analyze-button")).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId("analyze-button"));

  // Simulate socket analysisComplete event
  await waitFor(() => {
    expect(mockSocket.emit).toHaveBeenCalledWith("startAnalysis", { gameId: 10 });
  });
  const handler = getSocketHandler("analysisComplete");
  expect(handler).toBeDefined();
  handler!({
    gameId: 10,
    ...analysisResultWithEngineLines,
    completedPositions: 3,
    totalPositions: 3,
  });

  await waitFor(() => {
    expect(screen.getByTestId("accuracy-display")).toBeInTheDocument();
  });

  expect(screen.getByTestId("engine-lines-panel")).toBeInTheDocument();
}

function mockChessForVariation() {
  const variationLines: Record<string, Array<{ moves: string[]; fens: string[] }>> = {
    "start-fen": [
      {
        moves: ["e4", "e5", "Nf3"],
        fens: ["variation-fen-after-e4", "variation-fen-after-e5", "variation-fen-after-nf3"],
      },
      {
        moves: ["d4", "d5"],
        fens: ["variation-fen-after-d4", "variation-fen-after-d5"],
      },
      {
        moves: ["Nf3"],
        fens: ["variation-fen-after-nf3-only"],
      },
    ],
    "mainline-fen-after-e4": [
      {
        moves: ["e5", "Nf3"],
        fens: ["variation-from-mainline-after-e5", "variation-from-mainline-after-nf3"],
      },
      {
        moves: ["d5"],
        fens: ["variation-from-mainline-after-d5"],
      },
    ],
  };

  vi.mocked(Chess).mockImplementation((branchFen?: string) => {
    let currentFen = branchFen ?? "start-fen";
    let activeLine: { moves: string[]; fens: string[] } | null = null;
    let moveIndex = 0;

    return {
      moves: vi.fn(() => []),
      get: vi.fn(() => null),
      loadPgn: vi.fn(),
      history: vi.fn(() => []),
      fen: vi.fn(() => currentFen),
      move: vi.fn((san: string) => {
        if (!branchFen) {
          return { san };
        }

        if (!activeLine) {
          activeLine = variationLines[branchFen]?.find((line) => line.moves[0] === san) ?? null;
          moveIndex = 0;
        }

        if (!activeLine || activeLine.moves[moveIndex] !== san) {
          return null;
        }

        const fen = activeLine.fens[moveIndex];
        if (!fen) {
          return null;
        }

        currentFen = fen;
        moveIndex += 1;
        return { san };
      }),
    } as unknown as Chess;
  });
}

function mockChessForArrows() {
  const moveMap: Record<string, Record<string, { from: string; to: string; san: string }>> = {
    "start-fen": {
      e4: { from: "e2", to: "e4", san: "e4" },
      d4: { from: "d2", to: "d4", san: "d4" },
      Nf3: { from: "g1", to: "f3", san: "Nf3" },
    },
    "mainline-fen-after-e4": {
      e5: { from: "e7", to: "e5", san: "e5" },
      d5: { from: "d7", to: "d5", san: "d5" },
      Nf6: { from: "g8", to: "f6", san: "Nf6" },
    },
  };

  vi.mocked(Chess).mockImplementation((fen?: string) => {
    const currentFen = fen ?? "start-fen";
    const fenMoves = moveMap[currentFen] ?? {};

    return {
      moves: vi.fn(() => []),
      get: vi.fn(() => null),
      loadPgn: vi.fn(),
      history: vi.fn(() => ["e4", "e5"]),
      fen: vi
        .fn()
        .mockReturnValueOnce("start-fen")
        .mockReturnValueOnce("mainline-fen-after-e4")
        .mockReturnValue("mainline-fen-after-e5"),
      move: vi.fn((san: string) => {
        const mapped = fenMoves[san];
        if (mapped) return mapped;
        if (typeof san === "string") return { from: "a1", to: "a2", san };
        return null;
      }),
      undo: vi.fn(() => null),
    } as unknown as Chess;
  });
}

function expectLatestBoardFen(expectedFen: string) {
  const latestCall = mockChessgroundSet.mock.calls.at(-1);
  expect(latestCall).toBeDefined();
  expect(latestCall?.[0]).toMatchObject({ fen: expectedFen });
}

function getLatestAutoShapes(): DrawShape[] | undefined {
  const latestCall = mockChessgroundSet.mock.calls.at(-1);
  if (!latestCall) return undefined;
  return latestCall[0]?.drawable?.autoShapes;
}

describe("AnalysisPage", () => {
  it("shows loading state while fetching", async () => {
    // Auth succeeds, then game + myGames stay pending
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
    mockFetchPending();
    mockFetchPending();

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analysis-loading")).toBeInTheDocument();
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
    queueCompletedGameFetches();
    mockFetchError({}, 404); // no stored analysis

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

  it("shows enabled Analyze button for completed game", async () => {
    queueCompletedGameFetches();
    mockFetchError({}, 404); // no stored analysis

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analyze-button")).toBeInTheDocument();
    });
    expect(screen.getByTestId("analyze-button")).not.toBeDisabled();
  });

  it("shows server analysis progress while the request is running", async () => {
    queueCompletedGameFetches();
    mockFetchError({}, 404); // no stored analysis

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analyze-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("analyze-button"));

    await waitFor(() => {
      expect(screen.getByTestId("analysis-progress")).toHaveTextContent("Starting analysis...");
    });
    expect(screen.queryByTestId("analyze-button")).toBeNull();
    expect(screen.getByTestId("cancel-analysis-button")).toBeInTheDocument();
  });

  it("displays accuracy scores and eval bar after server analysis completes", async () => {
    queueCompletedGameFetches();
    mockFetchError({}, 404); // no stored analysis

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analyze-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("analyze-button"));

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith("startAnalysis", { gameId: 10 });
    });

    const handler = getSocketHandler("analysisComplete");
    handler!({
      gameId: 10,
      positions: [
        {
          fen: "start",
          evaluation: { score: { type: "cp", value: 20 }, bestLine: ["e4"], depth: 18 },
          classification: null,
          centipawnLoss: null,
        },
        {
          fen: "after-e4",
          evaluation: { score: { type: "cp", value: -25 }, bestLine: ["e5"], depth: 18 },
          classification: "best",
          centipawnLoss: 0,
        },
        {
          fen: "after-e5",
          evaluation: { score: { type: "cp", value: 15 }, bestLine: ["Nf3"], depth: 18 },
          classification: "good",
          centipawnLoss: 5,
        },
      ],
      whiteAccuracy: 87.3,
      blackAccuracy: 72.1,
      completedPositions: 3,
      totalPositions: 3,
    });

    await waitFor(() => {
      expect(screen.getByTestId("accuracy-display")).toBeInTheDocument();
    });
    expect(screen.getByTestId("accuracy-display")).toHaveTextContent("White: 87.3%");
    expect(screen.getByTestId("accuracy-display")).toHaveTextContent("Black: 72.1%");
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();
  });

  it("shows a clear message when the engine is unavailable", async () => {
    queueCompletedGameFetches();
    mockFetchError({}, 404); // no stored analysis

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analyze-button")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("analyze-button"));

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith("startAnalysis", { gameId: 10 });
    });

    const handler = getSocketHandler("analysisError");
    handler!({ gameId: 10, error: "Engine analysis is currently unavailable." });

    await waitFor(() => {
      expect(screen.getByTestId("analysis-error-message")).toHaveTextContent(
        "Engine analysis is currently unavailable.",
      );
    });
    expect(screen.getByTestId("analyze-button")).not.toBeDisabled();
  });

  it("loads saved analysis on revisit", async () => {
    queueCompletedGameFetches();
    mockFetchSuccess(storedAnalysisResponse);

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("accuracy-display")).toBeInTheDocument();
    });

    expect(screen.getByTestId("accuracy-display")).toHaveTextContent("White: 87.3%");
    expect(screen.queryByTestId("analyze-button")).toBeNull();
  });

  it("shows variation indicator when engine line is clicked", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();
    mockChessgroundSet.mockClear();

    fireEvent.click(screen.getByTestId("engine-line-0"));

    await waitFor(() => {
      expect(screen.getByTestId("variation-indicator")).toBeInTheDocument();
    });
    expect(screen.getByTestId("variation-indicator")).toHaveTextContent("Viewing engine line");
    expect(screen.getByTestId("back-to-main-line")).toBeInTheDocument();
    expectLatestBoardFen("variation-fen-after-e4");
  });

  it("switches the eval bar to the selected engine line score", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();

    expect(screen.getByTestId("eval-score")).toHaveTextContent("+0.2");

    fireEvent.click(screen.getByTestId("engine-line-1"));

    await waitFor(() => {
      expect(screen.getByTestId("variation-indicator")).toBeInTheDocument();
    });
    expect(screen.getByTestId("eval-score")).toHaveTextContent("+0.1");
  });

  it("steps through variation moves on ArrowRight", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();
    mockChessgroundSet.mockClear();

    fireEvent.click(screen.getByTestId("engine-line-0"));

    await waitFor(() => {
      expectLatestBoardFen("variation-fen-after-e4");
    });

    fireEvent.keyDown(document, { key: "ArrowRight" });

    await waitFor(() => {
      expectLatestBoardFen("variation-fen-after-e5");
    });

    fireEvent.keyDown(document, { key: "ArrowRight" });

    await waitFor(() => {
      expectLatestBoardFen("variation-fen-after-nf3");
    });
  });

  it("ArrowLeft exits variation mode when pressed at the start", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();
    mockChessgroundSet.mockClear();

    fireEvent.click(screen.getByTestId("engine-line-1"));

    await waitFor(() => {
      expect(screen.getByTestId("variation-indicator")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "ArrowLeft" });

    await waitFor(() => {
      expect(screen.queryByTestId("variation-indicator")).toBeNull();
    });
    expectLatestBoardFen("start-fen");
    expect(screen.getByTestId("eval-score")).toHaveTextContent("+0.2");
  });

  it("back to main line button exits variation mode", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();

    fireEvent.click(screen.getByTestId("engine-line-0"));

    await waitFor(() => {
      expect(screen.getByTestId("variation-indicator")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("back-to-main-line"));

    await waitFor(() => {
      expect(screen.queryByTestId("variation-indicator")).toBeNull();
    });
  });

  it("escape key exits variation mode", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();

    fireEvent.click(screen.getByTestId("engine-line-0"));

    await waitFor(() => {
      expect(screen.getByTestId("variation-indicator")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("variation-indicator")).toBeNull();
    });
  });

  it("clicking a move in the move list exits variation mode", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      writable: true,
    });

    fireEvent.click(screen.getByTestId("engine-line-0"));

    await waitFor(() => {
      expect(screen.getByTestId("variation-indicator")).toBeInTheDocument();
    });

    const moveList = screen.getByTestId("analysis-move-list");
    const moveButtons = moveList.querySelectorAll("button[data-move-index]");
    if (moveButtons.length > 0) {
      fireEvent.click(moveButtons[0]);
    }

    await waitFor(() => {
      expect(screen.queryByTestId("variation-indicator")).toBeNull();
    });
  });

  it("variation indicator not shown when not in variation mode", async () => {
    await setupCompletedAnalysis();
    expect(screen.queryByTestId("variation-indicator")).toBeNull();
  });

  it("includes drawable.autoShapes in Chessground set() call", async () => {
    await setupCompletedAnalysis();

    const hasDrawable = mockChessgroundSet.mock.calls.some(
      (call) => call[0]?.drawable !== undefined,
    );
    expect(hasDrawable).toBe(true);
  });

  it("arrow shapes have correct brushes with green for top and blue for others", async () => {
    await setupCompletedAnalysis();
    mockChessForArrows();
    mockChessgroundSet.mockClear();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });

    await waitFor(() => {
      const shapes = getLatestAutoShapes();
      expect(shapes).toBeDefined();
      expect(shapes!.length).toBe(3);
    });

    const shapes = getLatestAutoShapes()!;
    expect(shapes[0]).toEqual({ orig: "e2", dest: "e4", brush: "green" });
    expect(shapes[1]).toEqual({ orig: "d2", dest: "d4", brush: "blue" });
    expect(shapes[2]).toEqual({ orig: "g1", dest: "f3", brush: "blue" });
  });

  it("arrows are hidden in variation mode", async () => {
    await setupCompletedAnalysis();
    mockChessForVariation();
    mockChessgroundSet.mockClear();

    fireEvent.click(screen.getByTestId("engine-line-0"));

    await waitFor(() => {
      expect(screen.getByTestId("variation-indicator")).toBeInTheDocument();
    });

    const shapes = getLatestAutoShapes();
    expect(shapes).toBeDefined();
    expect(shapes).toEqual([]);
  });

  it("no arrows before analysis is run", async () => {
    mockFetchSuccess({ user: { id: 1, email: "a@b.com" } });
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
    mockFetchSuccess([]);
    mockFetchError({}, 404); // no stored analysis

    renderWithProviders(<AppRoutes />, { route: "/analysis/10" });

    await waitFor(() => {
      expect(screen.getByTestId("analyze-button")).toBeInTheDocument();
    });

    const callsWithDrawable = mockChessgroundSet.mock.calls.filter(
      (call) => call[0]?.drawable?.autoShapes !== undefined,
    );
    for (const call of callsWithDrawable) {
      expect(call[0].drawable.autoShapes).toEqual([]);
    }
  });
});
