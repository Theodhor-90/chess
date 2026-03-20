import type { ChangeEvent } from "react";
import styles from "./ExplorerMastersFilters.module.css";

interface MastersFilterState {
  since: string;
  until: string;
}

interface ExplorerMastersFiltersProps {
  filters: MastersFilterState;
  onChange: (filters: MastersFilterState) => void;
}

function ExplorerMastersFilters({ filters, onChange }: ExplorerMastersFiltersProps) {
  const handleSinceChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, since: e.target.value });
  };

  const handleUntilChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, until: e.target.value });
  };

  return (
    <div className={styles.container}>
      <div className={styles.field}>
        <label htmlFor="masters-since" className={styles.label}>
          Since
        </label>
        <input
          id="masters-since"
          type="number"
          className={styles.input}
          placeholder="Year"
          value={filters.since}
          onChange={handleSinceChange}
          min={1800}
          max={2100}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="masters-until" className={styles.label}>
          Until
        </label>
        <input
          id="masters-until"
          type="number"
          className={styles.input}
          placeholder="Year"
          value={filters.until}
          onChange={handleUntilChange}
          min={1800}
          max={2100}
        />
      </div>
    </div>
  );
}

export { ExplorerMastersFilters };
export type { ExplorerMastersFiltersProps, MastersFilterState };
