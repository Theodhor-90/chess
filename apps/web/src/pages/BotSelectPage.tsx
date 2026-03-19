import { useState } from "react";
import { useNavigate } from "react-router";
import { BOT_PROFILES } from "@chess/shared";
import type { BotProfile } from "@chess/shared";
import { useCreateBotGameMutation } from "../store/apiSlice.js";
import { useToast } from "../components/ui/ToastProvider.js";
import { Button } from "../components/ui/Button.js";
import styles from "./BotSelectPage.module.css";

function DifficultyDots({ level }: { level: number }) {
  return (
    <div className={styles.difficulty} aria-label={`Difficulty ${level} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`${styles.dot} ${i < level ? styles.dotFilled : ""}`} />
      ))}
    </div>
  );
}

function BotSelectPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [createBotGame, { isLoading }] = useCreateBotGameMutation();
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null);

  async function handleSelectBot(profile: BotProfile) {
    if (isLoading) return;
    setLoadingLevel(profile.level);
    try {
      const result = await createBotGame({ level: profile.level }).unwrap();
      navigate(`/game/${result.gameId}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "data" in err
          ? (err.data as { error: string }).error
          : "Failed to start bot game";
      showToast(message, "error");
      setLoadingLevel(null);
    }
  }

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.pageTitle}>Play vs Computer</h1>
        <p className={styles.pageSubtitle}>Choose your opponent</p>
      </div>

      <div className={styles.grid}>
        {BOT_PROFILES.map((profile) => (
          <div
            key={profile.id}
            className={styles.botCard}
            data-testid={`bot-card-${profile.level}`}
          >
            <span className={styles.botName}>{profile.name}</span>
            <span className={styles.botElo}>~{profile.estimatedElo} Elo</span>
            <DifficultyDots level={profile.level} />
            <Button
              onClick={() => handleSelectBot(profile)}
              loading={loadingLevel === profile.level}
              disabled={isLoading}
              data-testid={`bot-play-${profile.level}`}
            >
              Play
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { BotSelectPage };
