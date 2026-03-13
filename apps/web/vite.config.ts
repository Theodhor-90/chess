import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.VITE_API_PORT ?? "3001";
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": apiTarget,
      "/socket.io": {
        target: apiTarget,
        ws: true,
      },
    },
  },
  test: {
    css: false,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
