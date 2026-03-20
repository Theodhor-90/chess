import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { PuzzlePage } from "../src/pages/PuzzlePage.js";

// Mock the API module
vi.mock("../src/api.js", () => ({
  getNextPuzzle: vi.fn(),
  submitPuzzleAttempt: vi.fn(),
  getPuzzleStats: vi.fn(),
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

import { getNextPuzzle, submitPuzzleAttempt, getPuzzleStats } from "../src/api.js";
import { Chessground } from "chessground";
import type { Puzzle } from "@chess/shared";
import type { Key } from "chessground/types";

const mockGetNextPuzzle = getNextPuzzle as ReturnType<typeof vi.fn>;
const _mockSubmitAttempt = submitPuzzleAttempt as ReturnType<typeof vi.fn>;
const mockGetPuzzleStats = getPuzzleStats as ReturnType<typeof vi.fn>;
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
    mockGetPuzzleStats.mockResolvedValue({
      rating: 1500,
      ratingDeviation: 350,
      totalAttempts: 10,
      totalSolved: 6,
      solveRate: 0.6,
      recentAttempts: [],
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
    expect(screen.getByTestId("puzzle-rating")).toHaveTextContent("1500");
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

  it("calls getPuzzleStats on mount", () => {
    mockGetNextPuzzle.mockReturnValue(new Promise(() => {}));
    render(<PuzzlePage />);
    expect(mockGetPuzzleStats).toHaveBeenCalledTimes(1);
  });

  it("displays stats panel with puzzle statistics", async () => {
    mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(screen.getByTestId("puzzle-stats")).toBeInTheDocument();
    });
    expect(screen.getByTestId("stats-rating")).toHaveTextContent("1500");
    expect(screen.getByTestId("stats-solved")).toHaveTextContent("6");
    expect(screen.getByTestId("stats-attempted")).toHaveTextContent("10");
    expect(screen.getByTestId("stats-solve-rate")).toHaveTextContent("60%");
  });

  it("does not show stats panel when stats fetch fails", async () => {
    mockGetPuzzleStats.mockRejectedValue(new Error("Unauthorized"));
    mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(screen.getByTestId("puzzle-page")).toBeInTheDocument();
    });
    // Wait a tick for the stats promise to reject
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("puzzle-stats")).not.toBeInTheDocument();
  });

  it("renders View Solution button in failed state", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
      _mockSubmitAttempt.mockResolvedValue({
        correct: false,
        solution: ["e7e5", "d2d4", "e5d4"],
        ratingBefore: 1500,
        ratingAfter: 1483,
        ratingDelta: -17,
      });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });

      // Advance setup animation timer
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Find the onUserMove callback from the Chessground.set calls
      const allSetCalls = mockChessgroundSet.mock.calls;
      const callWithMovable = [...allSetCalls]
        .reverse()
        .find((call) => call[0].movable?.events?.after);
      expect(callWithMovable).toBeDefined();
      const onUserMove = callWithMovable![0].movable.events.after;

      // Simulate a wrong move (puzzle expects "e7e5" at index 1 but user plays "a7a6")
      act(() => {
        onUserMove("a7" as Key, "a6" as Key);
      });

      await waitFor(() => {
        expect(screen.getByTestId("puzzle-failed")).toBeInTheDocument();
      });
      expect(screen.getByText("Incorrect")).toBeInTheDocument();
      expect(screen.getByTestId("view-solution-button")).toBeInTheDocument();
      expect(screen.getByTestId("next-puzzle-button")).toBeInTheDocument();

      // Verify rating change is displayed after API responds
      await waitFor(() => {
        expect(screen.getByTestId("puzzle-rating-change")).toBeInTheDocument();
      });
      expect(screen.getByText(/-17/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders success banner on solved puzzle", async () => {
    // Use a simple 2-move puzzle: setup + 1 user move
    const simplePuzzle: Puzzle = {
      ...samplePuzzle,
      puzzleId: "test_simple",
      moves: ["e2e4", "e7e5"], // setup: e2e4, user must play: e7e5
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: simplePuzzle });
      _mockSubmitAttempt.mockResolvedValue({
        correct: true,
        solution: ["e7e5"],
        ratingBefore: 1500,
        ratingAfter: 1517,
        ratingDelta: 17,
      });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });

      // Advance setup animation
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Capture onUserMove from Chessground.set
      const allSetCalls = mockChessgroundSet.mock.calls;
      const callWithMovable = [...allSetCalls]
        .reverse()
        .find((call) => call[0].movable?.events?.after);
      expect(callWithMovable).toBeDefined();
      const onUserMove = callWithMovable![0].movable.events.after;

      // Simulate correct move
      act(() => {
        onUserMove("e7" as Key, "e5" as Key);
      });

      await waitFor(() => {
        expect(screen.getByTestId("puzzle-solved")).toBeInTheDocument();
      });
      expect(screen.getByText("Puzzle Solved!")).toBeInTheDocument();
      expect(screen.getByTestId("next-puzzle-button")).toBeInTheDocument();

      // Verify rating change
      await waitFor(() => {
        expect(screen.getByTestId("puzzle-rating-change")).toBeInTheDocument();
      });
      expect(screen.getByText(/\+17/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Next Puzzle button loads a new puzzle", async () => {
    const simplePuzzle: Puzzle = {
      ...samplePuzzle,
      puzzleId: "test_simple_2",
      moves: ["e2e4", "e7e5"],
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: simplePuzzle });
      _mockSubmitAttempt.mockResolvedValue({
        correct: true,
        solution: ["e7e5"],
        ratingBefore: 1500,
        ratingAfter: 1517,
        ratingDelta: 17,
      });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      const allSetCalls = mockChessgroundSet.mock.calls;
      const callWithMovable = [...allSetCalls]
        .reverse()
        .find((call) => call[0].movable?.events?.after);
      const onUserMove = callWithMovable![0].movable.events.after;

      act(() => {
        onUserMove("e7" as Key, "e5" as Key);
      });

      await waitFor(() => {
        expect(screen.getByTestId("puzzle-solved")).toBeInTheDocument();
      });

      // Click Next Puzzle
      const nextButton = screen.getByTestId("next-puzzle-button");
      expect(mockGetNextPuzzle).toHaveBeenCalledTimes(1);

      // Setup mock for next puzzle
      const nextPuzzle: Puzzle = {
        ...samplePuzzle,
        puzzleId: "test_next",
        rating: 1600,
      };
      mockGetNextPuzzle.mockResolvedValue({ puzzle: nextPuzzle });

      act(() => {
        nextButton.click();
      });

      expect(mockGetNextPuzzle).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders Lichess game link", async () => {
    mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
    render(<PuzzlePage />);
    await waitFor(() => {
      expect(screen.getByTestId("puzzle-page")).toBeInTheDocument();
    });

    const link = screen.getByTestId("lichess-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://lichess.org/abc123#31");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("View on Lichess");
  });

  it("Enter key triggers next puzzle in solved state", async () => {
    const simplePuzzle: Puzzle = {
      ...samplePuzzle,
      puzzleId: "test_enter_key",
      moves: ["e2e4", "e7e5"],
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: simplePuzzle });
      _mockSubmitAttempt.mockResolvedValue({
        correct: true,
        solution: ["e7e5"],
        ratingBefore: 1500,
        ratingAfter: 1517,
        ratingDelta: 17,
      });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      const allSetCalls = mockChessgroundSet.mock.calls;
      const callWithMovable = [...allSetCalls]
        .reverse()
        .find((call) => call[0].movable?.events?.after);
      const onUserMove = callWithMovable![0].movable.events.after;

      act(() => {
        onUserMove("e7" as Key, "e5" as Key);
      });

      await waitFor(() => {
        expect(screen.getByTestId("puzzle-solved")).toBeInTheDocument();
      });

      // Record the number of getNextPuzzle calls before pressing Enter
      const callsBefore = mockGetNextPuzzle.mock.calls.length;

      // Press Enter key
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      });

      expect(mockGetNextPuzzle).toHaveBeenCalledTimes(callsBefore + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Space key triggers next puzzle in failed state", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
      _mockSubmitAttempt.mockResolvedValue({
        correct: false,
        solution: ["e7e5", "d2d4", "e5d4"],
        ratingBefore: 1500,
        ratingAfter: 1483,
        ratingDelta: -17,
      });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      const allSetCalls = mockChessgroundSet.mock.calls;
      const callWithMovable = [...allSetCalls]
        .reverse()
        .find((call) => call[0].movable?.events?.after);
      const onUserMove = callWithMovable![0].movable.events.after;

      // Wrong move triggers failed state
      act(() => {
        onUserMove("a7" as Key, "a6" as Key);
      });

      await waitFor(() => {
        expect(screen.getByTestId("puzzle-failed")).toBeInTheDocument();
      });

      const callsBefore = mockGetNextPuzzle.mock.calls.length;

      // Press Space key
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
      });

      expect(mockGetNextPuzzle).toHaveBeenCalledTimes(callsBefore + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keyboard shortcut does not fire during userTurn state", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: samplePuzzle });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Now in userTurn state
      await waitFor(() => {
        expect(screen.getByText("Your turn — find the best move")).toBeInTheDocument();
      });

      const callsBefore = mockGetNextPuzzle.mock.calls.length;

      // Press Enter — should NOT trigger loadPuzzle
      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      });

      // getNextPuzzle should NOT have been called again
      expect(mockGetNextPuzzle).toHaveBeenCalledTimes(callsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows loading skeleton when loading next puzzle", async () => {
    const simplePuzzle: Puzzle = {
      ...samplePuzzle,
      puzzleId: "test_skeleton_next",
      moves: ["e2e4", "e7e5"],
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockGetNextPuzzle.mockResolvedValue({ puzzle: simplePuzzle });
      _mockSubmitAttempt.mockResolvedValue({
        correct: true,
        solution: ["e7e5"],
        ratingBefore: 1500,
        ratingAfter: 1517,
        ratingDelta: 17,
      });
      render(<PuzzlePage />);
      await waitFor(() => {
        expect(mockChessground).toHaveBeenCalled();
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      const allSetCalls = mockChessgroundSet.mock.calls;
      const callWithMovable = [...allSetCalls]
        .reverse()
        .find((call) => call[0].movable?.events?.after);
      const onUserMove = callWithMovable![0].movable.events.after;

      act(() => {
        onUserMove("e7" as Key, "e5" as Key);
      });

      await waitFor(() => {
        expect(screen.getByTestId("puzzle-solved")).toBeInTheDocument();
      });

      // Make next getNextPuzzle never resolve to hold the loading state
      mockGetNextPuzzle.mockReturnValue(new Promise(() => {}));

      // Click Next Puzzle
      act(() => {
        screen.getByTestId("next-puzzle-button").click();
      });

      // Should show loading skeleton
      await waitFor(() => {
        expect(screen.getByTestId("puzzle-loading")).toBeInTheDocument();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
