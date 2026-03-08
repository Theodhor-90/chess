import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiPort = process.env.VITE_API_PORT ?? "3000";
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["lila-stockfish-web"],
  },
  server: {
    proxy: {
      "/api": apiTarget,
      "/socket.io": {
        target: apiTarget,
        ws: true,
      },
    },
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  test: {
    css: false,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
