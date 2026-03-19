import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { PuzzlePage } from "../src/pages/PuzzlePage.js";

// Mock the API module
vi.mock("../src/api.js", () => ({
  getNextPuzzle: vi.fn(),
  submitPuzzleAttempt: vi.fn(),
}));

// Mock Chessground — returns a controllable API stub
const mockChessgroundSet = vi.fn();
const mockChessgroundDestroy = vi.fn();
const mockChessgroundRedrawAll = vi.fn();
vi.mock("chessground", () => ({
  Chessground: vi.fn(() => ({
    set: mockChessgroundSet,
    destroy: mockChessgroundDestroy,
    redrawAll: mockChessgroundRedrawAll,
  })),
}));

// Mock board theme provider
vi.mock("../src/components/BoardThemeProvider.js", () => ({
  useBoardTheme: () => ({ boardTheme: "brown", pieceTheme: "cburnett" }),
}));

import { getNextPuzzle, submitPuzzleAttempt } from "../src/api.js";
import { Chessground } from "chessground";
import type { Puzzle } from "@chess/shared";

const mockGetNextPuzzle = getNextPuzzle as ReturnType<typeof vi.fn>;
const _mockSubmitAttempt = submitPuzzleAttempt as ReturnType<typeof vi.fn>;
const mockChessground = Chessground as ReturnType<typeof vi.fn>;

// Position: white to move. e4 is legal, then black plays d5, then white plays exd5.
// FEN has open e-file for pawns.
const samplePuzzle: Puzzle = {
  puzzleId: "test_001",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  moves: ["e2e4", "e7e5", "d2d4", "e5d4"],
  rating: 1500,
  ratingDeviation: 75,
  popularity: 95,
  nbPlays: 12345,
  themes: ["middlegame", "short"],
  gameUrl: "https://lichess.org/abc123#31",
  openingTags: null,
};

describe("PuzzlePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    _mockSubmitAttempt.mockResolvedValue({
      correct: true,
      solution: ["e7e5", "d2d4", "e5d4"],
      ratingBefore: 1500,
      ratingAfter: 1517,
      ratingDelta: 17,
    });
  });

  it("shows loading skeleton while fetching puzzle", () => {
    mockGetNextPuzzle.mockReturnValue(new Promise(() => {}));
    render(<PuzzlePage />);
    expect(screen.getByTestId("puzzle-loading")).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    mockGetNextPuzzle.mockRejectedValue(new Error("Network error"));
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(screen.getByTestId("puzzle-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("renders puzzle board after loading", async () => {
    mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(screen.getByTestId("puzzle-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("puzzle-board")).toBeInTheDocument();
    expect(mockChessground).toHaveBeenCalled();
  });

  it("displays puzzle rating and themes", async () => {
    mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(screen.getByTestId("puzzle-rating")).toBeInTheDocument();
    });
    expect(screen.getByText("1500")).toBeInTheDocument();
    expect(screen.getByText("middlegame")).toBeInTheDocument();
    expect(screen.getByText("short")).toBeInTheDocument();
  });

  it("initializes Chessground with puzzle FEN and correct orientation", async () => {
    mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(mockChessground).toHaveBeenCalled();
    });
    const initConfig = mockChessground.mock.calls[0][1];
    // FEN has "w" to move, so white makes setup, user plays black
    expect(initConfig.fen).toBe(samplePuzzle.fen);
    expect(initConfig.orientation).toBe("black");
    expect(initConfig.viewOnly).toBe(true);
  });

  it("animates setup move after delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });
      expect(screen.getByText(/Watch the opponent/)).toBeInTheDocument();

      // Advance the 500ms timer for setup move animation
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Chessground.set should have been called with the new FEN (after setup move e2e4)
      expect(mockChessgroundSet).toHaveBeenCalled();
      // The sync effect may fire after the timer, adding a call without viewOnly.
      // Search backward for the setup timer call that has viewOnly defined.
      const allCalls = mockChessgroundSet.mock.calls;
      const setupCall = [...allCalls].reverse().find((call) => call[0].viewOnly !== undefined);
      expect(setupCall).toBeDefined();
      const setupConfig = setupCall![0];
      expect(setupConfig.viewOnly).toBe(false);
      expect(setupConfig.movable).toBeDefined();
      expect(setupConfig.movable.color).toBe("black");

      await waitFor(() => {
        expect(screen.getByText("Your turn — find the best move")).toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls getNextPuzzle on mount", () => {
    mockGetNextPuzzle.mockReturnValue(new Promise(() => {}));
    render(<PuzzlePage />);
    expect(mockGetNextPuzzle).toHaveBeenCalledTimes(1);
  });

  it("shows error when no puzzles are available", async () => {
    mockGetNextPuzzle.mockRejectedValue(new Error("No puzzles available"));
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(screen.getByTestId("puzzle-error")).toBeInTheDocument();
    });
    expect(screen.getByText("No puzzles available")).toBeInTheDocument();
  });
});
