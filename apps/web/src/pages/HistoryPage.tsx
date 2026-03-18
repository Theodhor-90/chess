import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useGetGameHistoryQuery } from "../store/apiSlice.js";
import type { GameHistoryItem } from "@chess/shared";
import type { TableColumn } from "../components/ui/Table.js";
import { Card } from "../components/ui/Card.js";
import { Select } from "../components/ui/Select.js";
import { Table } from "../components/ui/Table.js";
import { Badge } from "../components/ui/Badge.js";
import { Pagination } from "../components/ui/Pagination.js";
import { TableSkeleton } from "../components/ui/Skeleton.js";
import styles from "./HistoryPage.module.css";

const PAGE_SIZE = 20;

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "win", label: "Wins" },
  { value: "loss", label: "Losses" },
  { value: "draw", label: "Draws" },
];

function resultBadge(result: "win" | "loss" | "draw") {
  const map = {
    win: { variant: "success" as const, label: "W" },
    loss: { variant: "danger" as const, label: "L" },
    draw: { variant: "neutral" as const, label: "D" },
  };
  const { variant, label } = map[result];
  return <Badge variant={variant}>{label}</Badge>;
}

export function HistoryPage() {
  const [filter, setFilter] = useState<"all" | "win" | "loss" | "draw">("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useGetGameHistoryQuery({
    page,
    limit: PAGE_SIZE,
    result: filter === "all" ? undefined : filter,
    sort: "newest",
  });

  function handleFilterChange(value: string) {
    setFilter(value as "all" | "win" | "loss" | "draw");
    setPage(1);
  }

  if (isLoading) {
    return (
      <div className={styles.page} data-testid="history-loading">
        <TableSkeleton testId="history-loading-skeleton" />
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: TableColumn<GameHistoryItem>[] = [
    {
      key: "opponentUsername",
      header: "Opponent",
      truncate: true,
      render: (row) => (
        <Link
          to={`/profile/${row.opponentId}`}
          onClick={(e) => e.stopPropagation()}
          className={styles.opponentLink}
        >
          {row.opponentUsername}
        </Link>
      ),
    },
    {
      key: "result",
      header: "Result",
      render: (row) => resultBadge(row.result),
    },
    {
      key: "resultReason",
      header: "Reason",
      render: (row) => row.resultReason.charAt(0).toUpperCase() + row.resultReason.slice(1),
    },
    {
      key: "timeControl",
      header: "Time Control",
    },
    {
      key: "playedAt",
      header: "Date",
      render: (row) => new Date(row.playedAt * 1000).toLocaleDateString(),
    },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Game History</h1>

      <Card className={styles.filterRow}>
        <Select
          label="Filter by result"
          name="history-filter"
          value={filter}
          onChange={(e) => handleFilterChange(e.target.value)}
          options={FILTER_OPTIONS}
        />
      </Card>

      <Table<GameHistoryItem>
        columns={columns}
        data={items}
        onRowClick={(row) => navigate(`/analysis/${row.id}`)}
        emptyMessage="No games found."
      />

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
