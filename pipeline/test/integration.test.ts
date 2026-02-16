import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { init, walk, unblock, PhaseCompleteSignal } from "../src/walker.js";
import { loadState, saveState, getTask } from "../src/state.js";
import { setDryRun, CONFIG } from "../src/config.js";
import { setMockDecisions } from "../src/cli.js";
import { initLogger } from "../src/logger.js";

// ── Helpers ─────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, "fixtures");

let tmpDir: string;
let origCwd: string;
let origMaxPlan: number;
let origMaxImpl: number;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pipeline-test-"));
  origCwd = process.cwd();
  origMaxPlan = CONFIG.maxPlanIterations;
  origMaxImpl = CONFIG.maxImplIterations;

  // Copy fixtures into temp dir's .pipeline/
  mkdirSync(join(tmpDir, ".pipeline"), { recursive: true });
  cpSync(join(FIXTURES_DIR, "milestones"), join(tmpDir, ".pipeline", "milestones"), {
    recursive: true,
  });

  process.chdir(tmpDir);
  setDryRun(true);
  setMockDecisions([]);
  initLogger(join(tmpDir, "logs"));

  // Suppress console output during tests
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(origCwd);
  CONFIG.maxPlanIterations = origMaxPlan;
  CONFIG.maxImplIterations = origMaxImpl;
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── Test 1: Init ────────────────────────────────────────────

describe("init", () => {
  test("scans fixture and builds correct state", () => {
    const state = init(".pipeline", false);

    expect(Object.keys(state.milestones)).toEqual(["m99"]);
    const m = state.milestones.m99;
    expect(m.status).toBe("pending");

    expect(Object.keys(m.phases)).toEqual(["p01"]);
    const p = m.phases.p01;
    expect(p.status).toBe("pending");

    expect(Object.keys(p.tasks).sort()).toEqual(["t01", "t02"]);
    for (const t of Object.values(p.tasks)) {
      expect(t.status).toBe("pending");
      expect(t.planIteration).toBe(0);
      expect(t.implIteration).toBe(0);
      expect(t.totalPlanAttempts).toBe(0);
      expect(t.totalImplAttempts).toBe(0);
    }
  });
});

// ── Test 7: Init Overwrite Protection ───────────────────────

describe("init overwrite protection", () => {
  test("refuses overwrite without --force", () => {
    init(".pipeline", false);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`EXIT_${code}`);
    }) as never);

    expect(() => init(".pipeline", false)).toThrow("EXIT_1");
    exitSpy.mockRestore();
  });
});

// ── Test 2: Happy Path ──────────────────────────────────────

describe("happy path", () => {
  test("both tasks complete with all-approved decisions", () => {
    const state = init(".pipeline", false);

    // All mock decisions default to approved
    // Walker throws PhaseCompleteSignal after phase completion (PR creation)
    expect(() => walk(state)).toThrow(PhaseCompleteSignal);

    // Read state from disk (walk saved before throwing)
    const finalState = loadState(".pipeline/state.json");

    // Both tasks completed
    const t01 = getTask(finalState, "m99", "p01", "t01");
    const t02 = getTask(finalState, "m99", "p01", "t02");
    expect(t01.status).toBe("completed");
    expect(t02.status).toBe("completed");

    // Phase completed
    expect(finalState.milestones.m99.phases.p01.status).toBe("completed");

    // Artifacts exist for both tasks
    for (const taskId of ["t01", "t02"]) {
      const dir = `.pipeline/milestones/m99/phases/p01/tasks/${taskId}`;
      expect(existsSync(join(dir, "plan-v1.md"))).toBe(true);
      expect(existsSync(join(dir, "feedback-v1.md"))).toBe(true);
      expect(existsSync(join(dir, "plan-locked.md"))).toBe(true);
      expect(existsSync(join(dir, "impl-notes-v1.md"))).toBe(true);
      expect(existsSync(join(dir, "review-v1.md"))).toBe(true);
    }

    // Log file has entries
    const logPath = join(tmpDir, "logs", "run.log");
    expect(existsSync(logPath)).toBe(true);
    const logContent = readFileSync(logPath, "utf-8");
    expect(logContent.length).toBeGreaterThan(0);
  });
});

// ── Test 3: Revision Path ───────────────────────────────────

describe("revision path", () => {
  test("plan rejected once then approved", () => {
    const state = init(".pipeline", false);
    setMockDecisions([
      { verdict: "needs_revision", feedback: "Missing test details" },
      { verdict: "approved", feedback: "" },
      { verdict: "approved", feedback: "" }, // review for t01
      // t02 defaults to all-approved
    ]);

    expect(() => walk(state)).toThrow(PhaseCompleteSignal);

    const finalState = loadState(".pipeline/state.json");

    const t01 = getTask(finalState, "m99", "p01", "t01");
    expect(t01.status).toBe("completed");

    // Planning artifacts — two iterations
    const dir = ".pipeline/milestones/m99/phases/p01/tasks/t01";
    expect(existsSync(join(dir, "plan-v1.md"))).toBe(true);
    expect(existsSync(join(dir, "feedback-v1.md"))).toBe(true);
    expect(existsSync(join(dir, "plan-v2.md"))).toBe(true);
    expect(existsSync(join(dir, "feedback-v2.md"))).toBe(true);
    expect(existsSync(join(dir, "plan-locked.md"))).toBe(true);

    // Counter assertions
    expect(t01.planIteration).toBe(2);
    expect(t01.totalPlanAttempts).toBe(2);
  });
});

// ── Test 4: Block Path ──────────────────────────────────────

describe("block path", () => {
  test("plan rejected every time causes block", () => {
    CONFIG.maxPlanIterations = 1;
    const state = init(".pipeline", false);
    setMockDecisions([{ verdict: "needs_revision", feedback: "Rejected" }]);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`EXIT_${code}`);
    }) as never);

    expect(() => walk(state)).toThrow();

    // Read state from disk (walk saved before exit)
    const savedState = loadState(".pipeline/state.json");
    const t01 = getTask(savedState, "m99", "p01", "t01");
    expect(t01.status).toBe("blocked");
    expect(t01.totalPlanAttempts).toBe(1);

    // No plan-locked.md
    const dir = ".pipeline/milestones/m99/phases/p01/tasks/t01";
    expect(existsSync(join(dir, "plan-locked.md"))).toBe(false);

    exitSpy.mockRestore();
  });
});

// ── Test 5: Resume Path ────────────────────────────────────

describe("resume path", () => {
  test("pre-populated artifacts skip planning", () => {
    const state = init(".pipeline", false);

    // Pre-populate planning artifacts for t01
    const dir = ".pipeline/milestones/m99/phases/p01/tasks/t01";
    writeFileSync(join(dir, "plan-v1.md"), "Test plan content");
    writeFileSync(
      join(dir, "feedback-v1.md"),
      JSON.stringify({ verdict: "approved", feedback: "" }),
    );
    writeFileSync(join(dir, "plan-locked.md"), "Test plan content");

    // Set t01 to implementing state
    const t01 = state.milestones.m99.phases.p01.tasks.t01;
    t01.status = "implementing" as const;
    t01.planIteration = 1;
    t01.totalPlanAttempts = 1;
    saveState(".pipeline/state.json", state);

    expect(() => walk(state)).toThrow(PhaseCompleteSignal);

    const finalState = loadState(".pipeline/state.json");

    // t01 completed (went straight to implementation)
    const t01Final = getTask(finalState, "m99", "p01", "t01");
    expect(t01Final.status).toBe("completed");

    // Implementation artifacts created
    expect(existsSync(join(dir, "impl-notes-v1.md"))).toBe(true);
    expect(existsSync(join(dir, "review-v1.md"))).toBe(true);

    // Plan was not regenerated
    expect(readFileSync(join(dir, "plan-v1.md"), "utf-8")).toBe("Test plan content");

    // Plan counters unchanged
    expect(t01Final.planIteration).toBe(1);
    expect(t01Final.totalPlanAttempts).toBe(1);
  });
});

// ── Test 6: Unblock Path ───────────────────────────────────

describe("unblock path", () => {
  test("unblock resets iteration counter but preserves total", () => {
    const state = init(".pipeline", false);

    // Set t01 to blocked state
    const t01 = state.milestones.m99.phases.p01.tasks.t01;
    t01.status = "blocked" as const;
    t01.planIteration = 2;
    t01.totalPlanAttempts = 2;
    saveState(".pipeline/state.json", state);

    unblock(".pipeline/state.json", "m99", "p01", "t01", "planning");

    const savedState = loadState(".pipeline/state.json");
    const t01After = getTask(savedState, "m99", "p01", "t01");
    expect(t01After.status).toBe("planning");
    expect(t01After.planIteration).toBe(0);
    expect(t01After.totalPlanAttempts).toBe(2);
  });
});

// ── Test 8: Counter Behavior Across Restart ─────────────────

describe("counter behavior across restart", () => {
  test("counters cumulate across unblock and re-run", () => {
    const state = init(".pipeline", false);

    // Simulate: t01 was blocked at planning after 2 attempts
    const t01 = state.milestones.m99.phases.p01.tasks.t01;
    t01.status = "blocked" as const;
    t01.planIteration = 2;
    t01.totalPlanAttempts = 2;
    saveState(".pipeline/state.json", state);

    // Unblock
    unblock(".pipeline/state.json", "m99", "p01", "t01", "planning");

    // All decisions approved (default)
    setMockDecisions([]);

    // Re-run from reloaded state
    const reloadedState = loadState(".pipeline/state.json");
    expect(() => walk(reloadedState)).toThrow(PhaseCompleteSignal);

    const finalState = loadState(".pipeline/state.json");

    const t01Final = getTask(finalState, "m99", "p01", "t01");
    expect(t01Final.status).toBe("completed");
    expect(t01Final.totalPlanAttempts).toBe(3); // 2 previous + 1 new
    expect(t01Final.planIteration).toBe(1); // reset, then incremented once
  });
});
