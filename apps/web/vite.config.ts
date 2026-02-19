import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  test: {
    css: false,
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
