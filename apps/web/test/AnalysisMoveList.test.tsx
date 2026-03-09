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

  it("renders green indicator for 'best' classification", () => {
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
    expect(indicator.style.backgroundColor).toBe("rgb(34, 197, 94)");
  });

  it("renders green indicator for 'good' classification", () => {
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
    expect(indicator.style.backgroundColor).toBe("rgb(34, 197, 94)");
  });

  it("renders yellow indicator for 'inaccuracy' classification", () => {
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
    expect(indicator.style.backgroundColor).toBe("rgb(234, 179, 8)");
  });

  it("renders orange indicator for 'mistake' classification", () => {
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
    expect(indicator.style.backgroundColor).toBe("rgb(249, 115, 22)");
  });

  it("renders red indicator for 'blunder' classification", () => {
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
    expect(indicator.style.backgroundColor).toBe("rgb(239, 68, 68)");
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
