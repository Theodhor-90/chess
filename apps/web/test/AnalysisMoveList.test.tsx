import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisMoveList } from "../src/components/AnalysisMoveList.js";
import type { MoveClassification } from "@chess/shared";

afterEach(() => {
  cleanup();
});

const moves = ["e4", "e5", "Nf3", "Nc6"];
const noop = () => {};

describe("AnalysisMoveList classification indicators", () => {
  it("renders move list without indicators when no classifications prop", () => {
    render(<AnalysisMoveList moves={moves} currentMoveIndex={0} onMoveClick={noop} />);
    expect(screen.getByTestId("analysis-move-list")).toBeInTheDocument();
    expect(screen.queryByTestId(/^move-indicator-/)).toBeNull();
  });

  it("renders indicator with 'best' classification class", () => {
    const classifications: (MoveClassification | null)[] = [null, "best", null];
    render(
      <AnalysisMoveList
        moves={["e4", "e5"]}
        currentMoveIndex={0}
        onMoveClick={noop}
        classifications={classifications}
      />,
    );
    const indicator = screen.getByTestId("move-indicator-1");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("indicatorBest");
  });

  it("renders indicator with 'good' classification class", () => {
    const classifications: (MoveClassification | null)[] = [null, "good", null];
    render(
      <AnalysisMoveList
        moves={["e4", "e5"]}
        currentMoveIndex={0}
        onMoveClick={noop}
        classifications={classifications}
      />,
    );
    const indicator = screen.getByTestId("move-indicator-1");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("indicatorGood");
  });

  it("renders indicator with 'inaccuracy' classification class", () => {
    const classifications: (MoveClassification | null)[] = [null, "inaccuracy", null];
    render(
      <AnalysisMoveList
        moves={["e4", "e5"]}
        currentMoveIndex={0}
        onMoveClick={noop}
        classifications={classifications}
      />,
    );
    const indicator = screen.getByTestId("move-indicator-1");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("indicatorInaccuracy");
  });

  it("renders indicator with 'mistake' classification class", () => {
    const classifications: (MoveClassification | null)[] = [null, "mistake", null];
    render(
      <AnalysisMoveList
        moves={["e4", "e5"]}
        currentMoveIndex={0}
        onMoveClick={noop}
        classifications={classifications}
      />,
    );
    const indicator = screen.getByTestId("move-indicator-1");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("indicatorMistake");
  });

  it("renders indicator with 'blunder' classification class", () => {
    const classifications: (MoveClassification | null)[] = [null, "blunder", null];
    render(
      <AnalysisMoveList
        moves={["e4", "e5"]}
        currentMoveIndex={0}
        onMoveClick={noop}
        classifications={classifications}
      />,
    );
    const indicator = screen.getByTestId("move-indicator-1");
    expect(indicator).toBeInTheDocument();
    expect(indicator.className).toContain("indicatorBlunder");
  });

  it("does not render indicator for null classification entries", () => {
    const classifications: (MoveClassification | null)[] = [null, null, "best"];
    render(
      <AnalysisMoveList
        moves={["e4", "e5"]}
        currentMoveIndex={0}
        onMoveClick={noop}
        classifications={classifications}
      />,
    );
    expect(screen.queryByTestId("move-indicator-1")).toBeNull();
    expect(screen.getByTestId("move-indicator-2")).toBeInTheDocument();
  });
});
