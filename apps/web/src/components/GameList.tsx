import { Link } from "react-router";
import { useGetMyGamesQuery, useGetMeQuery } from "../store/apiSlice.js";
import type { GameListItem, GameStatus } from "@chess/shared";

function formatTimeControl(initialTime: number, increment: number): string {
  const minutes = Math.floor(initialTime / 60);
  return `${minutes}+${increment}`;
}

function getStatusLabel(status: GameStatus): string {
  switch (status) {
    case "waiting":
      return "Waiting";
    case "active":
      return "Active";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function getResultLabel(game: GameListItem, myUserId: number | null): string {
  if (game.status === "waiting" || game.status === "active") {
    return "";
  }
  if (!game.result) {
    return "";
  }
  if (!game.result.winner) {
    return "Draw";
  }
  const myColor =
    game.players.white?.userId === myUserId
      ? "white"
      : game.players.black?.userId === myUserId
        ? "black"
        : null;
  if (!myColor) return "";
  return game.result.winner === myColor ? "You won" : "You lost";
}

function getOpponentLabel(game: GameListItem, myUserId: number | null): string {
  if (!myUserId) return "";
  if (game.players.white?.userId === myUserId) {
    return game.players.black ? `User #${game.players.black.userId}` : "Waiting for opponent...";
  }
  if (game.players.black?.userId === myUserId) {
    return game.players.white ? `User #${game.players.white.userId}` : "Waiting for opponent...";
  }
  return "";
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
  // Sort completed by most recent first
  completed.sort((a, b) => b.createdAt - a.createdAt);
  return [...active, ...waiting, ...completed];
}

export function GameList() {
  const { data: games, isLoading, isError } = useGetMyGamesQuery();
  const { data: meData } = useGetMeQuery();
  const myUserId = meData?.user?.id ?? null;

  if (isLoading) {
    return <div data-testid="game-list-loading">Loading games...</div>;
  }

  if (isError) {
    return <div data-testid="game-list-error">Failed to load games.</div>;
  }

  if (!games || games.length === 0) {
    return (
      <div data-testid="game-list">
        <h2>Your Games</h2>
        <p>No games yet</p>
      </div>
    );
  }

  const sorted = sortGames([...games]);

  return (
    <div data-testid="game-list">
      <h2>Your Games</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px" }}>Opponent</th>
            <th style={{ textAlign: "left", padding: "8px" }}>Time</th>
            <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
            <th style={{ textAlign: "left", padding: "8px" }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((game) => (
            <tr key={game.id} data-testid={`game-row-${game.id}`}>
              <td style={{ padding: "8px" }}>
                <Link to={`/game/${game.id}`}>{getOpponentLabel(game, myUserId)}</Link>
              </td>
              <td style={{ padding: "8px" }}>
                {formatTimeControl(game.clock.initialTime, game.clock.increment)}
              </td>
              <td style={{ padding: "8px" }}>{getStatusLabel(game.status)}</td>
              <td style={{ padding: "8px" }}>{getResultLabel(game, myUserId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
