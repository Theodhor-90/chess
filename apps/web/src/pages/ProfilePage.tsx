import { useParams, useNavigate, Link } from "react-router";
import { useGetUserStatsQuery } from "../store/apiSlice.js";
import type { RecentGameItem } from "@chess/shared";
import type { TableColumn } from "../components/ui/Table.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { Table } from "../components/ui/Table.js";
import { PageSkeleton } from "../components/ui/Skeleton.js";
import styles from "./ProfilePage.module.css";

function resultBadge(result: "win" | "loss" | "draw") {
  const map = {
    win: { variant: "success" as const, label: "W" },
    loss: { variant: "danger" as const, label: "L" },
    draw: { variant: "neutral" as const, label: "D" },
  };
  const { variant, label } = map[result];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = Number(id);
  const { data, isLoading, isError } = useGetUserStatsQuery(userId);

  if (isLoading) {
    return (
      <div className={styles.page} data-testid="profile-loading">
        <PageSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={styles.page} data-testid="profile-error">
        User not found.
      </div>
    );
  }

  const pct = (count: number) =>
    data.totalGames > 0 ? ((count / data.totalGames) * 100).toFixed(1) : "0.0";

  const recentColumns: TableColumn<RecentGameItem>[] = [
    {
      key: "opponentUsername",
      header: "Opponent",
      truncate: true,
      render: (row) => (
        <span className={styles.opponentCell}>
          {row.botLevel != null ? (
            <span className={styles.opponentName}>{row.opponentUsername}</span>
          ) : (
            <Link
              to={`/profile/${row.opponentId}`}
              onClick={(e) => e.stopPropagation()}
              className={styles.opponentLink}
            >
              {row.opponentUsername}
            </Link>
          )}
          {row.botLevel != null && (
            <Badge variant="info" size="sm">
              Bot
            </Badge>
          )}
        </span>
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
      key: "playedAt",
      header: "Date",
      render: (row) => new Date(row.playedAt * 1000).toLocaleDateString(),
    },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{data.username}</h1>

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <div className={styles.statLabel}>Total Games</div>
          <div className={styles.statValue}>{data.totalGames}</div>
        </Card>

        <Card className={styles.statCard}>
          <div className={styles.statLabel}>Win Rate</div>
          <div className={`${styles.statValue} ${styles.statValueSuccess}`}>{data.winRate}%</div>
        </Card>

        <Card className={styles.statCard}>
          <div className={styles.statLabel}>Record</div>
          <div className={styles.recordLine}>
            <Badge variant="success">
              {data.wins}W ({pct(data.wins)}%)
            </Badge>
            <Badge variant="danger">
              {data.losses}L ({pct(data.losses)}%)
            </Badge>
            <Badge variant="neutral">
              {data.draws}D ({pct(data.draws)}%)
            </Badge>
          </div>
        </Card>

        <Card className={styles.statCard}>
          <div className={styles.statLabel}>Avg Accuracy</div>
          {data.avgAccuracy.white === null && data.avgAccuracy.black === null ? (
            <div className={styles.statValue}>N/A</div>
          ) : (
            <div>
              <div>
                White: {data.avgAccuracy.white !== null ? `${data.avgAccuracy.white}%` : "N/A"}
              </div>
              <div>
                Black: {data.avgAccuracy.black !== null ? `${data.avgAccuracy.black}%` : "N/A"}
              </div>
            </div>
          )}
        </Card>
      </div>

      <h2 className={styles.sectionTitle}>Recent Games</h2>

      <Table<RecentGameItem>
        columns={recentColumns}
        data={data.recentGames}
        onRowClick={(row) => navigate(`/analysis/${row.gameId}`)}
        emptyMessage="No games played yet."
      />
    </div>
  );
}
