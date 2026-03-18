import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import {
  useResolveInviteQuery,
  useJoinGameMutation,
  useGetMeQuery,
  useGetGameQuery,
} from "../store/apiSlice.js";
import { InviteLink } from "../components/InviteLink.js";
import { Card } from "../components/ui/Card.js";
import type { GameStatus } from "@chess/shared";
import styles from "./JoinPage.module.css";

const TERMINAL_STATUSES: GameStatus[] = [
  "checkmate",
  "stalemate",
  "resigned",
  "draw",
  "timeout",
  "aborted",
];

function LoadingState() {
  return (
    <div data-testid="join-loading" className={styles.centered}>
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>Joining game...</p>
    </div>
  );
}

export function JoinPage() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useResolveInviteQuery(inviteToken ?? "");
  const isActiveGame = data?.status === "active";
  const {
    data: meData,
    isLoading: isMeLoading,
    isFetching: isMeFetching,
  } = useGetMeQuery(undefined, {
    skip: !isActiveGame,
  });
  const {
    data: activeGameData,
    isLoading: isActiveGameLoading,
    isFetching: isActiveGameFetching,
  } = useGetGameQuery(data?.gameId ?? 0, {
    skip: !isActiveGame || !meData?.user?.id,
  });
  const [joinGame, { isLoading: isJoining, error: joinError }] = useJoinGameMutation();
  const joinAttempted = useRef(false);
  const [isOwnGame, setIsOwnGame] = useState(false);

  useEffect(() => {
    if (!data || joinAttempted.current) return;

    if (data.status === "waiting") {
      joinAttempted.current = true;
      joinGame({ gameId: data.gameId, inviteToken: inviteToken! })
        .unwrap()
        .then(() => {
          navigate(`/game/${data.gameId}`, { replace: true });
        })
        .catch((err) => {
          if (err?.data?.error === "Cannot join your own game") {
            setIsOwnGame(true);
          }
        });
    }
  }, [data, inviteToken, joinGame, navigate]);

  useEffect(() => {
    if (data?.status !== "active" || !activeGameData || !meData?.user?.id) {
      return;
    }
    const userId = meData.user.id;
    const isParticipant =
      activeGameData.players.white?.userId === userId ||
      activeGameData.players.black?.userId === userId;

    if (isParticipant) {
      navigate(`/game/${data.gameId}`, { replace: true });
    }
  }, [activeGameData, data, meData, navigate]);

  function renderContent() {
    if (isLoading) {
      return <LoadingState />;
    }

    if (isError) {
      const errMsg =
        error && "data" in error ? (error.data as { error: string }).error : "Invalid invite link";
      return (
        <Card header="Error">
          <div data-testid="join-error" className={styles.centered}>
            <p className={styles.message}>{errMsg}</p>
            <Link to="/" className={styles.link}>
              Go to Dashboard
            </Link>
          </div>
        </Card>
      );
    }

    // Game is in a terminal state (completed)
    if (data && TERMINAL_STATUSES.includes(data.status)) {
      return (
        <Card header="Game Ended">
          <div data-testid="join-ended" className={styles.centered}>
            <p className={styles.message}>This game has already ended.</p>
            <div className={styles.links}>
              <Link to={`/game/${data.gameId}`} className={styles.link}>
                View Game
              </Link>
              <span className={styles.separator}>|</span>
              <Link to="/" className={styles.link}>
                Go to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      );
    }

    // Game is active (already started, someone reused the link)
    if (data && data.status === "active") {
      if (isMeLoading || isMeFetching) {
        return <LoadingState />;
      }

      if (meData?.user?.id && (isActiveGameLoading || isActiveGameFetching)) {
        return <LoadingState />;
      }

      return (
        <Card header="Game In Progress">
          <div data-testid="join-already-started" className={styles.centered}>
            <p className={styles.message}>This game is already in progress.</p>
            <div className={styles.links}>
              <Link to={`/game/${data.gameId}`} className={styles.link}>
                Go to Game
              </Link>
              <span className={styles.separator}>|</span>
              <Link to="/" className={styles.link}>
                Go to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      );
    }

    // Creator opened their own invite link
    if (isOwnGame && data) {
      return (
        <Card header="Your Game">
          <div data-testid="join-own-game" className={styles.centered}>
            <p className={styles.message}>
              You created this game — share the link with your opponent.
            </p>
            <div className={styles.ownGameInvite}>
              <InviteLink inviteToken={inviteToken!} />
            </div>
            <div className={styles.links}>
              <Link to={`/game/${data.gameId}`} className={styles.link}>
                Go to Game
              </Link>
              <span className={styles.separator}>|</span>
              <Link to="/" className={styles.link}>
                Go to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      );
    }

    // Generic join error
    if (joinError && !isOwnGame) {
      const errMsg =
        joinError && "data" in joinError
          ? (joinError.data as { error: string }).error
          : "Failed to join game";
      return (
        <Card header="Error">
          <div data-testid="join-error" className={styles.centered}>
            <p className={styles.message}>{errMsg}</p>
            <Link to="/" className={styles.link}>
              Go to Dashboard
            </Link>
          </div>
        </Card>
      );
    }

    if (isJoining) {
      return <LoadingState />;
    }

    // Fallback while waiting for the effect to fire
    return <LoadingState />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>{renderContent()}</div>
    </div>
  );
}
