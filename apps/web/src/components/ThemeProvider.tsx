import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

const PREFS_KEY = "chess-preferences";
const DEFAULT_THEME: ThemePreference = "light";

type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** The user's preference: "light", "dark", or "system" */
  preference: ThemePreference;
  /** The resolved theme actually applied to the DOM: "light" or "dark" */
  theme: ResolvedTheme;
  /** Update the theme preference */
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return getSystemTheme();
  return preference;
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { theme?: string };
      if (parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system") {
        return parsed.theme;
      }
    }
    // Migrate from legacy key
    const legacy = localStorage.getItem("chess-theme");
    if (legacy === "light" || legacy === "dark" || legacy === "system") {
      return legacy;
    }
  } catch {
    // localStorage unavailable or corrupted JSON
  }
  return DEFAULT_THEME;
}

function writeThemePreference(preference: ThemePreference): void {
  try {
    const existing = localStorage.getItem(PREFS_KEY);
    let prefs: Record<string, unknown> = {};
    try {
      if (existing) prefs = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      // ignore corrupted JSON
    }
    prefs.theme = preference;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable
  }
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(preference));

  // Apply resolved theme to DOM and persist preference
  useEffect(() => {
    const resolved = resolveTheme(preference);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
    writeThemePreference(preference);
  }, [preference]);

  // Listen for system theme changes when preference is "system"
  useEffect(() => {
    if (preference !== "system") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      const resolved = getSystemTheme();
      setResolvedTheme(resolved);
      document.documentElement.setAttribute("data-theme", resolved);
    }

    mql.addEventListener("change", handleChange);
    return () => {
      mql.removeEventListener("change", handleChange);
    };
  }, [preference]);

  const setTheme = useCallback((newTheme: ThemePreference) => {
    setPreferenceState(newTheme);
  }, []);

  const value = useMemo(
    () => ({ preference, theme: resolvedTheme, setTheme }),
    [preference, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export { ThemeContext, ThemeProvider, useTheme };
export type { ThemePreference, ResolvedTheme, ThemeContextValue };
