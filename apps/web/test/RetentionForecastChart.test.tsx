import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RetentionForecastChart } from "../src/components/RetentionForecastChart.js";

afterEach(() => {
  cleanup();
});

describe("RetentionForecastChart", () => {
  it("renders empty state when no eligible cards", () => {
    render(<RetentionForecastChart cards={[]} />);
    expect(screen.getByText(/No reviewed cards yet/)).toBeTruthy();
  });

  it("renders empty state when all cards are new (state=0)", () => {
    render(<RetentionForecastChart cards={[{ stability: 5, elapsedDays: 0, state: 0 }]} />);
    expect(screen.getByText(/No reviewed cards yet/)).toBeTruthy();
  });

  it("renders chart with title and SVG elements for eligible cards", () => {
    const { container } = render(
      <RetentionForecastChart
        cards={[
          { stability: 10, elapsedDays: 1, state: 2 },
          { stability: 5, elapsedDays: 2, state: 1 },
        ]}
      />,
    );

    expect(screen.getByText("Retention Forecast")).toBeTruthy();
    expect(screen.getByTestId("retention-forecast")).toBeTruthy();

    // SVG should contain the polyline
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    expect(polyline!.getAttribute("points")).toBeTruthy();
  });

  it("renders the 90% target retention dashed line", () => {
    render(<RetentionForecastChart cards={[{ stability: 10, elapsedDays: 1, state: 2 }]} />);

    expect(screen.getByTestId("target-retention-line")).toBeTruthy();
    expect(screen.getByText("90%")).toBeTruthy();
  });

  it("renders today marker at day 0", () => {
    render(<RetentionForecastChart cards={[{ stability: 10, elapsedDays: 1, state: 2 }]} />);

    expect(screen.getByTestId("today-marker")).toBeTruthy();
  });

  it("renders x-axis day labels", () => {
    render(<RetentionForecastChart cards={[{ stability: 10, elapsedDays: 1, state: 2 }]} />);

    // Should have day labels 0, 5, 10, 15, 20, 25, 30
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
  });

  it("renders y-axis percentage labels", () => {
    render(<RetentionForecastChart cards={[{ stability: 10, elapsedDays: 1, state: 2 }]} />);

    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("filters out cards with state=0", () => {
    const { container } = render(
      <RetentionForecastChart
        cards={[
          { stability: 10, elapsedDays: 1, state: 0 }, // New — excluded
          { stability: 10, elapsedDays: 1, state: 2 }, // Review — included
        ]}
      />,
    );

    // Should still render the chart (one eligible card)
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
  });
});
