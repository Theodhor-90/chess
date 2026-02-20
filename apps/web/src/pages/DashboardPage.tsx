import { useState } from "react";
import { CreateGameForm } from "../components/CreateGameForm.js";
import { WaitingScreen } from "../components/WaitingScreen.js";
import { GameList } from "../components/GameList.js";
import type { PlayerColor } from "@chess/shared";

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
      <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>
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
    <div style={{ padding: "16px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Chess Platform</h1>
      <CreateGameForm onGameCreated={handleGameCreated} />
      <hr style={{ margin: "24px 0" }} />
      <GameList />
    </div>
  );
}
