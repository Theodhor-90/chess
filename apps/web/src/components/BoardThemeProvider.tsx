import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "chess-board-prefs";

type BoardTheme = "brown" | "blue" | "green" | "ic";
type PieceTheme = "cburnett" | "merida" | "alpha" | "california";

interface BoardPreferences {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
}

interface BoardThemeContextValue {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  setBoardTheme: (theme: BoardTheme) => void;
  setPieceTheme: (theme: PieceTheme) => void;
}

const DEFAULT_PREFS: BoardPreferences = {
  boardTheme: "brown",
  pieceTheme: "cburnett",
};

const VALID_BOARD_THEMES: BoardTheme[] = ["brown", "blue", "green", "ic"];
const VALID_PIECE_THEMES: PieceTheme[] = ["cburnett", "merida", "alpha", "california"];

const BoardThemeContext = createContext<BoardThemeContextValue | null>(null);

function readPreferences(): BoardPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PREFS;
    const parsed = JSON.parse(stored) as Partial<BoardPreferences>;
    return {
      boardTheme: VALID_BOARD_THEMES.includes(parsed.boardTheme as BoardTheme)
        ? (parsed.boardTheme as BoardTheme)
        : DEFAULT_PREFS.boardTheme,
      pieceTheme: VALID_PIECE_THEMES.includes(parsed.pieceTheme as PieceTheme)
        ? (parsed.pieceTheme as PieceTheme)
        : DEFAULT_PREFS.pieceTheme,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function BoardThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<BoardPreferences>(readPreferences);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage may be unavailable
    }
  }, [prefs]);

  const setBoardTheme = useCallback((theme: BoardTheme) => {
    setPrefs((prev) => ({ ...prev, boardTheme: theme }));
  }, []);

  const setPieceTheme = useCallback((theme: PieceTheme) => {
    setPrefs((prev) => ({ ...prev, pieceTheme: theme }));
  }, []);

  const value = useMemo(
    () => ({
      boardTheme: prefs.boardTheme,
      pieceTheme: prefs.pieceTheme,
      setBoardTheme,
      setPieceTheme,
    }),
    [prefs.boardTheme, prefs.pieceTheme, setBoardTheme, setPieceTheme],
  );

  return <BoardThemeContext.Provider value={value}>{children}</BoardThemeContext.Provider>;
}

function useBoardTheme(): BoardThemeContextValue {
  const context = useContext(BoardThemeContext);
  if (context === null) {
    throw new Error("useBoardTheme must be used within a BoardThemeProvider");
  }
  return context;
}

export { BoardThemeContext, BoardThemeProvider, useBoardTheme };
export type { BoardTheme, PieceTheme, BoardPreferences, BoardThemeContextValue };
