import type { HealthResponse } from "@chess/shared";
import Board from "./components/Board.js";

const _healthCheck: HealthResponse = { status: "ok" };

export default function App() {
  return (
    <div>
      <h1>Chess Platform</h1>
      {_healthCheck && <Board />}
    </div>
  );
}
