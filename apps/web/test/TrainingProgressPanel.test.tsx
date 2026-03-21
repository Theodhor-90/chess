import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrainingProgressPanel } from "../src/components/TrainingProgressPanel.js";

const mockStatsData = {
  totalCards: 20,
  newCount: 5,
  learningCount: 3,
  reviewCount: 10,
  relearningCount: 2,
  dueToday: 8,
  dueTomorrow: 4,
  averageRetention: 0.87,
  streak: 3,
  totalReviews: 45,
};

vi.mock("../src/store/apiSlice.js", () => ({
  useGetTrainingStatsQuery: () => ({ data: mockStatsData }),
}));

afterEach(() => {
  cleanup();
});

describe("TrainingProgressPanel", () => {
  it("renders line progress text and progress bar", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 3, total: 8 }}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={5}
        newCount={2}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("line-progress-text")).toHaveTextContent("Move 3 of 8");
    expect(screen.getByTestId("progress-bar-fill")).toHaveStyle({ width: "38%" });
  });

  it("renders session stats with correct/incorrect/hints counts", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 0, total: 0 }}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={5}
        newCount={0}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("stat-correct")).toHaveTextContent("5");
    expect(screen.getByTestId("stat-incorrect")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-hints")).toHaveTextContent("1");
  });

  it("renders due count text", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 0, total: 0 }}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={15}
        newCount={0}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("due-count-text")).toHaveTextContent("15 cards remaining");
  });

  it("renders singular due count text", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 0, total: 0 }}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={1}
        newCount={0}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("due-count-text")).toHaveTextContent("1 card remaining");
  });

  it("renders new count text when newCount > 0", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 0, total: 0 }}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={5}
        newCount={3}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("new-count-text")).toHaveTextContent("3 new cards available");
  });

  it("hides new count text when newCount is 0", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 0, total: 0 }}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={5}
        newCount={0}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.queryByTestId("new-count-text")).toBeNull();
  });

  it("renders retention badge from stats", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 0, total: 0 }}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={5}
        newCount={0}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.getByText("87%")).toBeInTheDocument();
  });

  it("renders progress bar at 0% when total is 0", () => {
    render(
      <TrainingProgressPanel
        lineProgress={{ current: 0, total: 0 }}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={5}
        newCount={0}
        phase="user_turn"
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("progress-bar-fill")).toHaveStyle({ width: "0%" });
  });
});
