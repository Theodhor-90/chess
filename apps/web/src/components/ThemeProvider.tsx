import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "chess-theme";
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
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_THEME;
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(preference));

  // Apply resolved theme to DOM and persist preference
  useEffect(() => {
    const resolved = resolveTheme(preference);
    setResolvedTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // localStorage may be unavailable
    }
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
