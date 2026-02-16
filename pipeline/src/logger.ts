import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── State ────────────────────────────────────────────────────

let logFilePath: string | null = null;

// ── Init ─────────────────────────────────────────────────────

export function initLogger(logDir: string): void {
  mkdirSync(logDir, { recursive: true });
  logFilePath = join(logDir, "run.log");
}

// ── Log ──────────────────────────────────────────────────────

export function log(
  context: string,
  phase: string,
  message: string,
  attempt?: { current: number; total: number },
): void {
  const timestamp = new Date().toISOString();
  const attemptStr = attempt ? `attempt:${attempt.current}/total:${attempt.total}` : "";
  const line = `${timestamp} | ${context || "-"} | ${phase} | ${attemptStr} | ${message}`;

  // Append to log file if initialized
  if (logFilePath) {
    appendFileSync(logFilePath, line + "\n", "utf-8");
  }

  // Print concise version to stdout
  const display = context ? `[${context}] [${phase}] ${message}` : `[${phase}] ${message}`;
  console.log(display);
}
