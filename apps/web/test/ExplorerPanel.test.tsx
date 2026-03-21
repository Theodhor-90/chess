import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { ExplorerPanel } from "../src/components/ExplorerPanel.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
});

function createTestStore() {
  return configureStore({
    reducer: {
      [apiSlice.reducerPath]: apiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
  });
}

function renderWithStore(ui: React.ReactElement) {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

const EMPTY_EXPLORER = { opening: null, white: 0, draws: 0, black: 0, moves: [], topGames: [] };

function mockFetchAuthenticated(user: { id: number; email: string; username: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/me")) {
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(EMPTY_EXPLORER), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function mockFetchUnauthenticated() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/me")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(EMPTY_EXPLORER), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("ExplorerPanel", () => {
  it("renders three tabs", () => {
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Masters" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Engine" })).toBeInTheDocument();
  });

  it("Masters tab is selected by default", () => {
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Masters" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Platform" })).toHaveAttribute("aria-selected", "false");
  });

  it("switches tabs on click", () => {
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Platform" }));
    expect(screen.getByRole("tab", { name: "Platform" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Masters" })).toHaveAttribute("aria-selected", "false");
  });

  it("renders the panel container with test id", () => {
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("explorer-panel")).toBeInTheDocument();
  });

  it("persists active tab to localStorage on switch", () => {
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Platform" }));
    expect(localStorage.getItem("explorer-tab")).toBe("platform");
  });

  it("restores active tab from localStorage on mount", () => {
    localStorage.setItem("explorer-tab", "engine");

    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Engine" })).toHaveAttribute("aria-selected", "true");
  });

  it("does not show 'My Games' tab when not authenticated", async () => {
    mockFetchUnauthenticated();
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: "My Games" })).not.toBeInTheDocument();
    });
  });

  it("shows 'My Games' tab when authenticated", async () => {
    mockFetchAuthenticated({ id: 1, email: "player@test.com", username: "player_one" });
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "My Games" })).toBeInTheDocument();
    });
  });

  it("does not show overlay toggle when not authenticated", async () => {
    mockFetchUnauthenticated();
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Show my stats")).not.toBeInTheDocument();
    });
  });

  it("shows overlay toggle when authenticated on Masters tab", async () => {
    mockFetchAuthenticated({ id: 1, email: "player@test.com", username: "player_one" });
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Show my stats")).toBeInTheDocument();
    });
  });

  it("persists overlay toggle state to localStorage when toggled", async () => {
    mockFetchAuthenticated({ id: 1, email: "player@test.com", username: "player_one" });
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Show my stats")).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText("Show my stats") as HTMLInputElement;
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem("explorer-personal-overlay")).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(localStorage.getItem("explorer-personal-overlay")).toBe("false");
  });

  it("reads overlay toggle state from localStorage on mount", async () => {
    localStorage.setItem("explorer-personal-overlay", "true");
    mockFetchAuthenticated({ id: 1, email: "player@test.com", username: "player_one" });
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
        onArrowsChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const toggle = screen.getByLabelText("Show my stats") as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });
  });
});
