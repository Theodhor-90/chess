import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EvalBar, evalToWhitePercent } from "../src/components/EvalBar.js";

afterEach(() => {
  cleanup();
});

describe("evalToWhitePercent", () => {
  it("returns 50 for equal position (0 cp)", () => {
    expect(evalToWhitePercent({ type: "cp", value: 0 })).toBe(50);
  });

  it("returns >50 for positive cp", () => {
    expect(evalToWhitePercent({ type: "cp", value: 150 })).toBeGreaterThan(50);
  });

  it("returns <50 for negative cp", () => {
    expect(evalToWhitePercent({ type: "cp", value: -200 })).toBeLessThan(50);
  });

  it("returns 100 for white mate-in-N", () => {
    expect(evalToWhitePercent({ type: "mate", value: 3 })).toBe(100);
  });

  it("returns 0 for black mate-in-N", () => {
    expect(evalToWhitePercent({ type: "mate", value: -3 })).toBe(0);
  });
});

describe("EvalBar", () => {
  it("renders formatted score '+1.5' for 150 cp", () => {
    render(<EvalBar score={{ type: "cp", value: 150 }} />);
    expect(screen.getByTestId("eval-score")).toHaveTextContent("+1.5");
  });

  it("renders formatted score '-2.0' for -200 cp", () => {
    render(<EvalBar score={{ type: "cp", value: -200 }} />);
    expect(screen.getByTestId("eval-score")).toHaveTextContent("-2.0");
  });

  it("renders 'M3' for white mate-in-3", () => {
    render(<EvalBar score={{ type: "mate", value: 3 }} />);
    expect(screen.getByTestId("eval-score")).toHaveTextContent("M3");
  });

  it("renders 'M-3' for black mate-in-3", () => {
    render(<EvalBar score={{ type: "mate", value: -3 }} />);
    expect(screen.getByTestId("eval-score")).toHaveTextContent("M-3");
  });

  it("applies CSS transition to fill sections", () => {
    render(<EvalBar score={{ type: "cp", value: 0 }} />);
    const whiteFill = screen.getByTestId("eval-white-fill");
    expect(whiteFill.style.transition).toContain("height 0.3s");
  });

  it("renders eval-bar container", () => {
    render(<EvalBar score={{ type: "cp", value: 0 }} />);
    expect(screen.getByTestId("eval-bar")).toBeInTheDocument();
  });
});
