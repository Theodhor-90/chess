import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 10_000,
    teardownTimeout: 5_000,
    pool: "threads",
    env: {
      // Prevent tests from spawning real Stockfish processes.
      // Engine tests mock child_process/EnginePool, so no test needs the real binary.
      // Without this, every buildApp() call tries to spawn 2 Stockfish processes,
      // causing timeouts under load (e.g., when the pipeline runs concurrently).
      STOCKFISH_PATH: "/nonexistent/stockfish",
    },
  },
});
