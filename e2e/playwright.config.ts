import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const API_PORT = 3100;
const VITE_PORT = 5174;

// Each test run gets a unique temp database file
const testDbPath = path.join(os.tmpdir(), `chess-e2e-${randomUUID()}.db`);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: [
    {
      command: `node --import tsx src/index.ts`,
      cwd: path.resolve(import.meta.dirname, "../apps/api"),
      port: API_PORT,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: testDbPath,
        PORT: String(API_PORT),
        HOST: "127.0.0.1",
      },
      timeout: 15_000,
    },
    {
      command: `npx vite --port ${VITE_PORT}`,
      cwd: path.resolve(import.meta.dirname, "../apps/web"),
      port: VITE_PORT,
      reuseExistingServer: false,
      env: {
        VITE_API_PORT: String(API_PORT),
      },
      timeout: 15_000,
    },
  ],
});
