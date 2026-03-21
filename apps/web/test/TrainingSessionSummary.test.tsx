import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrainingSessionSummary } from "../src/components/TrainingSessionSummary.js";

vi.mock("../src/store/apiSlice.js", () => ({
  useGetTrainingStatsQuery: () => ({
    data: {
      totalCards: 20,
      newCount: 5,
      learningCount: 3,
      reviewCount: 10,
      relearningCount: 2,
      dueToday: 0,
      dueTomorrow: 4,
      averageRetention: 0.85,
      streak: 3,
      totalReviews: 45,
    },
  }),
}));

afterEach(() => {
  cleanup();
});

describe("TrainingSessionSummary", () => {
  it("renders nothing when isOpen is false", () => {
    render(
      <TrainingSessionSummary
        isOpen={false}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={3}
        newCount={2}
        repertoireId={1}
      />,
    );
    expect(screen.queryByTestId("session-summary")).toBeNull();
  });

  it("renders session summary when isOpen is true", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={3}
        newCount={2}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("session-summary")).toBeInTheDocument();
    expect(screen.getByTestId("summary-total")).toHaveTextContent("7");
    expect(screen.getByTestId("summary-accuracy")).toHaveTextContent("71%");
    expect(screen.getByTestId("summary-correct")).toHaveTextContent("5");
    expect(screen.getByTestId("summary-incorrect")).toHaveTextContent("2");
    expect(screen.getByTestId("summary-hints")).toHaveTextContent("1");
  });

  it("renders retention estimate from stats", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={0}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-retention")).toHaveTextContent("85%");
  });

  it("shows next review text based on due counts", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={0}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-next-review")).toHaveTextContent("Next review tomorrow");
  });

  it("shows cards still due text when dueCount > 0", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={3}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-next-review")).toHaveTextContent("3 cards still due");
  });

  it("shows Continue button when dueCount > 0", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={5}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-continue-button")).toBeInTheDocument();
  });

  it("hides Continue button when dueCount is 0", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={0}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.queryByTestId("summary-continue-button")).toBeNull();
  });

  it("shows Study New Cards button when newCount > 0", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={0}
        newCount={3}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-study-new-button")).toBeInTheDocument();
  });

  it("hides Study New Cards button when newCount is 0", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={0}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.queryByTestId("summary-study-new-button")).toBeNull();
  });

  it("Done button always visible and calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={onClose}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={0}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-done-button")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("summary-done-button"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Continue button calls onContinue", async () => {
    const onContinue = vi.fn();
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={onContinue}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={5}
        newCount={0}
        repertoireId={1}
      />,
    );
    await userEvent.click(screen.getByTestId("summary-continue-button"));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows 0% accuracy when no cards reviewed", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 0, incorrect: 0, total: 0, hintUsed: 0 }}
        dueCount={0}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-accuracy")).toHaveTextContent("0%");
  });

  it("shows new cards learned from stats", () => {
    render(
      <TrainingSessionSummary
        isOpen={true}
        onClose={vi.fn()}
        onContinue={vi.fn()}
        onStudyNew={vi.fn()}
        sessionStats={{ correct: 5, incorrect: 2, total: 7, hintUsed: 1 }}
        dueCount={0}
        newCount={0}
        repertoireId={1}
      />,
    );
    expect(screen.getByTestId("summary-new-learned")).toHaveTextContent("3");
  });
});
