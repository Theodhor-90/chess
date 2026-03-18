import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { BoardThemeProvider, useBoardTheme } from "../src/components/BoardThemeProvider.js";

const PREFS_KEY = "chess-preferences";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function wrapper({ children }: { children: ReactNode }) {
  return <BoardThemeProvider>{children}</BoardThemeProvider>;
}

function setStoredPrefs(prefs: Record<string, unknown>): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function getStoredPrefs(): Record<string, unknown> | null {
  const raw = localStorage.getItem(PREFS_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("BoardThemeProvider", () => {
  it("defaults to brown board and cburnett pieces", () => {
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("brown");
    expect(result.current.pieceTheme).toBe("cburnett");
  });

  it("reads initial preferences from localStorage", () => {
    setStoredPrefs({ boardTheme: "blue", pieceTheme: "merida" });
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("blue");
    expect(result.current.pieceTheme).toBe("merida");
  });

  it("setBoardTheme updates board theme and persists", async () => {
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    act(() => {
      result.current.setBoardTheme("green");
    });
    expect(result.current.boardTheme).toBe("green");
    await waitFor(() => {
      const stored = getStoredPrefs();
      expect(stored?.boardTheme).toBe("green");
    });
  });

  it("setPieceTheme updates piece theme and persists", async () => {
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    act(() => {
      result.current.setPieceTheme("alpha");
    });
    expect(result.current.pieceTheme).toBe("alpha");
    await waitFor(() => {
      const stored = getStoredPrefs();
      expect(stored?.pieceTheme).toBe("alpha");
    });
  });

  it("persists both preferences to localStorage", async () => {
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    act(() => {
      result.current.setBoardTheme("ic");
    });
    act(() => {
      result.current.setPieceTheme("california");
    });
    await waitFor(() => {
      const stored = getStoredPrefs();
      expect(stored?.boardTheme).toBe("ic");
      expect(stored?.pieceTheme).toBe("california");
    });
  });

  it("falls back to defaults for invalid localStorage JSON", () => {
    localStorage.setItem(PREFS_KEY, "invalid json");
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("brown");
    expect(result.current.pieceTheme).toBe("cburnett");
  });

  it("falls back to defaults for unknown theme values", () => {
    setStoredPrefs({ boardTheme: "purple", pieceTheme: "gothic" });
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("brown");
    expect(result.current.pieceTheme).toBe("cburnett");
  });

  it("throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useBoardTheme());
    }).toThrow("useBoardTheme must be used within a BoardThemeProvider");
  });

  it("migrates from legacy chess-board-prefs key", () => {
    localStorage.setItem(
      "chess-board-prefs",
      JSON.stringify({ boardTheme: "green", pieceTheme: "alpha" }),
    );
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("green");
    expect(result.current.pieceTheme).toBe("alpha");
  });

  it("preserves theme preference when writing board prefs", async () => {
    setStoredPrefs({ theme: "dark", boardTheme: "brown", pieceTheme: "cburnett" });
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    act(() => {
      result.current.setBoardTheme("blue");
    });
    await waitFor(() => {
      const stored = getStoredPrefs();
      expect(stored?.theme).toBe("dark");
      expect(stored?.boardTheme).toBe("blue");
    });
  });
});
