import { useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useResolveInviteQuery, useJoinGameMutation } from "../store/apiSlice.js";

export function JoinPage() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useResolveInviteQuery(inviteToken ?? "");
  const [joinGame, { isLoading: isJoining, error: joinError }] = useJoinGameMutation();
  const joinAttempted = useRef(false);

  useEffect(() => {
    if (!data || joinAttempted.current) return;

    if (data.status === "waiting") {
      joinAttempted.current = true;
      joinGame({ gameId: data.gameId, inviteToken: inviteToken! })
        .unwrap()
        .then(() => {
          navigate(`/game/${data.gameId}`, { replace: true });
        })
        .catch(() => {
          // Error is captured in joinError
        });
    }
  }, [data, inviteToken, joinGame, navigate]);

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

  if (data && data.status !== "waiting") {
    return (
      <div data-testid="join-already-started" style={{ padding: "16px", textAlign: "center" }}>
        <p>This game has already started.</p>
        <Link to={`/game/${data.gameId}`}>View Game</Link>
        {" | "}
        <Link to="/">Go to Dashboard</Link>
      </div>
    );
  }

  if (joinError) {
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
