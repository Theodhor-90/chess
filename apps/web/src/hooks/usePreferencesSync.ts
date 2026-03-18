import { useEffect, useRef } from "react";
import { useTheme } from "../components/ThemeProvider.js";
import { useBoardTheme } from "../components/BoardThemeProvider.js";
import { useGetPreferencesQuery, useUpdatePreferencesMutation } from "../store/apiSlice.js";
import type { UserPreferences } from "@chess/shared";

function usePreferencesSync(isAuthenticated: boolean): void {
  const { preference, setTheme } = useTheme();
  const { boardTheme, pieceTheme, setBoardTheme, setPieceTheme } = useBoardTheme();
  const [updatePreferences] = useUpdatePreferencesMutation();
  const { data: serverPrefs } = useGetPreferencesQuery(undefined, {
    skip: !isAuthenticated,
  });

  // Track whether initial load from server has been applied
  const hasLoadedFromServer = useRef(false);
  // Track whether the next save should be skipped (prevents save-back after loading server prefs)
  const skipNextSave = useRef(false);

  // On first load, apply server preferences if they differ from localStorage
  useEffect(() => {
    if (!serverPrefs || hasLoadedFromServer.current) return;
    hasLoadedFromServer.current = true;

    const sp = serverPrefs.preferences;
    const needsUpdate =
      sp.theme !== preference || sp.boardTheme !== boardTheme || sp.pieceTheme !== pieceTheme;

    if (needsUpdate) {
      // Set the flag BEFORE calling setters so the save effect skips the next trigger
      skipNextSave.current = true;
      if (sp.theme !== preference) setTheme(sp.theme);
      if (sp.boardTheme !== boardTheme) setBoardTheme(sp.boardTheme);
      if (sp.pieceTheme !== pieceTheme) setPieceTheme(sp.pieceTheme);
    }
  }, [serverPrefs]);

  // Save to server when preferences change (skip initial mount and server-load-triggered changes)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const prefs: UserPreferences = {
      theme: preference,
      boardTheme,
      pieceTheme,
    };

    updatePreferences(prefs).catch(() => {
      // Silently fail — localStorage is the primary store
    });
  }, [preference, boardTheme, pieceTheme, isAuthenticated, updatePreferences]);
}

export { usePreferencesSync };
