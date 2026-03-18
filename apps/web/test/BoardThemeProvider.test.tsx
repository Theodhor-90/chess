import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { BoardThemeProvider, useBoardTheme } from "../src/components/BoardThemeProvider.js";

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

describe("BoardThemeProvider", () => {
  it("defaults to brown board and cburnett pieces", () => {
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("brown");
    expect(result.current.pieceTheme).toBe("cburnett");
  });

  it("reads initial preferences from localStorage", () => {
    localStorage.setItem(
      "chess-board-prefs",
      JSON.stringify({ boardTheme: "blue", pieceTheme: "merida" }),
    );
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
      const stored = JSON.parse(localStorage.getItem("chess-board-prefs")!);
      expect(stored.boardTheme).toBe("green");
    });
  });

  it("setPieceTheme updates piece theme and persists", async () => {
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    act(() => {
      result.current.setPieceTheme("alpha");
    });
    expect(result.current.pieceTheme).toBe("alpha");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("chess-board-prefs")!);
      expect(stored.pieceTheme).toBe("alpha");
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
      const stored = JSON.parse(localStorage.getItem("chess-board-prefs")!);
      expect(stored).toEqual({ boardTheme: "ic", pieceTheme: "california" });
    });
  });

  it("falls back to defaults for invalid localStorage JSON", () => {
    localStorage.setItem("chess-board-prefs", "invalid json");
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("brown");
    expect(result.current.pieceTheme).toBe("cburnett");
  });

  it("falls back to defaults for unknown theme values", () => {
    localStorage.setItem(
      "chess-board-prefs",
      JSON.stringify({ boardTheme: "purple", pieceTheme: "gothic" }),
    );
    const { result } = renderHook(() => useBoardTheme(), { wrapper });
    expect(result.current.boardTheme).toBe("brown");
    expect(result.current.pieceTheme).toBe("cburnett");
  });

  it("throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useBoardTheme());
    }).toThrow("useBoardTheme must be used within a BoardThemeProvider");
  });
});
