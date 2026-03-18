import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThemeProvider, useTheme } from "../src/components/ThemeProvider.js";

let matchMediaMatches = false;
let matchMediaListeners: Array<(e: { matches: boolean }) => void> = [];

function mockMatchMedia() {
  matchMediaMatches = false;
  matchMediaListeners = [];
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: matchMediaMatches,
        media: query,
        onchange: null,
        addEventListener: (_event: string, listener: (e: { matches: boolean }) => void) => {
          matchMediaListeners.push(listener);
        },
        removeEventListener: (_event: string, listener: (e: { matches: boolean }) => void) => {
          matchMediaListeners = matchMediaListeners.filter((l) => l !== listener);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function fireSystemThemeChange(dark: boolean) {
  matchMediaMatches = dark;
  for (const listener of [...matchMediaListeners]) {
    listener({ matches: dark });
  }
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockMatchMedia();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
  matchMediaListeners = [];
});

describe("ThemeProvider", () => {
  it('sets data-theme="light" on document.documentElement by default', () => {
    render(
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it('persists "light" to localStorage on mount', () => {
    render(
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>,
    );
    expect(localStorage.getItem("chess-theme")).toBe("light");
  });

  it("reads initial theme from localStorage if set to dark", () => {
    localStorage.setItem("chess-theme", "dark");
    render(
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("chess-theme")).toBe("dark");
  });

  it("renders children", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Hello</div>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });
});

describe("useTheme", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  it("returns the current theme as light by default", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
    expect(result.current.preference).toBe("light");
  });

  it("setTheme to dark updates theme, DOM, and localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.theme).toBe("dark");
    expect(result.current.preference).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("chess-theme")).toBe("dark");
  });

  it("throws when used outside ThemeProvider", () => {
    expect(() => {
      renderHook(() => useTheme());
    }).toThrow("useTheme must be used within a ThemeProvider");
  });

  it('setTheme to "system" resolves to light when system is light', () => {
    matchMediaMatches = false;
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("system");
    });
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it('setTheme to "system" resolves to dark when system is dark', () => {
    matchMediaMatches = true;
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("system");
    });
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("responds to system theme changes when preference is system", () => {
    matchMediaMatches = false;
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setTheme("system");
    });
    expect(result.current.theme).toBe("light");

    act(() => {
      fireSystemThemeChange(true);
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("does not respond to system changes when preference is explicitly light", () => {
    matchMediaMatches = false;
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");

    act(() => {
      fireSystemThemeChange(true);
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("cleans up matchMedia listener when switching away from system", () => {
    matchMediaMatches = false;
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("system");
    });
    expect(matchMediaListeners.length).toBe(1);

    act(() => {
      result.current.setTheme("dark");
    });
    expect(matchMediaListeners.length).toBe(0);
  });

  it("reads system preference from localStorage on mount", () => {
    matchMediaMatches = true;
    localStorage.setItem("chess-theme", "system");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe("system");
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
