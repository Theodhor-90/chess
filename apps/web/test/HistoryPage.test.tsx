import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { gameReducer } from "../src/store/gameSlice.js";
import { socketMiddleware } from "../src/store/socketMiddleware.js";
import { HistoryPage } from "../src/pages/HistoryPage.js";
import type { GameHistoryResponse } from "@chess/shared";

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

function renderWithProviders(ui: React.ReactElement) {
  const store = createTestStore();
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/history"]}>
          <Routes>
            <Route path="/history" element={ui} />
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

function mockFetchPending() {
  vi.spyOn(globalThis, "fetch").mockImplementationOnce(
    () =>
      new Promise<Response>(() => {
        // Intentionally unresolved to keep request loading.
      }),
  );
}

function makeHistoryResponse(
  items: GameHistoryResponse["items"] = [],
  total?: number,
): GameHistoryResponse {
  return {
    items,
    total: total ?? items.length,
  };
}

describe("HistoryPage", () => {
  it("renders table rows with correct data", async () => {
    mockFetchSuccess(
      makeHistoryResponse([
        {
          id: 1,
          opponentUsername: "alice",
          opponentId: 2,
          result: "win",
          resultReason: "checkmate",
          myColor: "white",
          timeControl: "10+0",
          playedAt: 1710000000,
        },
        {
          id: 2,
          opponentUsername: "bob",
          opponentId: 3,
          result: "loss",
          resultReason: "resigned",
          myColor: "black",
          timeControl: "5+3",
          playedAt: 1710100000,
        },
      ]),
    );

    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("history-row-1")).toBeInTheDocument();
    });

    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("Checkmate")).toBeInTheDocument();
    expect(screen.getByText("Resigned")).toBeInTheDocument();
    expect(screen.getByText("10+0")).toBeInTheDocument();
    expect(screen.getByText("5+3")).toBeInTheDocument();
    expect(screen.getByText(new Date(1710000000 * 1000).toLocaleDateString())).toBeInTheDocument();
    expect(screen.getByText(new Date(1710100000 * 1000).toLocaleDateString())).toBeInTheDocument();
  });

  it("previous button disabled on first page", async () => {
    mockFetchSuccess(
      makeHistoryResponse(
        [
          {
            id: 1,
            opponentUsername: "alice",
            opponentId: 2,
            result: "win",
            resultReason: "checkmate",
            myColor: "white",
            timeControl: "10+0",
            playedAt: 1710000000,
          },
        ],
        25,
      ),
    );

    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("history-row-1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("history-prev")).toBeDisabled();
    expect(screen.getByTestId("history-next")).not.toBeDisabled();
    expect(screen.getByTestId("history-page-info")).toHaveTextContent("Page 1 of 2");
  });

  it("next button disabled on last page", async () => {
    mockFetchSuccess(
      makeHistoryResponse([
        {
          id: 1,
          opponentUsername: "alice",
          opponentId: 2,
          result: "win",
          resultReason: "checkmate",
          myColor: "white",
          timeControl: "10+0",
          playedAt: 1710000000,
        },
        {
          id: 2,
          opponentUsername: "bob",
          opponentId: 3,
          result: "loss",
          resultReason: "resigned",
          myColor: "black",
          timeControl: "5+3",
          playedAt: 1710100000,
        },
      ]),
    );

    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("history-row-1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("history-next")).toBeDisabled();
    expect(screen.getByTestId("history-prev")).toBeDisabled();
    expect(screen.getByTestId("history-page-info")).toHaveTextContent("Page 1 of 1");
  });

  it("filter dropdown changes displayed results", async () => {
    mockFetchSuccess(
      makeHistoryResponse([
        {
          id: 1,
          opponentUsername: "alice",
          opponentId: 2,
          result: "win",
          resultReason: "checkmate",
          myColor: "white",
          timeControl: "10+0",
          playedAt: 1710000000,
        },
        {
          id: 2,
          opponentUsername: "bob",
          opponentId: 3,
          result: "loss",
          resultReason: "resigned",
          myColor: "black",
          timeControl: "5+3",
          playedAt: 1710100000,
        },
      ]),
    );

    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("history-row-1")).toBeInTheDocument();
    });

    mockFetchSuccess(
      makeHistoryResponse([
        {
          id: 1,
          opponentUsername: "alice",
          opponentId: 2,
          result: "win",
          resultReason: "checkmate",
          myColor: "white",
          timeControl: "10+0",
          playedAt: 1710000000,
        },
      ]),
    );

    fireEvent.change(screen.getByTestId("history-filter"), { target: { value: "win" } });

    await waitFor(() => {
      expect(screen.queryByText("bob")).not.toBeInTheDocument();
    });

    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("row click navigates to analysis page", async () => {
    mockFetchSuccess(
      makeHistoryResponse([
        {
          id: 42,
          opponentUsername: "alice",
          opponentId: 2,
          result: "win",
          resultReason: "checkmate",
          myColor: "white",
          timeControl: "10+0",
          playedAt: 1710000000,
        },
      ]),
    );

    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("history-row-42")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("history-row-42"));

    await waitFor(() => {
      expect(screen.getByTestId("analysis-page")).toBeInTheDocument();
    });
  });

  it("empty state display when no games match", async () => {
    mockFetchSuccess(makeHistoryResponse([], 0));

    renderWithProviders(<HistoryPage />);

    await waitFor(() => {
      expect(screen.getByTestId("history-empty")).toBeInTheDocument();
    });

    expect(screen.getByTestId("history-empty")).toHaveTextContent("No games found.");
  });

  it("loading state", () => {
    mockFetchPending();

    renderWithProviders(<HistoryPage />);

    expect(screen.getByTestId("history-loading")).toBeInTheDocument();
  });
});
