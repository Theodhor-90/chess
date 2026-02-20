import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import {
  useResolveInviteQuery,
  useJoinGameMutation,
  useGetMeQuery,
  useGetGameQuery,
} from "../store/apiSlice.js";
import { InviteLink } from "../components/InviteLink.js";
import type { GameStatus } from "@chess/shared";

const TERMINAL_STATUSES: GameStatus[] = [
  "checkmate",
  "stalemate",
  "resigned",
  "draw",
  "timeout",
  "aborted",
];

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

  if (isLoading) {
    return (
      <div data-testid="join-loading" style={{ padding: "16px", textAlign: "center" }}>
        <p>Joining game...</p>
      </div>
    );
  }

  if (isError) {
    const errMsg =
      error && "data" in error ? (error.data as { error: string }).error : "Invalid invite link";
    return (
      <div data-testid="join-error" style={{ padding: "16px", textAlign: "center" }}>
        <p>{errMsg}</p>
        <Link to="/">Go to Dashboard</Link>
      </div>
    );
  }

  // Game is in a terminal state (completed)
  if (data && TERMINAL_STATUSES.includes(data.status)) {
    return (
      <div data-testid="join-ended" style={{ padding: "16px", textAlign: "center" }}>
        <p>This game has already ended.</p>
        <Link to={`/game/${data.gameId}`}>View Game</Link>
        {" | "}
        <Link to="/">Go to Dashboard</Link>
      </div>
    );
  }

  // Game is active (already started, someone reused the link)
  if (data && data.status === "active") {
    if (isMeLoading || isMeFetching) {
      return (
        <div data-testid="join-loading" style={{ padding: "16px", textAlign: "center" }}>
          <p>Joining game...</p>
        </div>
      );
    }

    if (meData?.user?.id && (isActiveGameLoading || isActiveGameFetching)) {
      return (
        <div data-testid="join-loading" style={{ padding: "16px", textAlign: "center" }}>
          <p>Joining game...</p>
        </div>
      );
    }

    return (
      <div data-testid="join-already-started" style={{ padding: "16px", textAlign: "center" }}>
        <p>This game is already in progress.</p>
        <Link to={`/game/${data.gameId}`}>Go to Game</Link>
        {" | "}
        <Link to="/">Go to Dashboard</Link>
      </div>
    );
  }

  // Creator opened their own invite link
  if (isOwnGame && data) {
    return (
      <div data-testid="join-own-game" style={{ padding: "16px", textAlign: "center" }}>
        <p>You created this game — share the link with your opponent.</p>
        <InviteLink inviteToken={inviteToken!} />
        <div style={{ marginTop: "12px" }}>
          <Link to={`/game/${data.gameId}`}>Go to Game</Link>
          {" | "}
          <Link to="/">Go to Dashboard</Link>
        </div>
      </div>
    );
  }

  // Generic join error
  if (joinError && !isOwnGame) {
    const errMsg =
      joinError && "data" in joinError
        ? (joinError.data as { error: string }).error
        : "Failed to join game";
    return (
      <div data-testid="join-error" style={{ padding: "16px", textAlign: "center" }}>
        <p>{errMsg}</p>
        <Link to="/">Go to Dashboard</Link>
      </div>
    );
  }

  if (isJoining) {
    return (
      <div data-testid="join-loading" style={{ padding: "16px", textAlign: "center" }}>
        <p>Joining game...</p>
      </div>
    );
  }

  // Fallback while waiting for the effect to fire
  return (
    <div data-testid="join-loading" style={{ padding: "16px", textAlign: "center" }}>
      <p>Joining game...</p>
    </div>
  );
}
