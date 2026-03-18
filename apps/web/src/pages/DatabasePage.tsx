import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router";
import type { DatabaseGameSortField, SortOrder, DatabaseGame } from "@chess/shared";

type DatabaseGameRow = Omit<DatabaseGame, "pgn">;
import { useGetDatabaseGamesQuery } from "../store/apiSlice.js";
import type { TableColumn } from "../components/ui/Table.js";
import { Card } from "../components/ui/Card.js";
import { Input } from "../components/ui/Input.js";
import { Select } from "../components/ui/Select.js";
import { Table } from "../components/ui/Table.js";
import { Badge } from "../components/ui/Badge.js";
import { Pagination } from "../components/ui/Pagination.js";
import styles from "./DatabasePage.module.css";

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

const RESULT_OPTIONS = [
  { value: "", label: "All" },
  { value: "1-0", label: "White wins" },
  { value: "0-1", label: "Black wins" },
  { value: "1/2-1/2", label: "Draw" },
];

function resultBadge(result: string) {
  if (result === "1-0") return <Badge variant="success">{result}</Badge>;
  if (result === "0-1") return <Badge variant="danger">{result}</Badge>;
  return <Badge variant="neutral">{result}</Badge>;
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

  function handleSort(columnKey: string) {
    const field = columnKey as DatabaseGameSortField;
    if (sort === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page} data-testid="db-loading">
        Loading...
      </div>
    );
  }

  const games = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: TableColumn<DatabaseGameRow>[] = [
    {
      key: "whiteElo",
      header: "White (Elo)",
      sortable: true,
      render: (row) => `${row.white} (${row.whiteElo})`,
    },
    {
      key: "blackElo",
      header: "Black (Elo)",
      sortable: true,
      render: (row) => `${row.black} (${row.blackElo})`,
    },
    {
      key: "eco",
      header: "ECO",
      sortable: true,
      render: (row) => row.eco ?? "—",
    },
    {
      key: "opening",
      header: "Opening",
      sortable: true,
      render: (row) => row.opening ?? "—",
    },
    {
      key: "result",
      header: "Result",
      render: (row) => resultBadge(row.result),
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (row) => row.date ?? "—",
    },
    {
      key: "timeControl",
      header: "Time Control",
      render: (row) => row.timeControl ?? "—",
    },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Game Database</h1>

      <Card className={styles.filterCard} header="Filters">
        <div className={styles.filterGrid}>
          <Input
            label="Player"
            name="filter-player"
            value={filters.player}
            onChange={(e) => handleFilterChange("player", e.target.value)}
            placeholder="Any player..."
            className={styles.filterField}
          />
          <Input
            label="White"
            name="filter-white"
            value={filters.white}
            onChange={(e) => handleFilterChange("white", e.target.value)}
            placeholder="White player..."
            className={styles.filterField}
          />
          <Input
            label="Black"
            name="filter-black"
            value={filters.black}
            onChange={(e) => handleFilterChange("black", e.target.value)}
            placeholder="Black player..."
            className={styles.filterField}
          />
          <Input
            label="Min Elo"
            name="filter-min-elo"
            value={filters.minElo}
            onChange={(e) => handleFilterChange("minElo", e.target.value)}
            placeholder="e.g. 2000"
            type="number"
            className={styles.filterField}
          />
          <Input
            label="Max Elo"
            name="filter-max-elo"
            value={filters.maxElo}
            onChange={(e) => handleFilterChange("maxElo", e.target.value)}
            placeholder="e.g. 2800"
            type="number"
            className={styles.filterField}
          />
          <Select
            label="Result"
            name="filter-result"
            value={filters.result}
            onChange={(e) => handleFilterChange("result", e.target.value)}
            options={RESULT_OPTIONS}
            className={styles.filterField}
          />
          <Input
            label="ECO"
            name="filter-eco"
            value={filters.eco}
            onChange={(e) => handleFilterChange("eco", e.target.value)}
            placeholder="e.g. C50"
            className={styles.filterField}
          />
          <Input
            label="Opening"
            name="filter-opening"
            value={filters.opening}
            onChange={(e) => handleFilterChange("opening", e.target.value)}
            placeholder="Opening name..."
            className={styles.filterField}
          />
          <Input
            label="Date from"
            name="filter-date-from"
            value={filters.dateFrom}
            onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            placeholder="YYYY.MM.DD"
            className={styles.filterField}
          />
          <Input
            label="Date to"
            name="filter-date-to"
            value={filters.dateTo}
            onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            placeholder="YYYY.MM.DD"
            className={styles.filterField}
          />
          <Input
            label="Time control"
            name="filter-time-control"
            value={filters.timeControl}
            onChange={(e) => handleFilterChange("timeControl", e.target.value)}
            placeholder="e.g. 600+0"
            className={styles.filterField}
          />
          <Input
            label="Termination"
            name="filter-termination"
            value={filters.termination}
            onChange={(e) => handleFilterChange("termination", e.target.value)}
            placeholder="e.g. Normal"
            className={styles.filterField}
          />
        </div>
      </Card>

      <div className={styles.totalInfo}>{total} total games</div>

      <Table<DatabaseGameRow>
        columns={columns}
        data={games}
        sortColumn={sort}
        sortDirection={order}
        onSort={handleSort}
        onRowClick={(row) => navigate(`/database/games/${row.id}/view`)}
        emptyMessage="No games found."
      />

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
