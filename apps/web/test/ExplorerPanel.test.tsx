import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "../src/store/apiSlice.js";
import { ExplorerPanel } from "../src/components/ExplorerPanel.js";

afterEach(() => {
  cleanup();
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
  return render(<Provider store={store}>{ui}</Provider>);
}

describe("ExplorerPanel", () => {
  it("renders three tabs", () => {
    renderWithStore(
      <ExplorerPanel
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        onMoveClick={vi.fn()}
        onHoverMove={vi.fn()}
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
      />,
    );

    expect(screen.getByTestId("explorer-panel")).toBeInTheDocument();
  });
});
