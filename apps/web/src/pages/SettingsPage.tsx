import { useEffect, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { useTheme } from "../components/ThemeProvider.js";
import { useBoardTheme } from "../components/BoardThemeProvider.js";
import { useGetMeQuery } from "../store/apiSlice.js";
import { usePreferencesSync } from "../hooks/usePreferencesSync.js";
import type { ThemePreference } from "../components/ThemeProvider.js";
import type { BoardTheme, PieceTheme } from "../components/BoardThemeProvider.js";
import { Card } from "../components/ui/Card.js";
import { isMuted, setMuted } from "../services/sounds.js";
import styles from "./SettingsPage.module.css";

const PREVIEW_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const APP_THEMES: { value: ThemePreference; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Light background with dark text" },
  { value: "dark", label: "Dark", description: "Dark background with light text" },
  { value: "system", label: "System", description: "Match your operating system setting" },
];

const BOARD_THEMES: { value: BoardTheme; label: string; lightColor: string; darkColor: string }[] =
  [
    { value: "brown", label: "Brown", lightColor: "#f0d9b5", darkColor: "#b58863" },
    { value: "blue", label: "Blue", lightColor: "#dee3e6", darkColor: "#8ca2ad" },
    { value: "green", label: "Green", lightColor: "#ffffdd", darkColor: "#86a666" },
    { value: "ic", label: "IC", lightColor: "#ececec", darkColor: "#c1c18e" },
  ];

const PIECE_THEMES: { value: PieceTheme; label: string }[] = [
  { value: "cburnett", label: "CBurnett" },
  { value: "merida", label: "Merida" },
  { value: "alpha", label: "Alpha" },
  { value: "california", label: "California" },
];

function BoardColorPreview({ lightColor, darkColor }: { lightColor: string; darkColor: string }) {
  return (
    <div className={styles.boardColorPreview} aria-hidden="true">
      <div className={styles.boardColorSquare} style={{ backgroundColor: lightColor }} />
      <div className={styles.boardColorSquare} style={{ backgroundColor: darkColor }} />
      <div className={styles.boardColorSquare} style={{ backgroundColor: darkColor }} />
      <div className={styles.boardColorSquare} style={{ backgroundColor: lightColor }} />
    </div>
  );
}

function MiniBoard({ boardTheme, pieceTheme }: { boardTheme: BoardTheme; pieceTheme: PieceTheme }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen: PREVIEW_FEN,
      viewOnly: true,
      coordinates: false,
      animation: { enabled: false },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  const themeClasses = [
    boardTheme !== "brown" ? `board-theme-${boardTheme}` : "",
    pieceTheme !== "cburnett" ? `piece-theme-${pieceTheme}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={themeClasses || undefined}>
      <div ref={containerRef} className={styles.miniBoard} />
    </div>
  );
}

function SettingsPage() {
  const { preference, setTheme } = useTheme();
  const { boardTheme, pieceTheme, setBoardTheme, setPieceTheme } = useBoardTheme();
  const { data: meData } = useGetMeQuery();
  const isAuthenticated = !!meData?.user;
  usePreferencesSync(isAuthenticated);

  const [muted, setMutedState] = useState(isMuted);

  function handleMuteToggle() {
    const newMuted = !muted;
    setMuted(newMuted);
    setMutedState(newMuted);
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      {/* App Theme Section */}
      <Card header="App Theme">
        <div className={styles.themeOptions} role="radiogroup" aria-label="App theme">
          {APP_THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={preference === t.value}
              className={`${styles.themeOption} ${preference === t.value ? styles.themeOptionActive : ""}`}
              onClick={() => setTheme(t.value)}
              data-testid={`theme-option-${t.value}`}
            >
              <span className={styles.themeOptionLabel}>{t.label}</span>
              <span className={styles.themeOptionDescription}>{t.description}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Board Theme Section */}
      <Card header="Board Theme">
        <div className={styles.boardThemeOptions} role="radiogroup" aria-label="Board theme">
          {BOARD_THEMES.map((bt) => (
            <button
              key={bt.value}
              type="button"
              role="radio"
              aria-checked={boardTheme === bt.value}
              className={`${styles.boardThemeOption} ${boardTheme === bt.value ? styles.boardThemeOptionActive : ""}`}
              onClick={() => setBoardTheme(bt.value)}
              data-testid={`board-theme-${bt.value}`}
            >
              <BoardColorPreview lightColor={bt.lightColor} darkColor={bt.darkColor} />
              <span className={styles.boardThemeLabel}>{bt.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Piece Set Section */}
      <Card header="Piece Set">
        <div className={styles.pieceThemeOptions} role="radiogroup" aria-label="Piece set">
          {PIECE_THEMES.map((pt) => (
            <button
              key={pt.value}
              type="button"
              role="radio"
              aria-checked={pieceTheme === pt.value}
              className={`${styles.pieceThemeOption} ${pieceTheme === pt.value ? styles.pieceThemeOptionActive : ""}`}
              onClick={() => setPieceTheme(pt.value)}
              data-testid={`piece-theme-${pt.value}`}
            >
              <MiniBoard boardTheme={boardTheme} pieceTheme={pt.value} />
              <span className={styles.pieceThemeLabel}>{pt.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Sound Section */}
      <Card header="Sound">
        <div className={styles.soundOption}>
          <div className={styles.soundOptionInfo}>
            <span className={styles.soundOptionLabel}>Game sounds</span>
            <span className={styles.soundOptionDescription}>
              Play sound effects for moves, captures, and game events
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            className={`${styles.muteToggle} ${!muted ? styles.muteToggleOn : ""}`}
            onClick={handleMuteToggle}
            data-testid="sound-toggle"
          >
            <span className={styles.muteToggleThumb} />
          </button>
        </div>
      </Card>
    </div>
  );
}

export { SettingsPage };
