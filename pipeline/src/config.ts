// ── Pipeline Configuration ───────────────────────────────────

export const CONFIG = {
  maxPlanIterations: 3,
  maxImplIterations: 3,
  timeoutMs: 15 * 60_000, // 10 minutes per CLI call

  claude: {
    bin: "claude",
    model: "opus",
    defaultMaxTurns: 25,
    reviewMaxTurns: 30,
  },

  codex: {
    bin: "codex",
    defaultSandbox: "read-only" as const,
    implSandbox: "workspace-write" as const,
  },

  steps: {
    planDraft: { tools: ["Read", "Glob", "Grep"] },
    planChallenge: { sandbox: "read-only" as const },
    planRefine: { tools: ["Read", "Glob", "Grep"] },
    implement: { sandbox: "workspace-write" as const },
    implementFix: { sandbox: "workspace-write" as const },
    review: { tools: ["Read", "Glob", "Grep", "Bash"] },
  },
};

// ── Dry-run mode ─────────────────────────────────────────────

export let DRY_RUN = false;

export function setDryRun(value: boolean): void {
  DRY_RUN = value;
}
