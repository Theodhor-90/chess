import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ExplorerTopGames } from "../src/components/ExplorerTopGames.js";
import type { ExplorerTopGame } from "@chess/shared";

afterEach(() => {
  cleanup();
});

const mockGames: ExplorerTopGame[] = [
  {
    id: 101,
    white: "Carlsen, M",
    black: "Caruana, F",
    whiteRating: 2882,
    blackRating: 2820,
    result: "1-0",
    year: 2019,
  },
  {
    id: 102,
    white: "Ding, L",
    black: "Nepomniachtchi, I",
    whiteRating: 2806,
    blackRating: 2795,
    result: "1/2-1/2",
    year: 2023,
  },
  {
    id: 103,
    white: "Kasparov, G",
    black: "Karpov, A",
    whiteRating: 2851,
    blackRating: 2780,
    result: "0-1",
    year: 1990,
  },
];

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ExplorerTopGames", () => {
  it("renders nothing when games array is empty", () => {
    const { container } = renderWithRouter(<ExplorerTopGames games={[]} source="masters" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Top Games header with game entries", () => {
    renderWithRouter(<ExplorerTopGames games={mockGames} source="masters" />);

    expect(screen.getByText("Top Games")).toBeInTheDocument();
    expect(screen.getByText("Carlsen, M")).toBeInTheDocument();
    expect(screen.getByText("Caruana, F")).toBeInTheDocument();
    expect(screen.getByText("2019")).toBeInTheDocument();
  });

  it("displays result badges with correct variant", () => {
    renderWithRouter(<ExplorerTopGames games={mockGames} source="masters" />);

    // "1-0" should be rendered as text inside a badge
    expect(screen.getByText("1-0")).toBeInTheDocument();
    // "1/2-1/2" should be rendered as "½-½"
    expect(screen.getByText("½-½")).toBeInTheDocument();
    // "0-1" should be rendered
    expect(screen.getByText("0-1")).toBeInTheDocument();
  });

  it("shows player ratings", () => {
    renderWithRouter(<ExplorerTopGames games={mockGames} source="masters" />);

    expect(screen.getByText("2882")).toBeInTheDocument();
    expect(screen.getByText("2820")).toBeInTheDocument();
  });

  it("collapses and expands on header click", () => {
    renderWithRouter(<ExplorerTopGames games={mockGames} source="masters" />);

    // Initially expanded
    expect(screen.getByText("Carlsen, M")).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText("Top Games"));
    expect(screen.queryByText("Carlsen, M")).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText("Top Games"));
    expect(screen.getByText("Carlsen, M")).toBeInTheDocument();
  });

  it("header button has correct aria-expanded attribute", () => {
    renderWithRouter(<ExplorerTopGames games={mockGames} source="masters" />);

    const header = screen.getByText("Top Games").closest("button")!;
    expect(header).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("limits display to 8 games", () => {
    const manyGames: ExplorerTopGame[] = Array.from({ length: 12 }, (_, i) => ({
      id: 200 + i,
      white: `Player W${i}`,
      black: `Player B${i}`,
      whiteRating: 2500 + i,
      blackRating: 2400 + i,
      result: "1-0",
      year: 2020 + i,
    }));

    renderWithRouter(<ExplorerTopGames games={manyGames} source="masters" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(8);
  });
});
