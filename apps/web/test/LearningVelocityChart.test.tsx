import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LearningVelocityChart } from "../src/components/LearningVelocityChart.js";

afterEach(() => {
  cleanup();
});

function todayStr(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("LearningVelocityChart", () => {
  it("renders empty state when no data", () => {
    render(<LearningVelocityChart data={[]} />);
    expect(screen.getByText(/No new cards learned yet/)).toBeTruthy();
  });

  it("renders chart with title and bars for data", () => {
    const { container } = render(
      <LearningVelocityChart
        data={[
          { date: todayStr(), newCardsLearned: 5 },
          { date: daysAgoStr(1), newCardsLearned: 3 },
        ]}
      />,
    );

    expect(screen.getByText("Learning Velocity")).toBeTruthy();
    expect(screen.getByTestId("learning-velocity")).toBeTruthy();

    // Should render bars as SVG rects
    const rects = container.querySelectorAll("rect");
    // 30 bars total (one per day in the 30-day window)
    expect(rects.length).toBe(30);
  });

  it("renders trend line", () => {
    render(
      <LearningVelocityChart
        data={[
          { date: todayStr(), newCardsLearned: 5 },
          { date: daysAgoStr(5), newCardsLearned: 3 },
        ]}
      />,
    );

    expect(screen.getByTestId("trend-line")).toBeTruthy();
  });

  it("shows SVG with accessible aria-label", () => {
    const { container } = render(
      <LearningVelocityChart data={[{ date: todayStr(), newCardsLearned: 2 }]} />,
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-label")).toBe("30-day learning velocity chart");
  });

  it("renders bars with correct title tooltips", () => {
    const today = todayStr();
    const { container } = render(
      <LearningVelocityChart data={[{ date: today, newCardsLearned: 7 }]} />,
    );

    const titles = container.querySelectorAll("title");
    const todayTitle = Array.from(titles).find((t) => t.textContent?.includes(today));
    expect(todayTitle).not.toBeNull();
    expect(todayTitle!.textContent).toBe(`${today}: 7 new cards`);
  });
});
