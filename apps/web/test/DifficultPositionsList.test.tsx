import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { DifficultPositionsResponse } from "@chess/shared";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock Chessground — jsdom doesn't support canvas
vi.mock("chessground", () => ({
  Chessground: () => ({
    set: vi.fn(),
    destroy: vi.fn(),
  }),
}));

// Mock BoardThemeProvider
vi.mock("../src/components/BoardThemeProvider.js", () => ({
  useBoardTheme: () => ({ boardTheme: "brown", pieceTheme: "cburnett" }),
}));

// Default mock data
const defaultPositions: DifficultPositionsResponse = [
  {
    cardId: 1,
    repertoireId: 10,
    repertoireName: "Sicilian Defense",
    positionFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
    moveSan: "c5",
    moveUci: "c7c5",
    lapses: 5,
    stability: 2.3,
    lastReview: 1711065600,
  },
  {
    cardId: 2,
    repertoireId: 11,
    repertoireName: "French Defense",
    positionFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
    moveSan: "e6",
    moveUci: "e7e6",
    lapses: 3,
    stability: 4.1,
    lastReview: 1711065600,
  },
];

let mockQueryReturn: {
  data: DifficultPositionsResponse | undefined;
  isLoading: boolean;
} = {
  data: defaultPositions,
  isLoading: false,
};

vi.mock("../src/store/apiSlice.js", () => ({
  useGetDifficultPositionsQuery: () => mockQueryReturn,
}));

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
  mockQueryReturn = {
    data: defaultPositions,
    isLoading: false,
  };
});

async function renderList() {
  const { DifficultPositionsList } = await import("../src/components/DifficultPositionsList.js");
  return render(
    <MemoryRouter>
      <DifficultPositionsList />
    </MemoryRouter>,
  );
}

describe("DifficultPositionsList", () => {
  it("renders nothing while loading", async () => {
    mockQueryReturn = { data: undefined, isLoading: true };
    const { container } = await renderList();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when positions array is empty", async () => {
    mockQueryReturn = { data: [], isLoading: false };
    const { container } = await renderList();
    expect(container.innerHTML).toBe("");
  });

  it("renders difficult positions with correct details", async () => {
    await renderList();
    expect(screen.getByText("Difficult Positions")).toBeTruthy();
    expect(screen.getByTestId("difficult-positions")).toBeTruthy();

    // Check first position
    expect(screen.getByText("Sicilian Defense")).toBeTruthy();
    expect(screen.getByText("c5")).toBeTruthy();
    expect(screen.getByText("Failed 5 times")).toBeTruthy();
    expect(screen.getByText("Stability: 2.3d")).toBeTruthy();

    // Check second position
    expect(screen.getByText("French Defense")).toBeTruthy();
    expect(screen.getByText("e6")).toBeTruthy();
    expect(screen.getByText("Failed 3 times")).toBeTruthy();
  });

  it("navigates to repertoire builder on click", async () => {
    await renderList();

    const item = screen.getByTestId("difficult-position-1");
    fireEvent.click(item);
    expect(mockNavigate).toHaveBeenCalledWith("/repertoires/10");
  });

  it("renders correct number of position items", async () => {
    await renderList();
    expect(screen.getByTestId("difficult-position-1")).toBeTruthy();
    expect(screen.getByTestId("difficult-position-2")).toBeTruthy();
  });
});
