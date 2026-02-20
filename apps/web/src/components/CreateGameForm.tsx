import { useState } from "react";
import { useCreateGameMutation } from "../store/apiSlice.js";
import type { ClockConfig, PlayerColor } from "@chess/shared";

interface TimePreset {
  label: string;
  initialTime: number; // in seconds
  increment: number; // in seconds
}

const PRESETS: TimePreset[] = [
  { label: "Bullet 1+0", initialTime: 60, increment: 0 },
  { label: "Blitz 3+2", initialTime: 180, increment: 2 },
  { label: "Rapid 10+0", initialTime: 600, increment: 0 },
  { label: "Classical 30+0", initialTime: 1800, increment: 0 },
];

interface CreateGameFormProps {
  onGameCreated: (gameId: number, inviteToken: string, color: PlayerColor) => void;
}

export function CreateGameForm({ onGameCreated }: CreateGameFormProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | "custom">(2); // default Rapid
  const [customMinutes, setCustomMinutes] = useState("10");
  const [customIncrement, setCustomIncrement] = useState("0");
  const [createGame, { isLoading, error }] = useCreateGameMutation();

  function getClockConfig(): ClockConfig {
    if (selectedPreset === "custom") {
      const minutes = Math.max(1, parseInt(customMinutes, 10) || 10);
      const increment = Math.max(0, parseInt(customIncrement, 10) || 0);
      return { initialTime: minutes * 60, increment };
    }
    const preset = PRESETS[selectedPreset];
    return { initialTime: preset.initialTime, increment: preset.increment };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const clock = getClockConfig();
      const result = await createGame({ clock }).unwrap();
      onGameCreated(result.gameId, result.inviteToken, result.color);
    } catch {
      // Error is captured in the `error` field from useCreateGameMutation
    }
  }

  const errorMessage =
    error && "data" in error
      ? (error.data as { error: string }).error
      : error
        ? "Failed to create game"
        : "";

  return (
    <form onSubmit={handleSubmit} data-testid="create-game-form">
      <h2>Create Game</h2>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
        {PRESETS.map((preset, index) => (
          <button
            key={preset.label}
            type="button"
            data-testid={`preset-${index}`}
            onClick={() => setSelectedPreset(index)}
            style={{
              padding: "8px 16px",
              border: selectedPreset === index ? "2px solid #333" : "1px solid #ccc",
              backgroundColor: selectedPreset === index ? "#e0e0e0" : "#fff",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          data-testid="preset-custom"
          onClick={() => setSelectedPreset("custom")}
          style={{
            padding: "8px 16px",
            border: selectedPreset === "custom" ? "2px solid #333" : "1px solid #ccc",
            backgroundColor: selectedPreset === "custom" ? "#e0e0e0" : "#fff",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Custom
        </button>
      </div>

      {selectedPreset === "custom" && (
        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <div>
            <label htmlFor="custom-minutes">Minutes</label>
            <input
              id="custom-minutes"
              type="number"
              min="1"
              max="180"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              style={{ display: "block", width: "80px" }}
            />
          </div>
          <div>
            <label htmlFor="custom-increment">Increment (sec)</label>
            <input
              id="custom-increment"
              type="number"
              min="0"
              max="60"
              value={customIncrement}
              onChange={(e) => setCustomIncrement(e.target.value)}
              style={{ display: "block", width: "80px" }}
            />
          </div>
        </div>
      )}

      {errorMessage && <p role="alert">{errorMessage}</p>}

      <button type="submit" data-testid="create-game-submit" disabled={isLoading}>
        {isLoading ? "Creating…" : "Create Game"}
      </button>
    </form>
  );
}
