import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "../src/components/ThemeProvider.js";
import { BoardThemeProvider } from "../src/components/BoardThemeProvider.js";
import { SettingsPage } from "../src/pages/SettingsPage.js";
import { isMuted, setMuted } from "../src/services/sounds.js";

// Mock Chessground to avoid jsdom rendering issues
vi.mock("chessground", () => ({
  Chessground: () => ({
    set: vi.fn(),
    state: {},
    redrawAll: vi.fn(),
    destroy: vi.fn(),
  }),
}));

// Mock API dependencies to avoid Redux store requirement
vi.mock("../src/store/apiSlice.js", () => ({
  useGetMeQuery: () => ({ data: null }),
  useUpdatePreferencesMutation: () => [vi.fn(), { isLoading: false }],
  useGetPreferencesQuery: () => ({ data: null }),
}));

vi.mock("../src/hooks/usePreferencesSync.js", () => ({
  usePreferencesSync: vi.fn(),
}));

vi.mock("../src/services/sounds.js", () => ({
  isMuted: vi.fn(() => false),
  setMuted: vi.fn(),
  initSounds: vi.fn(),
  playSound: vi.fn(),
}));

const matchMediaMatches = false;

function mockMatchMedia() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: matchMediaMatches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <BoardThemeProvider>
          <SettingsPage />
        </BoardThemeProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockMatchMedia();
  vi.mocked(isMuted).mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("SettingsPage", () => {
  it("renders the settings title", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it("renders three section cards", () => {
    renderSettings();
    expect(screen.getByText("App Theme")).toBeInTheDocument();
    expect(screen.getByText("Board Theme")).toBeInTheDocument();
    expect(screen.getByText("Piece Set")).toBeInTheDocument();
  });

  it("renders all three app theme options", () => {
    renderSettings();
    expect(screen.getByTestId("theme-option-light")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-dark")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-system")).toBeInTheDocument();
  });

  it("light is selected by default", () => {
    renderSettings();
    expect(screen.getByTestId("theme-option-light")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("theme-option-dark")).toHaveAttribute("aria-checked", "false");
  });

  it("clicking dark theme option sets dark theme", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("theme-option-dark"));
    expect(screen.getByTestId("theme-option-dark")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("theme-option-light")).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("renders all four board theme options", () => {
    renderSettings();
    expect(screen.getByTestId("board-theme-brown")).toBeInTheDocument();
    expect(screen.getByTestId("board-theme-blue")).toBeInTheDocument();
    expect(screen.getByTestId("board-theme-green")).toBeInTheDocument();
    expect(screen.getByTestId("board-theme-ic")).toBeInTheDocument();
  });

  it("brown board theme is selected by default", () => {
    renderSettings();
    expect(screen.getByTestId("board-theme-brown")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("board-theme-blue")).toHaveAttribute("aria-checked", "false");
  });

  it("clicking blue board theme updates selection", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("board-theme-blue"));
    expect(screen.getByTestId("board-theme-blue")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("board-theme-brown")).toHaveAttribute("aria-checked", "false");
  });

  it("renders all four piece theme options", () => {
    renderSettings();
    expect(screen.getByTestId("piece-theme-cburnett")).toBeInTheDocument();
    expect(screen.getByTestId("piece-theme-merida")).toBeInTheDocument();
    expect(screen.getByTestId("piece-theme-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("piece-theme-california")).toBeInTheDocument();
  });

  it("cburnett piece theme is selected by default", () => {
    renderSettings();
    expect(screen.getByTestId("piece-theme-cburnett")).toHaveAttribute("aria-checked", "true");
  });

  it("clicking merida piece theme updates selection", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("piece-theme-merida"));
    expect(screen.getByTestId("piece-theme-merida")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("piece-theme-cburnett")).toHaveAttribute("aria-checked", "false");
  });

  it("app theme options use radiogroup role", () => {
    renderSettings();
    const radiogroup = screen.getByRole("radiogroup", { name: "App theme" });
    expect(radiogroup).toBeInTheDocument();
    const radios = radiogroup.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(3);
  });

  it("board theme options use radiogroup role", () => {
    renderSettings();
    const radiogroup = screen.getByRole("radiogroup", { name: "Board theme" });
    expect(radiogroup).toBeInTheDocument();
    const radios = radiogroup.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(4);
  });

  it("piece set options use radiogroup role", () => {
    renderSettings();
    const radiogroup = screen.getByRole("radiogroup", { name: "Piece set" });
    expect(radiogroup).toBeInTheDocument();
    const radios = radiogroup.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(4);
  });

  it("renders the Sound section", () => {
    renderSettings();
    expect(screen.getByText("Sound")).toBeInTheDocument();
    expect(screen.getByText("Game sounds")).toBeInTheDocument();
  });

  it("renders the sound toggle with correct initial state (unmuted)", () => {
    renderSettings();
    const toggle = screen.getByTestId("sound-toggle");
    expect(toggle).toHaveAttribute("role", "switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("renders the sound toggle as off when muted", () => {
    vi.mocked(isMuted).mockReturnValue(true);
    renderSettings();
    const toggle = screen.getByTestId("sound-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("clicking the sound toggle calls setMuted and toggles state", () => {
    renderSettings();
    const toggle = screen.getByTestId("sound-toggle");
    fireEvent.click(toggle);
    expect(setMuted).toHaveBeenCalledWith(true);
    // After click, aria-checked should flip
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});
