import { useState } from "react";
import { useNavigate } from "react-router";
import { useGetGameHistoryQuery } from "../store/apiSlice.js";

const PAGE_SIZE = 20;

export function HistoryPage() {
  const [filter, setFilter] = useState<"all" | "win" | "loss" | "draw">("all");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useGetGameHistoryQuery({
    page,
    limit: PAGE_SIZE,
    result: filter === "all" ? undefined : filter,
    sort: "newest",
  });

  function handleFilterChange(value: string) {
    setFilter(value as "all" | "win" | "loss" | "draw");
    setPage(1);
  }

  if (isLoading) {
    return (
      <div
        style={{ maxWidth: "800px", margin: "0 auto", padding: "16px" }}
        data-testid="history-loading"
      >
        Loading...
      </div>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "16px" }}>
      <h1>Game History</h1>

      <select
        data-testid="history-filter"
        value={filter}
        onChange={(e) => handleFilterChange(e.target.value)}
        style={{ marginBottom: "16px", padding: "4px" }}
      >
        <option value="all">All</option>
        <option value="win">Wins</option>
        <option value="loss">Losses</option>
        <option value="draw">Draws</option>
      </select>

      {items.length === 0 ? (
        <div data-testid="history-empty">No games found.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px", textAlign: "left" }}>Opponent</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Result</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Reason</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Time Control</th>
              <th style={{ padding: "8px", textAlign: "left" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                data-testid={`history-row-${item.id}`}
                onClick={() => navigate(`/analysis/${item.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ padding: "8px" }}>{item.opponentUsername}</td>
                <td style={{ padding: "8px" }}>
                  <span
                    style={{
                      color:
                        item.result === "win"
                          ? "#4CAF50"
                          : item.result === "loss"
                            ? "#d32f2f"
                            : "#757575",
                      fontWeight: "bold",
                    }}
                  >
                    {item.result === "win" ? "W" : item.result === "loss" ? "L" : "D"}
                  </span>
                </td>
                <td style={{ padding: "8px" }}>
                  {item.resultReason.charAt(0).toUpperCase() + item.resultReason.slice(1)}
                </td>
                <td style={{ padding: "8px" }}>{item.timeControl}</td>
                <td style={{ padding: "8px" }}>
                  {new Date(item.playedAt * 1000).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div data-testid="history-pagination" style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          data-testid="history-prev"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span data-testid="history-page-info">
          Page {page} of {totalPages}
        </span>
        <button
          data-testid="history-next"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
