import { useAppSelector } from "../store/index.js";

const STATUS_CONFIG = {
  connected: { color: "#28a745", label: "Connected" },
  connecting: { color: "#ffc107", label: "Reconnecting..." },
  disconnected: { color: "#dc3545", label: "Disconnected" },
} as const;

export function ConnectionStatus() {
  const connectionStatus = useAppSelector((state) => state.game.connectionStatus);
  const config = STATUS_CONFIG[connectionStatus];

  return (
    <div
      data-testid="connection-status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        color: "#666",
      }}
    >
      <span
        data-testid="connection-dot"
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: config.color,
          display: "inline-block",
        }}
      />
      <span data-testid="connection-label">{config.label}</span>
    </div>
  );
}
