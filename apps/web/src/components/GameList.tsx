import { useNavigate, Link } from "react-router";
import { useGetMyGamesQuery, useGetMeQuery } from "../store/apiSlice.js";
import { Table } from "./ui/Table.js";
import { Badge } from "./ui/Badge.js";
import type { TableColumn } from "./ui/Table.js";
import type { GameListItem, GameStatus } from "@chess/shared";
import { BOT_PROFILES } from "@chess/shared";
import { TableSkeleton } from "./ui/Skeleton.js";
import styles from "./GameList.module.css";

function formatTimeControl(initialTime: number, increment: number): string {
  const minutes = Math.floor(initialTime / 60);
  return `${minutes}+${increment}`;
}

function isTerminalStatus(status: GameStatus): boolean {
  return (
    status === "checkmate" ||
    status === "stalemate" ||
    status === "resigned" ||
    status === "draw" ||
    status === "timeout"
  );
}

function getOpponentLabel(game: GameListItem, myUserId: number | null): string {
  if (!myUserId) return "";
  if (game.players.white?.userId === myUserId) {
    const opponent = game.players.black;
    if (opponent) return opponent.username ?? `User #${opponent.userId}`;
    if (game.botLevel != null) {
      const profile = BOT_PROFILES.find((p) => p.level === game.botLevel);
      return profile?.name ?? "Bot";
    }
    return "Waiting for opponent...";
  }
  if (game.players.black?.userId === myUserId) {
    const opponent = game.players.white;
    if (opponent) return opponent.username ?? `User #${opponent.userId}`;
    if (game.botLevel != null) {
      const profile = BOT_PROFILES.find((p) => p.level === game.botLevel);
      return profile?.name ?? "Bot";
    }
    return "Waiting for opponent...";
  }
  return "";
}

function getOpponentId(game: GameListItem, myUserId: number | null): number | null {
  if (!myUserId) return null;
  if (game.players.white?.userId === myUserId) {
    return game.players.black?.userId ?? null;
  }
  if (game.players.black?.userId === myUserId) {
    return game.players.white?.userId ?? null;
  }
  return null;
}

function getStatusBadge(game: GameListItem): {
  label: string;
  variant: "info" | "warning" | "neutral";
} {
  if (game.status === "active") {
    return { label: "Active", variant: "info" };
  }
  if (game.status === "waiting") {
    return { label: "Waiting", variant: "warning" };
  }
  return { label: "Completed", variant: "neutral" };
}

function getResultBadge(
  game: GameListItem,
  myUserId: number | null,
): { label: string; variant: "success" | "danger" | "neutral" } | null {
  if (game.status === "waiting" || game.status === "active") {
    return null;
  }
  if (!game.result) {
    return null;
  }
  if (!game.result.winner) {
    return { label: "Draw", variant: "neutral" };
  }
  const myColor =
    game.players.white?.userId === myUserId
      ? "white"
      : game.players.black?.userId === myUserId
        ? "black"
        : null;
  if (!myColor) return null;
  if (game.result.winner === myColor) {
    return { label: "Won", variant: "success" };
  }
  return { label: "Lost", variant: "danger" };
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString();
}

function sortGames(games: GameListItem[]): GameListItem[] {
  const active: GameListItem[] = [];
  const waiting: GameListItem[] = [];
  const completed: GameListItem[] = [];
  for (const game of games) {
    if (game.status === "active") active.push(game);
    else if (game.status === "waiting") waiting.push(game);
    else completed.push(game);
  }
  completed.sort((a, b) => b.createdAt - a.createdAt);
  return [...active, ...waiting, ...completed];
}

export function GameList() {
  const { data: games, isLoading, isError } = useGetMyGamesQuery();
  const { data: meData } = useGetMeQuery();
  const navigate = useNavigate();
  const myUserId = meData?.user?.id ?? null;

  if (isLoading) {
    return <TableSkeleton testId="game-list-loading" rows={3} />;
  }

  if (isError) {
    return <div data-testid="game-list-error">Failed to load games.</div>;
  }

  const sorted = games ? sortGames([...games]) : [];

  const columns: TableColumn<GameListItem>[] = [
    {
      key: "opponent",
      header: "Opponent",
      truncate: true,
      render: (game) => {
        const opponentId = getOpponentId(game, myUserId);
        const label = getOpponentLabel(game, myUserId);
        const botBadge =
          game.botLevel != null ? (
            <Badge variant="info" size="sm">
              Bot
            </Badge>
          ) : null;
        if (opponentId) {
          return (
            <span className={styles.opponentCell}>
              <Link
                to={`/profile/${opponentId}`}
                className={styles.opponentLink}
                onClick={(e) => e.stopPropagation()}
              >
                {label}
              </Link>
              {botBadge}
            </span>
          );
        }
        return (
          <span className={styles.opponentCell}>
            {label}
            {botBadge}
          </span>
        );
      },
    },
    {
      key: "timeControl",
      header: "Time",
      render: (game) => (
        <Badge variant="neutral" size="sm">
          {formatTimeControl(game.clock.initialTime, game.clock.increment)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (game) => {
        const { label, variant } = getStatusBadge(game);
        return (
          <Badge variant={variant} size="sm">
            {label}
          </Badge>
        );
      },
    },
    {
      key: "result",
      header: "Result",
      render: (game) => {
        const badge = getResultBadge(game, myUserId);
        if (!badge) return null;
        return (
          <Badge variant={badge.variant} size="sm">
            {badge.label}
          </Badge>
        );
      },
    },
    {
      key: "date",
      header: "Date",
      render: (game) => formatDate(game.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (game) => {
        if (isTerminalStatus(game.status)) {
          return (
            <Link
              to={`/analysis/${game.id}`}
              data-testid={`analyze-link-${game.id}`}
              className={styles.analyzeLink}
              onClick={(e) => e.stopPropagation()}
            >
              Analyze
            </Link>
          );
        }
        return null;
      },
    },
  ];

  function handleRowClick(game: GameListItem): void {
    if (isTerminalStatus(game.status)) {
      navigate(`/analysis/${game.id}`);
    } else if (game.status === "active") {
      navigate(`/game/${game.id}`);
    }
  }

  return (
    <div data-testid="game-list" className={styles.container}>
      <Table<GameListItem>
        columns={columns}
        data={sorted}
        onRowClick={handleRowClick}
        emptyMessage="No games yet. Create one above to get started!"
      />
    </div>
  );
}
