import { useState } from "react";
import { useCreateGameMutation } from "../store/apiSlice.js";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import type { ClockConfig, PlayerColor } from "@chess/shared";
import styles from "./CreateGameForm.module.css";

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
    <form onSubmit={handleSubmit} data-testid="create-game-form" className={styles.form}>
      <div className={styles.presets}>
        {PRESETS.map((preset, index) => (
          <button
            key={preset.label}
            type="button"
            data-testid={`preset-${index}`}
            onClick={() => setSelectedPreset(index)}
            className={[
              styles.presetButton,
              selectedPreset === index ? styles.presetButtonActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          data-testid="preset-custom"
          onClick={() => setSelectedPreset("custom")}
          className={[
            styles.presetButton,
            selectedPreset === "custom" ? styles.presetButtonActive : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Custom
        </button>
      </div>

      {selectedPreset === "custom" && (
        <div className={styles.customFields}>
          <Input
            label="Minutes"
            name="custom-minutes"
            type="number"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            className={styles.customField}
          />
          <Input
            label="Increment (sec)"
            name="custom-increment"
            type="number"
            value={customIncrement}
            onChange={(e) => setCustomIncrement(e.target.value)}
            className={styles.customField}
          />
        </div>
      )}

      {errorMessage && (
        <p role="alert" className={styles.error}>
          {errorMessage}
        </p>
      )}

      <Button type="submit" loading={isLoading}>
        {isLoading ? "Creating…" : "Create Game"}
      </Button>
    </form>
  );
}
