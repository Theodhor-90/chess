import { useState } from "react";
import { Link } from "react-router";
import { CreateGameForm } from "../components/CreateGameForm.js";
import { WaitingScreen } from "../components/WaitingScreen.js";
import { GameList } from "../components/GameList.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import type { PlayerColor } from "@chess/shared";
import styles from "./DashboardPage.module.css";

interface PendingGame {
  gameId: number;
  inviteToken: string;
  color: PlayerColor;
}

export function DashboardPage() {
  const [pendingGame, setPendingGame] = useState<PendingGame | null>(null);

  function handleGameCreated(gameId: number, inviteToken: string, color: PlayerColor) {
    setPendingGame({ gameId, inviteToken, color });
  }

  function handleCancel() {
    setPendingGame(null);
  }

  if (pendingGame) {
    return (
      <div className={styles.waitingWrapper}>
        <WaitingScreen
          gameId={pendingGame.gameId}
          inviteToken={pendingGame.inviteToken}
          color={pendingGame.color}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Chess Platform</h1>

      <Card header="Create Game">
        <CreateGameForm onGameCreated={handleGameCreated} />
      </Card>

      <div className={styles.quickLinks}>
        <Link to="/play/bot" data-testid="bot-link" className={styles.quickLink}>
          <Button variant="secondary">Play vs Bot</Button>
        </Link>
        <Link to="/training" data-testid="training-link" className={styles.quickLink}>
          <Button variant="secondary">Training Board</Button>
        </Link>
        <Link to="/history" data-testid="history-link" className={styles.quickLink}>
          <Button variant="secondary">Game History</Button>
        </Link>
      </div>

      <Card header="Your Games">
        <div className={styles.gamesSection}>
          <GameList />
        </div>
      </Card>
    </div>
  );
}
