import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTrainingDrill } from "../../src/hooks/useTrainingDrill.js";

const mockTriggerGetNext = vi.fn();
const mockSubmitReview = vi.fn();

vi.mock("../../src/store/apiSlice.js", () => ({
  useLazyGetTrainingNextQuery: () => [mockTriggerGetNext],
  useSubmitTrainingReviewMutation: () => [mockSubmitReview],
  useGetTrainingStatsQuery: () => ({ data: null }),
}));

const sampleLine = [
  {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
    san: null,
    uci: null,
    isUserMove: false,
    cardId: null,
    isDue: false,
  },
  {
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
    san: "e4",
    uci: "e2e4",
    isUserMove: false,
    cardId: null,
    isDue: false,
  },
  {
    fen: "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    san: "e6",
    uci: "e7e6",
    isUserMove: true,
    cardId: 42,
    isDue: true,
  },
];

function setupDefaultMock() {
  mockTriggerGetNext.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        line: sampleLine,
        dueCount: 5,
        newCount: 2,
      }),
  });
  mockSubmitReview.mockReturnValue({
    unwrap: () => Promise.resolve({ card: {}, nextDue: 0, interval: 1 }),
  });
}

describe("useTrainingDrill", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupDefaultMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts in loading phase and transitions to idle after fetching line", async () => {
    const { result } = renderHook(() => useTrainingDrill(1));

    expect(result.current.phase).toBe("loading");

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.dueCount).toBe(5);
    expect(result.current.newCount).toBe(2);
  });

  it("transitions to session_complete when no line available", async () => {
    mockTriggerGetNext.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          line: null,
          dueCount: 0,
          newCount: 0,
        }),
    });

    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.phase).toBe("session_complete");
  });

  it("startLine advances through opponent moves to user_turn", async () => {
    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.phase).toBe("idle");

    act(() => {
      result.current.startLine();
    });

    expect(result.current.phase).toBe("opponent_turn");

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.phase).toBe("user_turn");
    expect(result.current.currentFen).toContain(
      "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    );
  });

  it("correct move transitions through feedback to line_complete", async () => {
    const perfSpy = vi.spyOn(performance, "now");
    perfSpy.mockReturnValue(0);

    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.startLine();
    });

    perfSpy.mockReturnValue(3000);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.phase).toBe("user_turn");

    perfSpy.mockReturnValue(6000);

    act(() => {
      result.current.makeMove("e7", "e6");
    });

    expect(result.current.phase).toBe("feedback");
    expect(result.current.feedbackType).toBe("correct");
    expect(result.current.sessionStats.correct).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.phase).toBe("line_complete");
    expect(mockSubmitReview).toHaveBeenCalledWith({
      repertoireId: 1,
      body: { cardId: 42, rating: 3 },
    });
  });

  it("wrong move stays at same position", async () => {
    const perfSpy = vi.spyOn(performance, "now");
    perfSpy.mockReturnValue(0);

    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.startLine();
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.phase).toBe("user_turn");

    act(() => {
      result.current.makeMove("d7", "d5");
    });

    expect(result.current.phase).toBe("feedback");
    expect(result.current.feedbackType).toBe("wrong");
    expect(result.current.sessionStats.incorrect).toBe(1);
    expect(mockSubmitReview).toHaveBeenCalledWith({
      repertoireId: 1,
      body: { cardId: 42, rating: 1 },
    });

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.phase).toBe("user_turn");
  });

  it("hint sets hintActive and downgrades rating to Hard", async () => {
    const perfSpy = vi.spyOn(performance, "now");
    perfSpy.mockReturnValue(0);

    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.startLine();
    });

    perfSpy.mockReturnValue(3000);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.phase).toBe("user_turn");

    act(() => {
      result.current.useHint();
    });

    expect(result.current.sessionStats.hintUsed).toBe(1);

    act(() => {
      result.current.makeMove("e7", "e6");
    });

    expect(mockSubmitReview).toHaveBeenCalledWith({
      repertoireId: 1,
      body: { cardId: 42, rating: 2 },
    });
  });

  it("fast correct move gets Easy rating", async () => {
    const perfSpy = vi.spyOn(performance, "now");
    perfSpy.mockReturnValue(1000);

    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.startLine();
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.phase).toBe("user_turn");

    perfSpy.mockReturnValue(2500);

    act(() => {
      result.current.makeMove("e7", "e6");
    });

    expect(mockSubmitReview).toHaveBeenCalledWith({
      repertoireId: 1,
      body: { cardId: 42, rating: 4 },
    });
  });

  it("endSession transitions to session_complete", async () => {
    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.phase).toBe("idle");

    act(() => {
      result.current.endSession();
    });

    expect(result.current.phase).toBe("session_complete");
  });

  it("nextLine fetches new line after line_complete", async () => {
    const perfSpy = vi.spyOn(performance, "now");
    perfSpy.mockReturnValue(0);

    const { result } = renderHook(() => useTrainingDrill(1));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.startLine();
    });

    perfSpy.mockReturnValue(3000);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    act(() => {
      result.current.makeMove("e7", "e6");
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.phase).toBe("line_complete");

    const callCountBefore = mockTriggerGetNext.mock.calls.length;

    await act(async () => {
      result.current.nextLine();
      await vi.runAllTimersAsync();
    });

    expect(mockTriggerGetNext.mock.calls.length).toBeGreaterThan(callCountBefore);
  });
});
