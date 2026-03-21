import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrainingFeedback } from "../src/components/TrainingFeedback.js";

afterEach(() => {
  cleanup();
});

describe("TrainingFeedback", () => {
  it("renders nothing when feedbackType is null", () => {
    render(<TrainingFeedback feedbackType={null} correctMoveSan={null} isEasyRating={false} />);
    expect(screen.queryByTestId("training-feedback")).toBeNull();
  });

  it("renders 'Good!' for correct feedback", () => {
    render(<TrainingFeedback feedbackType="correct" correctMoveSan="e6" isEasyRating={false} />);
    expect(screen.getByTestId("training-feedback")).toBeInTheDocument();
    expect(screen.getByText("Good!")).toBeInTheDocument();
    expect(screen.queryByText("Excellent!")).toBeNull();
  });

  it("renders 'Excellent!' for easy correct feedback", () => {
    render(<TrainingFeedback feedbackType="correct" correctMoveSan="e6" isEasyRating={true} />);
    expect(screen.getByText("Excellent!")).toBeInTheDocument();
    expect(screen.queryByText("Good!")).toBeNull();
  });

  it("renders 'Try again' with correct move for wrong feedback", () => {
    render(<TrainingFeedback feedbackType="wrong" correctMoveSan="Nf3" isEasyRating={false} />);
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.getByText("Correct: Nf3")).toBeInTheDocument();
  });

  it("renders 'Try again' without correct move when san is null", () => {
    render(<TrainingFeedback feedbackType="wrong" correctMoveSan={null} isEasyRating={false} />);
    expect(screen.getByText("Try again")).toBeInTheDocument();
    expect(screen.queryByText(/Correct:/)).toBeNull();
  });
});
