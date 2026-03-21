import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RepertoireStatsCard } from "../src/components/RepertoireStatsCard.js";
import type { RepertoireTrainingSummary } from "@chess/shared";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeSummary(
  overrides: Partial<RepertoireTrainingSummary> = {},
): RepertoireTrainingSummary {
  return {
    id: 1,
    name: "Sicilian Defense",
    color: "white",
    totalCards: 25,
    dueToday: 5,
    newCount: 5,
    learningCount: 8,
    reviewCount: 7,
    masteredCount: 5,
    retention: 0.85,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("RepertoireStatsCard", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it("renders repertoire name and color badge", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Sicilian Defense")).toBeTruthy();
    expect(screen.getByText("White")).toBeTruthy();
  });

  it("renders black badge for black repertoire", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary({ color: "black" })} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Black")).toBeTruthy();
  });

  it("renders card breakdown bar segments", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary()} />
      </MemoryRouter>,
    );

    // 4 breakdown labels should appear
    expect(screen.getByText(/New \(5\)/)).toBeTruthy();
    expect(screen.getByText(/Learning \(8\)/)).toBeTruthy();
    expect(screen.getByText(/Review \(7\)/)).toBeTruthy();
    expect(screen.getByText(/Mastered \(5\)/)).toBeTruthy();
  });

  it("renders key stats: total cards, due today, retention, estimated time", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("25")).toBeTruthy(); // totalCards
    expect(screen.getByText("5")).toBeTruthy(); // dueToday
    expect(screen.getByText("85%")).toBeTruthy(); // retention (0.85 → 85%)
    expect(screen.getByText("<1 min")).toBeTruthy(); // 5 × 8 = 40s → <1 min
  });

  it("shows estimated time in minutes when > 60 seconds", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary({ dueToday: 20 })} />
      </MemoryRouter>,
    );

    // 20 × 8 = 160s ≈ 3 min
    expect(screen.getByText("3 min")).toBeTruthy();
  });

  it("renders em-dash for null retention", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary({ retention: null })} />
      </MemoryRouter>,
    );

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("Train button navigates to /repertoires/:id/train", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary({ id: 42 })} />
      </MemoryRouter>,
    );

    const trainBtn = screen.getByText("Train (5)");
    fireEvent.click(trainBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/repertoires/42/train");
  });

  it("Builder button navigates to /repertoires/:id", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary({ id: 42 })} />
      </MemoryRouter>,
    );

    const builderBtn = screen.getByText("Builder");
    fireEvent.click(builderBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/repertoires/42");
  });

  it("Train button is disabled when dueToday=0 and newCount=0", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard summary={makeSummary({ dueToday: 0, newCount: 0 })} />
      </MemoryRouter>,
    );

    const trainBtn = screen.getByText("Train (0)");
    expect(trainBtn).toBeInstanceOf(HTMLButtonElement);
    expect((trainBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not render breakdown bar when totalCards is 0", () => {
    render(
      <MemoryRouter>
        <RepertoireStatsCard
          summary={makeSummary({
            totalCards: 0,
            newCount: 0,
            learningCount: 0,
            reviewCount: 0,
            masteredCount: 0,
          })}
        />
      </MemoryRouter>,
    );

    // No breakdown labels should be present
    expect(screen.queryByText(/New \(/)).toBeNull();
  });
});
