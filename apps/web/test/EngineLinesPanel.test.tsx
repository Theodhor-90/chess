import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineLinesPanel, formatEvalScore } from "../src/components/EngineLinesPanel.js";
import type { EngineLineInfo } from "@chess/shared";

afterEach(() => {
  cleanup();
});

const sampleLines: EngineLineInfo[] = [
  { score: { type: "cp", value: 25 }, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"], depth: 18 },
  { score: { type: "cp", value: 20 }, moves: ["d4", "d5", "c4"], depth: 18 },
  { score: { type: "cp", value: 10 }, moves: ["Nf3", "d5", "d4"], depth: 18 },
];

const noop = () => {};

describe("formatEvalScore", () => {
  it("formats positive centipawn score", () => {
    expect(formatEvalScore({ type: "cp", value: 25 })).toBe("+0.3");
  });

  it("formats negative centipawn score", () => {
    expect(formatEvalScore({ type: "cp", value: -150 })).toBe("-1.5");
  });

  it("formats zero centipawn score", () => {
    expect(formatEvalScore({ type: "cp", value: 0 })).toBe("0.0");
  });

  it("formats positive mate score", () => {
    expect(formatEvalScore({ type: "mate", value: 3 })).toBe("M3");
  });

  it("formats negative mate score", () => {
    expect(formatEvalScore({ type: "mate", value: -2 })).toBe("-M2");
  });
});

describe("EngineLinesPanel", () => {
  it("renders nothing when engineLines is undefined", () => {
    const { container } = render(<EngineLinesPanel engineLines={undefined} onLineSelect={noop} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when engineLines is empty", () => {
    const { container } = render(<EngineLinesPanel engineLines={[]} onLineSelect={noop} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders 3 lines for 3 engine lines", () => {
    render(<EngineLinesPanel engineLines={sampleLines} onLineSelect={noop} />);
    expect(screen.getByTestId("engine-lines-panel")).toBeInTheDocument();
    expect(screen.getByTestId("engine-line-0")).toBeInTheDocument();
    expect(screen.getByTestId("engine-line-1")).toBeInTheDocument();
    expect(screen.getByTestId("engine-line-2")).toBeInTheDocument();
  });

  it("displays rank numbers", () => {
    render(<EngineLinesPanel engineLines={sampleLines} onLineSelect={noop} />);
    expect(screen.getByTestId("engine-line-rank-0")).toHaveTextContent("1");
    expect(screen.getByTestId("engine-line-rank-1")).toHaveTextContent("2");
    expect(screen.getByTestId("engine-line-rank-2")).toHaveTextContent("3");
  });

  it("displays formatted eval scores", () => {
    render(<EngineLinesPanel engineLines={sampleLines} onLineSelect={noop} />);
    expect(screen.getByTestId("engine-line-eval-0")).toHaveTextContent("+0.3");
    expect(screen.getByTestId("engine-line-eval-1")).toHaveTextContent("+0.2");
    expect(screen.getByTestId("engine-line-eval-2")).toHaveTextContent("+0.1");
  });

  it("displays move text", () => {
    render(<EngineLinesPanel engineLines={sampleLines} onLineSelect={noop} />);
    expect(screen.getByTestId("engine-line-moves-0")).toHaveTextContent("e4 e5 Nf3 Nc6 Bb5");
    expect(screen.getByTestId("engine-line-moves-1")).toHaveTextContent("d4 d5 c4");
  });

  it("calls onLineSelect with correct index when a line is clicked", () => {
    const handleSelect = vi.fn();
    render(<EngineLinesPanel engineLines={sampleLines} onLineSelect={handleSelect} />);

    fireEvent.click(screen.getByTestId("engine-line-1"));
    expect(handleSelect).toHaveBeenCalledOnce();
    expect(handleSelect).toHaveBeenCalledWith(1);
  });

  it("top line (index 0) has primary class", () => {
    render(<EngineLinesPanel engineLines={sampleLines} onLineSelect={noop} />);
    expect(screen.getByTestId("engine-line-0").className).toContain("linePrimary");
    expect(screen.getByTestId("engine-line-1").className).not.toContain("linePrimary");
  });

  it("handles fewer than 3 lines", () => {
    const twoLines: EngineLineInfo[] = [
      { score: { type: "mate", value: 2 }, moves: ["Qf7"], depth: 18 },
      { score: { type: "mate", value: 4 }, moves: ["Qb7"], depth: 18 },
    ];
    render(<EngineLinesPanel engineLines={twoLines} onLineSelect={noop} />);
    expect(screen.getByTestId("engine-line-0")).toBeInTheDocument();
    expect(screen.getByTestId("engine-line-1")).toBeInTheDocument();
    expect(screen.queryByTestId("engine-line-2")).toBeNull();
  });

  it("displays mate eval scores correctly", () => {
    const mateLines: EngineLineInfo[] = [
      { score: { type: "mate", value: 2 }, moves: ["Qf7"], depth: 18 },
      { score: { type: "mate", value: -3 }, moves: ["Qb7"], depth: 18 },
    ];
    render(<EngineLinesPanel engineLines={mateLines} onLineSelect={noop} />);
    expect(screen.getByTestId("engine-line-eval-0")).toHaveTextContent("M2");
    expect(screen.getByTestId("engine-line-eval-1")).toHaveTextContent("-M3");
  });
});
