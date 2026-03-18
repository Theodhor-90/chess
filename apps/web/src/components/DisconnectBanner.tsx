import { useAppSelector } from "../store/index.js";
import styles from "./DisconnectBanner.module.css";

export function DisconnectBanner() {
  const opponentConnected = useAppSelector((state) => state.game.opponentConnected);
  const connectionStatus = useAppSelector((state) => state.game.connectionStatus);
  const game = useAppSelector((state) => state.game.currentGame);

  const isActive = game?.status === "active";

  if (opponentConnected || !isActive) {
    return null;
  }

  const isUserDisconnected = connectionStatus === "disconnected";
  const bannerClass = `${styles.banner} ${isUserDisconnected ? styles.error : styles.warning}`;
  const message = isUserDisconnected
    ? "Connection lost — reconnecting..."
    : "Opponent disconnected — waiting for reconnection...";

  return (
    <div data-testid="disconnect-banner" className={bannerClass}>
      {message}
    </div>
  );
}
