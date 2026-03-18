import { useAppSelector } from "../store/index.js";
import styles from "./ConnectionStatus.module.css";

const STATUS_CONFIG = {
  connected: { dotClass: "dotConnected", label: "Connected" },
  connecting: { dotClass: "dotConnecting", label: "Reconnecting..." },
  disconnected: { dotClass: "dotDisconnected", label: "Disconnected" },
} as const;

export function ConnectionStatus() {
  const connectionStatus = useAppSelector((state) => state.game.connectionStatus);
  const config = STATUS_CONFIG[connectionStatus];

  return (
    <div
      data-testid="connection-status"
      className={styles.container}
      role="status"
      aria-live="polite"
    >
      <span
        data-testid="connection-dot"
        className={`${styles.dot} ${styles[config.dotClass]}`}
        aria-hidden="true"
      />
      <span data-testid="connection-label">{config.label}</span>
    </div>
  );
}
