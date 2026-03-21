import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExplorerMoveTable } from "../src/components/ExplorerMoveTable.js";
import type { ExplorerMove } from "@chess/shared";

afterEach(() => {
  cleanup();
});

const mockMoves: ExplorerMove[] = [
  {
    san: "e4",
    uci: "e2e4",
    white: 400,
    draws: 300,
    black: 300,
    totalGames: 1000,
    avgRating: 2450,
    opening: { eco: "B00", name: "King's Pawn" },
  },
  {
    san: "d4",
    uci: "d2d4",
    white: 350,
    draws: 350,
    black: 300,
    totalGames: 1000,
    avgRating: 2480,
    opening: { eco: "D00", name: "Queen's Pawn" },
  },
];

describe("ExplorerMoveTable", () => {
  it("renders move rows with SAN and game count", () => {
    render(<ExplorerMoveTable moves={mockMoves} onMoveClick={vi.fn()} onHoverMove={vi.fn()} />);

    expect(screen.getByText("e4")).toBeInTheDocument();
    expect(screen.getByText("d4")).toBeInTheDocument();
    expect(screen.getAllByText("1,000")).toHaveLength(2);
  });

  it("calls onMoveClick when a row is clicked", () => {
    const onMoveClick = vi.fn();

    render(<ExplorerMoveTable moves={mockMoves} onMoveClick={onMoveClick} onHoverMove={vi.fn()} />);

    fireEvent.click(screen.getByText("e4"));
    expect(onMoveClick).toHaveBeenCalledWith("e4", "e2e4");
  });

  it("calls onHoverMove on mouse enter and leave", () => {
    const onHoverMove = vi.fn();

    render(<ExplorerMoveTable moves={mockMoves} onMoveClick={vi.fn()} onHoverMove={onHoverMove} />);

    const row = screen.getByLabelText(/e4:/);
    fireEvent.mouseEnter(row);
    expect(onHoverMove).toHaveBeenCalledWith("e2e4");

    fireEvent.mouseLeave(row);
    expect(onHoverMove).toHaveBeenCalledWith(null);
  });

  it("returns null when moves array is empty", () => {
    const { container } = render(
      <ExplorerMoveTable moves={[]} onMoveClick={vi.fn()} onHoverMove={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows percentage labels only for segments >= 15%", () => {
    const moves: ExplorerMove[] = [
      {
        san: "e4",
        uci: "e2e4",
        white: 80,
        draws: 10,
        black: 10,
        totalGames: 100,
        avgRating: 2400,
        opening: null,
      },
    ];

    render(<ExplorerMoveTable moves={moves} onMoveClick={vi.fn()} onHoverMove={vi.fn()} />);

    // 80% white should show label
    expect(screen.getByText("80%")).toBeInTheDocument();
    // 10% draw and 10% black should NOT show labels
    expect(screen.queryByText("10%")).not.toBeInTheDocument();
  });

  it("shows dash for avgRating of 0", () => {
    const moves: ExplorerMove[] = [
      {
        san: "e4",
        uci: "e2e4",
        white: 50,
        draws: 25,
        black: 25,
        totalGames: 100,
        avgRating: 0,
        opening: null,
      },
    ];

    render(<ExplorerMoveTable moves={moves} onMoveClick={vi.fn()} onHoverMove={vi.fn()} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
