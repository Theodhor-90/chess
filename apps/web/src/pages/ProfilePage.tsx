import { useParams, useNavigate } from "react-router";
import { useGetUserStatsQuery } from "../store/apiSlice.js";

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = Number(id);
  const { data, isLoading, isError } = useGetUserStatsQuery(userId);

  if (isLoading) {
    return (
      <div
        style={{ maxWidth: "800px", margin: "0 auto", padding: "16px" }}
        data-testid="profile-loading"
      >
        Loading...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        style={{ maxWidth: "800px", margin: "0 auto", padding: "16px" }}
        data-testid="profile-error"
      >
        User not found.
      </div>
    );
  }

  const cardStyle = {
    padding: "16px",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    minWidth: "180px",
    flex: "1",
  };

  const pct = (count: number) =>
    data.totalGames > 0 ? ((count / data.totalGames) * 100).toFixed(1) : "0.0";

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "16px" }}>
      <h1>{data.username}</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "32px" }}>
        <div style={cardStyle}>
          <div style={{ color: "#757575", marginBottom: "4px" }}>Total Games</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>{data.totalGames}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: "#757575", marginBottom: "4px" }}>Win Rate</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>{data.winRate}%</div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: "#757575", marginBottom: "4px" }}>Record</div>
          <div>
            <span style={{ color: "#4CAF50", fontWeight: "bold" }}>
              {data.wins}W ({pct(data.wins)}%)
            </span>
            {" / "}
            <span style={{ color: "#d32f2f", fontWeight: "bold" }}>
              {data.losses}L ({pct(data.losses)}%)
            </span>
            {" / "}
            <span style={{ color: "#757575", fontWeight: "bold" }}>
              {data.draws}D ({pct(data.draws)}%)
            </span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: "#757575", marginBottom: "4px" }}>Avg Accuracy</div>
          {data.avgAccuracy.white === null && data.avgAccuracy.black === null ? (
            <div>N/A</div>
          ) : (
            <div>
              <div>White: {data.avgAccuracy.white !== null ? `${data.avgAccuracy.white}%` : "N/A"}</div>
              <div>Black: {data.avgAccuracy.black !== null ? `${data.avgAccuracy.black}%` : "N/A"}</div>
            </div>
          )}
        </div>
      </div>

      <h2>Recent Games</h2>

      {data.recentGames.length === 0 ? (
        <div data-testid="profile-no-games">No games played yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px", textAlign: "left" }}>Opponent</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Result</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Reason</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.recentGames.map((game) => (
              <tr
                key={game.gameId}
                data-testid={`profile-game-${game.gameId}`}
                onClick={() => navigate(`/analysis/${game.gameId}`)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ padding: "8px" }}>{game.opponentUsername}</td>
                <td style={{ padding: "8px" }}>
                  <span
                    style={{
                      color:
                        game.result === "win"
                          ? "#4CAF50"
                          : game.result === "loss"
                            ? "#d32f2f"
                            : "#757575",
                      fontWeight: "bold",
                    }}
                  >
                    {game.result === "win" ? "W" : game.result === "loss" ? "L" : "D"}
                  </span>
                </td>
                <td style={{ padding: "8px" }}>
                  {game.resultReason.charAt(0).toUpperCase() + game.resultReason.slice(1)}
                </td>
                <td style={{ padding: "8px" }}>
                  {new Date(game.playedAt * 1000).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
