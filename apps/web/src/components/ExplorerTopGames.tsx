import { useState } from "react";
import { useNavigate } from "react-router";
import type { ExplorerTopGame } from "@chess/shared";
import { Badge } from "./ui/Badge.js";
import styles from "./ExplorerTopGames.module.css";

type ExplorerSource = "masters" | "platform" | "personal";

interface ExplorerTopGamesProps {
  games: ExplorerTopGame[];
  source: ExplorerSource;
}

function resultBadgeVariant(result: string): "success" | "danger" | "neutral" {
  if (result === "1-0") return "success";
  if (result === "0-1") return "danger";
  return "neutral";
}

function ExplorerTopGames({ games, source }: ExplorerTopGamesProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  if (games.length === 0) {
    return null;
  }

  const handleGameClick = (game: ExplorerTopGame) => {
    if (source === "masters") {
      navigate(`/database/games/${game.id}/view`);
    } else {
      navigate(`/analysis/${game.id}`);
    }
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
      >
        <span className={styles.headerText}>Top Games</span>
        <span className={styles.chevron} aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>
      {!collapsed && (
        <div className={styles.list} role="list">
          {games.slice(0, 8).map((game) => (
            <button
              key={game.id}
              type="button"
              className={styles.row}
              role="listitem"
              onClick={() => handleGameClick(game)}
              aria-label={`${game.white} (${game.whiteRating}) vs ${game.black} (${game.blackRating}), ${game.result}, ${game.year}`}
            >
              <span className={styles.players}>
                <span className={styles.playerWhite}>
                  {game.white}
                  <span className={styles.rating}>{game.whiteRating}</span>
                </span>
                <Badge variant={resultBadgeVariant(game.result)} size="sm">
                  {game.result === "1/2-1/2" ? "½-½" : game.result}
                </Badge>
                <span className={styles.playerBlack}>
                  {game.black}
                  <span className={styles.rating}>{game.blackRating}</span>
                </span>
              </span>
              <span className={styles.year}>{game.year}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { ExplorerTopGames };
export type { ExplorerTopGamesProps, ExplorerSource };
