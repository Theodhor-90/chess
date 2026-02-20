import { useAppSelector } from "../store/index.js";

export function DisconnectBanner() {
  const opponentConnected = useAppSelector((state) => state.game.opponentConnected);
  const game = useAppSelector((state) => state.game.currentGame);

  const isActive = game?.status === "active";

  if (opponentConnected || !isActive) {
    return null;
  }

  return (
    <div
      data-testid="disconnect-banner"
      style={{
        padding: "8px 16px",
        backgroundColor: "#fff3cd",
        color: "#856404",
        borderRadius: "4px",
        textAlign: "center",
        fontWeight: "bold",
      }}
    >
      Opponent disconnected — waiting for reconnection...
    </div>
  );
}
