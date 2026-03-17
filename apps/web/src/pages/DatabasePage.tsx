import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router";
import type { DatabaseGameSortField, SortOrder } from "@chess/shared";
import { useGetDatabaseGamesQuery } from "../store/apiSlice.js";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

interface FilterState {
  player: string;
  white: string;
  black: string;
  minElo: string;
  maxElo: string;
  result: string;
  eco: string;
  opening: string;
  dateFrom: string;
  dateTo: string;
  timeControl: string;
  termination: string;
}

function parseSearchParams(searchParams: URLSearchParams): FilterState {
  return {
    player: searchParams.get("player") ?? "",
    white: searchParams.get("white") ?? "",
    black: searchParams.get("black") ?? "",
    minElo: searchParams.get("minElo") ?? "",
    maxElo: searchParams.get("maxElo") ?? "",
    result: searchParams.get("result") ?? "",
    eco: searchParams.get("eco") ?? "",
    opening: searchParams.get("opening") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    timeControl: searchParams.get("timeControl") ?? "",
    termination: searchParams.get("termination") ?? "",
  };
}

function buildSearchParams(
  filters: FilterState,
  page: number,
  sort: DatabaseGameSortField,
  order: SortOrder,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  if (sort !== "date") params.set("sort", sort);
  if (order !== "desc") params.set("order", order);
  return params;
}

export function DatabasePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(() => parseSearchParams(searchParams));
  const [page, setPage] = useState(() => {
    const p = searchParams.get("page");
    return p ? Math.max(1, parseInt(p, 10) || 1) : 1;
  });
  const [sort, setSort] = useState<DatabaseGameSortField>(() => {
    const s = searchParams.get("sort");
    return (["date", "whiteElo", "blackElo", "opening", "eco"] as const).includes(
      s as DatabaseGameSortField,
    )
      ? (s as DatabaseGameSortField)
      : "date";
  });
  const [order, setOrder] = useState<SortOrder>(() => {
    const o = searchParams.get("order");
    return o === "asc" ? "asc" : "desc";
  });

  const debouncedFilters = useDebounce(filters, DEBOUNCE_MS);

  const queryParams = {
    page,
    limit: PAGE_SIZE,
    sort,
    order,
    player: debouncedFilters.player || undefined,
    white: debouncedFilters.white || undefined,
    black: debouncedFilters.black || undefined,
    minElo: debouncedFilters.minElo ? parseInt(debouncedFilters.minElo, 10) : undefined,
    maxElo: debouncedFilters.maxElo ? parseInt(debouncedFilters.maxElo, 10) : undefined,
    result: debouncedFilters.result || undefined,
    eco: debouncedFilters.eco || undefined,
    opening: debouncedFilters.opening || undefined,
    dateFrom: debouncedFilters.dateFrom || undefined,
    dateTo: debouncedFilters.dateTo || undefined,
    timeControl: debouncedFilters.timeControl || undefined,
    termination: debouncedFilters.termination || undefined,
  };

  const { data, isLoading } = useGetDatabaseGamesQuery(queryParams);

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = buildSearchParams(debouncedFilters, page, sort, order);
    setSearchParams(params, { replace: true });
  }, [debouncedFilters, page, sort, order, setSearchParams]);

  const prevFiltersRef = useRef(debouncedFilters);
  useEffect(() => {
    if (prevFiltersRef.current !== debouncedFilters) {
      prevFiltersRef.current = debouncedFilters;
      setPage(1);
    }
  }, [debouncedFilters]);

  function handleFilterChange(field: keyof FilterState, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function handleSort(field: DatabaseGameSortField) {
    if (sort === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
  }

  const containerStyle = { maxWidth: "1100px", margin: "0 auto", padding: "16px" };
  const labelStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
    fontSize: "12px",
    color: "#666",
  };
  const inputStyle = {
    padding: "4px 8px",
    fontSize: "14px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    width: "140px",
  };
  const thStyle = {
    padding: "8px",
    textAlign: "left" as const,
    cursor: "pointer",
    userSelect: "none" as const,
  };
  const tdStyle = { padding: "8px" };

  function sortIndicator(field: DatabaseGameSortField): string {
    if (sort !== field) return "";
    return order === "asc" ? " ↑" : " ↓";
  }

  if (isLoading) {
    return (
      <div style={containerStyle} data-testid="db-loading">
        Loading...
      </div>
    );
  }

  const games = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={containerStyle}>
      <h1>Game Database</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <label style={labelStyle}>
          Player
          <input
            type="text"
            value={filters.player}
            onChange={(e) => handleFilterChange("player", e.target.value)}
            placeholder="Any player..."
            style={inputStyle}
            data-testid="filter-player"
          />
        </label>
        <label style={labelStyle}>
          White
          <input
            type="text"
            value={filters.white}
            onChange={(e) => handleFilterChange("white", e.target.value)}
            placeholder="White player..."
            style={inputStyle}
            data-testid="filter-white"
          />
        </label>
        <label style={labelStyle}>
          Black
          <input
            type="text"
            value={filters.black}
            onChange={(e) => handleFilterChange("black", e.target.value)}
            placeholder="Black player..."
            style={inputStyle}
            data-testid="filter-black"
          />
        </label>
        <label style={labelStyle}>
          Min Elo
          <input
            type="number"
            value={filters.minElo}
            onChange={(e) => handleFilterChange("minElo", e.target.value)}
            placeholder="e.g. 2000"
            style={inputStyle}
            data-testid="filter-min-elo"
          />
        </label>
        <label style={labelStyle}>
          Max Elo
          <input
            type="number"
            value={filters.maxElo}
            onChange={(e) => handleFilterChange("maxElo", e.target.value)}
            placeholder="e.g. 2800"
            style={inputStyle}
            data-testid="filter-max-elo"
          />
        </label>
        <label style={labelStyle}>
          Result
          <select
            value={filters.result}
            onChange={(e) => handleFilterChange("result", e.target.value)}
            style={inputStyle}
            data-testid="filter-result"
          >
            <option value="">All</option>
            <option value="1-0">White wins</option>
            <option value="0-1">Black wins</option>
            <option value="1/2-1/2">Draw</option>
          </select>
        </label>
        <label style={labelStyle}>
          ECO
          <input
            type="text"
            value={filters.eco}
            onChange={(e) => handleFilterChange("eco", e.target.value)}
            placeholder="e.g. C50"
            style={inputStyle}
            data-testid="filter-eco"
          />
        </label>
        <label style={labelStyle}>
          Opening
          <input
            type="text"
            value={filters.opening}
            onChange={(e) => handleFilterChange("opening", e.target.value)}
            placeholder="Opening name..."
            style={inputStyle}
            data-testid="filter-opening"
          />
        </label>
        <label style={labelStyle}>
          Date from
          <input
            type="text"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            placeholder="YYYY.MM.DD"
            style={inputStyle}
            data-testid="filter-date-from"
          />
        </label>
        <label style={labelStyle}>
          Date to
          <input
            type="text"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            placeholder="YYYY.MM.DD"
            style={inputStyle}
            data-testid="filter-date-to"
          />
        </label>
        <label style={labelStyle}>
          Time control
          <input
            type="text"
            value={filters.timeControl}
            onChange={(e) => handleFilterChange("timeControl", e.target.value)}
            placeholder="e.g. 600+0"
            style={inputStyle}
            data-testid="filter-time-control"
          />
        </label>
        <label style={labelStyle}>
          Termination
          <input
            type="text"
            value={filters.termination}
            onChange={(e) => handleFilterChange("termination", e.target.value)}
            placeholder="e.g. Normal"
            style={inputStyle}
            data-testid="filter-termination"
          />
        </label>
      </div>
      {games.length === 0 ? (
        <div data-testid="db-empty">No games found.</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort("whiteElo")}>
                  White (Elo)
                  {sortIndicator("whiteElo")}
                </th>
                <th style={thStyle} onClick={() => handleSort("blackElo")}>
                  Black (Elo)
                  {sortIndicator("blackElo")}
                </th>
                <th style={thStyle} onClick={() => handleSort("eco")}>
                  ECO
                  {sortIndicator("eco")}
                </th>
                <th style={thStyle} onClick={() => handleSort("opening")}>
                  Opening
                  {sortIndicator("opening")}
                </th>
                <th style={{ ...thStyle, cursor: "default" }}>Result</th>
                <th style={thStyle} onClick={() => handleSort("date")}>
                  Date
                  {sortIndicator("date")}
                </th>
                <th style={{ ...thStyle, cursor: "default" }}>Time Control</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => (
                <tr
                  key={game.id}
                  data-testid={`db-game-row-${game.id}`}
                  onClick={() => navigate(`/database/games/${game.id}/view`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={tdStyle}>
                    {game.white} ({game.whiteElo})
                  </td>
                  <td style={tdStyle}>
                    {game.black} ({game.blackElo})
                  </td>
                  <td style={tdStyle}>{game.eco ?? "—"}</td>
                  <td style={tdStyle}>{game.opening ?? "—"}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        color:
                          game.result === "1-0"
                            ? "#4CAF50"
                            : game.result === "0-1"
                              ? "#d32f2f"
                              : "#757575",
                        fontWeight: "bold",
                      }}
                    >
                      {game.result}
                    </span>
                  </td>
                  <td style={tdStyle}>{game.date ?? "—"}</td>
                  <td style={tdStyle}>{game.timeControl ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            data-testid="db-pagination"
            style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <button
              data-testid="db-prev"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span data-testid="db-page-info">
              Page {page} of {totalPages} ({total} total games)
            </span>
            <button
              data-testid="db-next"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
