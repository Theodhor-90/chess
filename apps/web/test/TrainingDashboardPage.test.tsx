import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { TrainingDashboardResponse } from "@chess/shared";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Default mock data that all tests will use unless overridden
const defaultDashboardData: TrainingDashboardResponse = {
  totalDueToday: 8,
  totalCards: 42,
  overallRetention: 0.87,
  currentStreak: 3,
  repertoires: [
    {
      id: 1,
      name: "Sicilian Defense",
      color: "white",
      totalCards: 25,
      dueToday: 5,
      newCount: 3,
      learningCount: 8,
      reviewCount: 9,
      masteredCount: 5,
      retention: 0.91,
    },
    {
      id: 2,
      name: "French Defense",
      color: "black",
      totalCards: 17,
      dueToday: 3,
      newCount: 2,
      learningCount: 4,
      reviewCount: 6,
      masteredCount: 5,
      retention: 0.82,
    },
  ],
  reviewHistory: [
    { date: "2026-03-18", count: 10 },
    { date: "2026-03-19", count: 15 },
    { date: "2026-03-20", count: 8 },
  ],
  learningVelocity: [{ date: "2026-03-20", newCardsLearned: 3 }],
};

// Mutable reference for per-test overrides
let mockQueryReturn: {
  data: TrainingDashboardResponse | undefined;
  isLoading: boolean;
  isError: boolean;
} = {
  data: defaultDashboardData,
  isLoading: false,
  isError: false,
};

vi.mock("../src/store/apiSlice.js", () => ({
  useGetTrainingDashboardQuery: () => mockQueryReturn,
  useGetDifficultPositionsQuery: () => ({ data: [], isLoading: false }),
}));

// Mock Chessground — jsdom doesn't support canvas
vi.mock("chessground", () => ({
  Chessground: () => ({
    set: vi.fn(),
    destroy: vi.fn(),
  }),
}));

// Mock BoardThemeProvider
vi.mock("../src/components/BoardThemeProvider.js", () => ({
  useBoardTheme: () => ({ boardTheme: "brown", pieceTheme: "cburnett" }),
}));

afterEach(() => {
  cleanup();
  mockNavigate.mockReset();
  // Reset to default after each test
  mockQueryReturn = {
    data: defaultDashboardData,
    isLoading: false,
    isError: false,
  };
});

// Lazy import to ensure mocks are registered before module loads
async function renderDashboard() {
  const { TrainingDashboardPage } = await import("../src/pages/TrainingDashboardPage.js");
  return render(
    <MemoryRouter>
      <TrainingDashboardPage />
    </MemoryRouter>,
  );
}

describe("TrainingDashboardPage", () => {
  it("renders loading skeleton when data is loading", async () => {
    mockQueryReturn = { data: undefined, isLoading: true, isError: false };
    await renderDashboard();
    expect(screen.getByTestId("training-dashboard-loading")).toBeTruthy();
  });

  it("renders error message on API error", async () => {
    mockQueryReturn = { data: undefined, isLoading: false, isError: true };
    await renderDashboard();
    expect(screen.getByText("Failed to load training dashboard.")).toBeTruthy();
  });

  it("renders empty state when no repertoires", async () => {
    mockQueryReturn = {
      data: { ...defaultDashboardData, repertoires: [], totalDueToday: 0, totalCards: 0 },
      isLoading: false,
      isError: false,
    };
    await renderDashboard();
    expect(screen.getByText(/No repertoires to train/)).toBeTruthy();
    expect(screen.getByText("Go to Repertoires")).toBeTruthy();
  });

  it("renders total due count and start training button", async () => {
    await renderDashboard();
    expect(screen.getByTestId("total-due-count").textContent).toBe("8");
    expect(screen.getByTestId("start-training-button")).toBeTruthy();
  });

  it("renders current streak", async () => {
    await renderDashboard();
    expect(screen.getByTestId("current-streak").textContent).toBe("3");
  });

  it("renders calendar heatmap section", async () => {
    await renderDashboard();
    // The heatmap section heading
    expect(screen.getByText("Review Activity")).toBeTruthy();
    // Heatmap should render cells — at least the legend labels
    expect(screen.getByText("Less")).toBeTruthy();
    expect(screen.getByText("More")).toBeTruthy();
  });

  it("shows flame icon when current streak is > 0", async () => {
    await renderDashboard();
    // Flame icon is rendered as a span with aria-hidden="true"
    const flameIcon = document.querySelector("[aria-hidden='true']");
    expect(flameIcon).not.toBeNull();
  });

  it("does not show flame icon when current streak is 0", async () => {
    mockQueryReturn = {
      data: { ...defaultDashboardData, currentStreak: 0 },
      isLoading: false,
      isError: false,
    };
    await renderDashboard();
    // No flame icon should be present
    const flameIcon = document.querySelector("[aria-hidden='true']");
    expect(flameIcon).toBeNull();
  });

  it("computes and displays longest streak from review history", async () => {
    // reviewHistory has 3 consecutive days: 2026-03-18, 2026-03-19, 2026-03-20
    await renderDashboard();
    expect(screen.getByTestId("longest-streak").textContent).toBe("Longest: 3 days");
  });

  it("renders RepertoireStatsCard for each repertoire", async () => {
    await renderDashboard();
    // Both repertoire card test IDs should be present
    expect(screen.getByTestId("repertoire-stats-card-1")).toBeTruthy();
    expect(screen.getByTestId("repertoire-stats-card-2")).toBeTruthy();
    // Repertoire names should be visible (may appear in both due breakdown and stats cards)
    expect(screen.getAllByText("Sicilian Defense").length).toBeGreaterThan(0);
    expect(screen.getAllByText("French Defense").length).toBeGreaterThan(0);
  });

  it("renders per-repertoire due breakdown when cards are due", async () => {
    await renderDashboard();
    expect(screen.getByTestId("due-breakdown")).toBeTruthy();
  });

  it("renders overview stats row with totals", async () => {
    await renderDashboard();
    expect(screen.getByText("Total Cards")).toBeTruthy();
    expect(screen.getByText("Overall Retention")).toBeTruthy();
    expect(screen.getByText("87%")).toBeTruthy(); // 0.87 → 87%
  });
});
