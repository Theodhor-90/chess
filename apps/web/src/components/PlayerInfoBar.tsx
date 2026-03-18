import { Link } from "react-router";
import { Clock } from "./Clock.js";
import styles from "./PlayerInfoBar.module.css";

interface PlayerInfoBarProps {
  username: string;
  userId: number | null;
  timeMs: number;
  isActive: boolean;
  lastUpdate: number;
  fen: string;
  color: "white" | "black";
  testIdPrefix: "top" | "bottom";
}

const STARTING_COUNTS: Record<string, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
};

const BLACK_PIECE_SYMBOLS: Record<string, string> = {
  q: "\u265B",
  r: "\u265C",
  b: "\u265D",
  n: "\u265E",
  p: "\u265F",
};

const WHITE_PIECE_SYMBOLS: Record<string, string> = {
  Q: "\u2655",
  R: "\u2656",
  B: "\u2657",
  N: "\u2658",
  P: "\u2659",
};

const VALUE_ORDER = ["q", "r", "b", "n", "p"];

export function computeCapturedPieces(fen: string, color: "white" | "black"): string[] {
  const board = fen.split(" ")[0];

  const counts: Record<string, number> = {};
  for (const ch of board) {
    if (ch !== "/" && (ch < "1" || ch > "8")) {
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
  }

  const result: string[] = [];

  if (color === "white") {
    for (const piece of VALUE_ORDER) {
      const current = counts[piece] ?? 0;
      const missing = STARTING_COUNTS[piece] - current;
      for (let i = 0; i < missing; i++) {
        result.push(BLACK_PIECE_SYMBOLS[piece]);
      }
    }
  } else {
    for (const piece of VALUE_ORDER) {
      const upper = piece.toUpperCase();
      const current = counts[upper] ?? 0;
      const missing = STARTING_COUNTS[piece] - current;
      for (let i = 0; i < missing; i++) {
        result.push(WHITE_PIECE_SYMBOLS[upper]);
      }
    }
  }

  return result;
}

export function PlayerInfoBar({
  username,
  userId,
  timeMs,
  isActive,
  lastUpdate,
  fen,
  color,
  testIdPrefix,
}: PlayerInfoBarProps) {
  const captured = computeCapturedPieces(fen, color);

  return (
    <div className={styles.bar} data-testid={`${testIdPrefix}-player-bar`}>
      <div className={styles.playerInfo}>
        {userId !== null ? (
          <Link
            to={`/profile/${userId}`}
            className={styles.usernameLink}
            data-testid={`${testIdPrefix}-player-label`}
          >
            {username}
          </Link>
        ) : (
          <span className={styles.username} data-testid={`${testIdPrefix}-player-label`}>
            {username}
          </span>
        )}
        <div
          className={styles.captured}
          data-testid={`${testIdPrefix}-captured`}
          aria-label={
            captured.length > 0
              ? `${captured.length} captured piece${captured.length === 1 ? "" : "s"}`
              : "No captured pieces"
          }
        >
          {captured.map((symbol, i) => (
            <span key={i} className={styles.capturedPiece} aria-hidden="true">
              {symbol}
            </span>
          ))}
        </div>
      </div>
      <Clock timeMs={timeMs} isActive={isActive} lastUpdate={lastUpdate} />
    </div>
  );
}
