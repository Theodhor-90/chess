// ── Pipeline Configuration ───────────────────────────────────

export const CONFIG = {
  maxPlanIterations: 3,
  maxImplIterations: 4,
  timeoutMs: 20 * 60_000, // 20 minutes per CLI call

  claude: {
    bin: "claude",
    model: "opus",
    defaultMaxTurns: 25,
  },

  // codex config retained for reference but no longer used — all steps use claude
  codex: {
    bin: "codex",
    defaultSandbox: "read-only" as const,
    implSandbox: "workspace-write" as const,
  },

  steps: {
    planDraft: { tools: ["Read", "Glob", "Grep"] },
    planChallenge: { tools: ["Read", "Glob", "Grep"] },
    planRefine: { tools: ["Read", "Glob", "Grep"] },
    implement: { tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"] },
    implementFix: { tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"] },
    review: { tools: ["Read", "Glob", "Grep", "Bash"] },
  },
};

// ── Dry-run mode ─────────────────────────────────────────────

export let DRY_RUN = false;

export function setDryRun(value: boolean): void {
  DRY_RUN = value;
}
