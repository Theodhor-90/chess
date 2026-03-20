import type { ChangeEvent } from "react";
import type { RatingBracket, SpeedCategory } from "@chess/shared";
import styles from "./ExplorerPlatformFilters.module.css";

const ALL_RATING_BRACKETS: RatingBracket[] = [
  "0-1000",
  "1000-1200",
  "1200-1400",
  "1400-1600",
  "1600-1800",
  "1800-2000",
  "2000-2200",
  "2200+",
];

const ALL_SPEED_CATEGORIES: SpeedCategory[] = ["bullet", "blitz", "rapid", "classical"];

interface PlatformFilterState {
  ratings: RatingBracket[];
  speeds: SpeedCategory[];
  since: string;
  until: string;
}

interface ExplorerPlatformFiltersProps {
  filters: PlatformFilterState;
  onChange: (filters: PlatformFilterState) => void;
}

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

function ExplorerPlatformFilters({ filters, onChange }: ExplorerPlatformFiltersProps) {
  const handleRatingToggle = (bracket: RatingBracket) => {
    onChange({ ...filters, ratings: toggleItem(filters.ratings, bracket) });
  };

  const handleSpeedToggle = (speed: SpeedCategory) => {
    onChange({ ...filters, speeds: toggleItem(filters.speeds, speed) });
  };

  const handleSinceChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, since: e.target.value });
  };

  const handleUntilChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, until: e.target.value });
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Rating</span>
        <div className={styles.chipRow}>
          {ALL_RATING_BRACKETS.map((bracket) => (
            <button
              key={bracket}
              type="button"
              className={`${styles.chip}${filters.ratings.includes(bracket) ? ` ${styles.chipActive}` : ""}`}
              onClick={() => handleRatingToggle(bracket)}
              aria-pressed={filters.ratings.includes(bracket)}
            >
              {bracket}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Speed</span>
        <div className={styles.chipRow}>
          {ALL_SPEED_CATEGORIES.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`${styles.chip}${filters.speeds.includes(speed) ? ` ${styles.chipActive}` : ""}`}
              onClick={() => handleSpeedToggle(speed)}
              aria-pressed={filters.speeds.includes(speed)}
            >
              {speed}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.dateRow}>
        <div className={styles.dateField}>
          <label htmlFor="platform-since" className={styles.dateLabel}>
            Since
          </label>
          <input
            id="platform-since"
            type="month"
            className={styles.dateInput}
            value={filters.since}
            onChange={handleSinceChange}
          />
        </div>
        <div className={styles.dateField}>
          <label htmlFor="platform-until" className={styles.dateLabel}>
            Until
          </label>
          <input
            id="platform-until"
            type="month"
            className={styles.dateInput}
            value={filters.until}
            onChange={handleUntilChange}
          />
        </div>
      </div>
    </div>
  );
}

export { ExplorerPlatformFilters, ALL_RATING_BRACKETS, ALL_SPEED_CATEGORIES };
export type { ExplorerPlatformFiltersProps, PlatformFilterState };
