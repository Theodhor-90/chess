import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExplorerPersonalOverlay } from "../src/components/ExplorerPersonalOverlay.js";
import type { ExplorerMove } from "@chess/shared";

afterEach(() => {
  cleanup();
});

function createMove(overrides: Partial<ExplorerMove> = {}): ExplorerMove {
  return {
    san: "e4",
    uci: "e2e4",
    white: 3,
    draws: 1,
    black: 2,
    totalGames: 6,
    avgRating: 1500,
    opening: null,
    ...overrides,
  };
}

describe("ExplorerPersonalOverlay", () => {
  it("renders nothing when move has zero total games", () => {
    const move = createMove({ totalGames: 0, white: 0, draws: 0, black: 0 });
    const { container } = render(<ExplorerPersonalOverlay move={move} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders overlay row with correct win/draw/loss stats", () => {
    const move = createMove({ san: "e4", white: 5, draws: 2, black: 1, totalGames: 8 });
    render(<ExplorerPersonalOverlay move={move} />);
    expect(screen.getByText("You:")).toBeInTheDocument();
    expect(screen.getByText("5w")).toBeInTheDocument();
    expect(screen.getByText("2d")).toBeInTheDocument();
    expect(screen.getByText("1l")).toBeInTheDocument();
  });

  it("sets data-move-san attribute for matching", () => {
    const move = createMove({ san: "d4" });
    const { container } = render(<ExplorerPersonalOverlay move={move} />);
    const row = container.querySelector("[data-move-san='d4']");
    expect(row).not.toBeNull();
  });
});
