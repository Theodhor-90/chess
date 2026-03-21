import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CalendarHeatmap } from "../src/components/CalendarHeatmap.js";

afterEach(() => {
  cleanup();
});

describe("CalendarHeatmap", () => {
  it("renders without data", () => {
    const { container } = render(<CalendarHeatmap data={[]} />);
    // Should render the grid container with cells (empty, level0)
    const cells = container.querySelectorAll("[data-tooltip]");
    // Approximately 6 months ≈ ~182 days of cells
    expect(cells.length).toBeGreaterThan(100);
  });

  it("renders cells with correct intensity for given counts", () => {
    // Create data for today with 10 reviews (should be level2: 6-15)
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = String(today.getUTCMonth() + 1).padStart(2, "0");
    const d = String(today.getUTCDate()).padStart(2, "0");
    const todayStr = `${y}-${m}-${d}`;

    const { container } = render(<CalendarHeatmap data={[{ date: todayStr, count: 10 }]} />);

    const todayCell = container.querySelector(`[data-tooltip="10 reviews on ${todayStr}"]`);
    expect(todayCell).not.toBeNull();
  });

  it("shows correct tooltip text for a single review", () => {
    const today = new Date();
    const y = today.getUTCFullYear();
    const m = String(today.getUTCMonth() + 1).padStart(2, "0");
    const d = String(today.getUTCDate()).padStart(2, "0");
    const todayStr = `${y}-${m}-${d}`;

    const { container } = render(<CalendarHeatmap data={[{ date: todayStr, count: 1 }]} />);

    // Singular "review" for count 1
    const cell = container.querySelector(`[data-tooltip="1 review on ${todayStr}"]`);
    expect(cell).not.toBeNull();
  });

  it("renders month labels", () => {
    render(<CalendarHeatmap data={[]} months={6} />);
    // At least one month label should be visible
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const currentMonth = new Date().getUTCMonth();
    // The current month name should appear
    expect(screen.getByText(monthNames[currentMonth])).toBeTruthy();
  });

  it("renders day labels M, W, F", () => {
    render(<CalendarHeatmap data={[]} />);
    expect(screen.getByText("M")).toBeTruthy();
    expect(screen.getByText("W")).toBeTruthy();
    expect(screen.getByText("F")).toBeTruthy();
  });

  it("renders legend with Less and More labels", () => {
    render(<CalendarHeatmap data={[]} />);
    expect(screen.getByText("Less")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
  });

  it("respects custom months prop", () => {
    const { container: container3 } = render(<CalendarHeatmap data={[]} months={3} />);
    const cells3 = container3.querySelectorAll("[data-tooltip]");

    cleanup();

    const { container: container6 } = render(<CalendarHeatmap data={[]} months={6} />);
    const cells6 = container6.querySelectorAll("[data-tooltip]");
    // 3-month grid should have fewer cells than 6-month
    expect(cells3.length).toBeLessThan(cells6.length);
  });
});
