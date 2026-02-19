import { existsSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type PipelineState,
  transitionTask,
  incrementPlanIteration,
  incrementImplIteration,
  getTask,
  checkpoint,
  sortedKeys,
} from "./state.js";
import { CONFIG } from "./config.js";
import { loadTemplate } from "./templates.js";
import { claude, codex } from "./cli.js";
import { parseDecision } from "./schemas.js";
import { log } from "./logger.js";

// ── Path Helpers ─────────────────────────────────────────────

function taskDir(milestoneId: string, phaseId: string, taskId: string): string {
  return `.pipeline/milestones/${milestoneId}/phases/${phaseId}/tasks/${taskId}`;
}

function phaseDir(milestoneId: string, phaseId: string): string {
  return `.pipeline/milestones/${milestoneId}/phases/${phaseId}`;
}

function phaseSpecPath(milestoneId: string, phaseId: string): string {
  return join(phaseDir(milestoneId, phaseId), "spec.md");
}

function artifactPath(dir: string, name: string): string {
  return join(dir, name);
}

function ctx(milestoneId: string, phaseId: string, taskId: string): string {
  return `${milestoneId}/${phaseId}/${taskId}`;
}

const STATE_PATH = ".pipeline/state.json";

// ── Context Builders ────────────────────────────────────────

function buildCompletedSiblingsSection(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  currentTaskId: string,
): string {
  const phase = state.milestones[milestoneId]?.phases[phaseId];
  if (!phase) return "";

  const completedPlans: string[] = [];
  for (const siblingId of sortedKeys(phase.tasks)) {
    if (siblingId === currentTaskId) break; // Only include tasks before current
    const sibling = phase.tasks[siblingId];
    if (sibling.status === "completed") {
      const lockedPlan = join(taskDir(milestoneId, phaseId, siblingId), "plan-locked.md");
      if (existsSync(lockedPlan)) {
        completedPlans.push(`- **Task ${siblingId} (completed)**: \`${lockedPlan}\``);
      }
    }
  }

  if (completedPlans.length === 0) return "";

  return (
    "## Completed Sibling Tasks\n\n" +
    "These tasks in the same phase are already completed. Read their locked plans to understand what has been built:\n\n" +
    completedPlans.join("\n")
  );
}

// ── Plan Pre-flight Validation ──────────────────────────────

const REQUIRED_PLAN_SECTIONS = [
  "file structure",
  "dependencies",
  "implementation detail",
  "api contract",
  "test plan",
  "implementation order",
  "verification command",
];

interface PreflightResult {
  passed: boolean;
  missingSections: string[];
  missingPnpmFilter: boolean;
  missingVerificationSuite: boolean;
}

function preflightValidatePlan(planPath: string): PreflightResult {
  const content = readFileSync(planPath, "utf-8").toLowerCase();

  // Check for required sections (fuzzy heading match)
  const missingSections: string[] = [];
  for (const section of REQUIRED_PLAN_SECTIONS) {
    // Match section name as a markdown heading or within heading text
    const words = section.split(" ");
    const found = words.every((word) => {
      // Look for the word near a markdown heading (#)
      const headingPattern = new RegExp(`^#{1,4}.*${word}`, "m");
      return headingPattern.test(content);
    });
    if (!found) {
      missingSections.push(section);
    }
  }

  // Check that dependency commands use pnpm --filter syntax (if dependencies section exists)
  const hasDeps = content.includes("dependencies");
  const missingPnpmFilter = hasDeps && content.includes("npm install") && !content.includes("pnpm");

  // Check for mandatory verification commands (allow filtered variants like "pnpm --filter X build")
  const hasPnpmBuild = /pnpm\b.*\bbuild\b/.test(content);
  const hasPnpmTypecheck = /pnpm\b.*\btypecheck\b/.test(content);
  const hasPnpmTest = /pnpm\b.*\btest\b/.test(content);
  const missingVerificationSuite = !hasPnpmBuild || !hasPnpmTypecheck || !hasPnpmTest;

  const passed =
    missingSections.length === 0 && !missingPnpmFilter && !missingVerificationSuite;

  return { passed, missingSections, missingPnpmFilter, missingVerificationSuite };
}

function formatPreflightFeedback(result: PreflightResult): string {
  const issues: string[] = [];

  if (result.missingSections.length > 0) {
    issues.push(
      `Missing required plan sections: ${result.missingSections.join(", ")}. ` +
        "The plan must include all 7 sections: file structure, dependencies, " +
        "implementation details, API contracts, test plan, implementation order, " +
        "and verification commands.",
    );
  }

  if (result.missingPnpmFilter) {
    issues.push(
      "Dependency commands must use `pnpm --filter <package> add <dep>` syntax, not `npm install`.",
    );
  }

  if (result.missingVerificationSuite) {
    issues.push(
      "Verification commands must include `pnpm build`, `pnpm typecheck`, and `pnpm test`.",
    );
  }

  return JSON.stringify({
    verdict: "needs_revision",
    feedback:
      "Plan failed pre-flight structural validation:\n\n" + issues.map((i) => `- ${i}`).join("\n"),
  });
}

// ── Main Entry ───────────────────────────────────────────────

export function runTaskPipeline(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
): PipelineState {
  const task = getTask(state, milestoneId, phaseId, taskId);
  const context = ctx(milestoneId, phaseId, taskId);

  // No-op for terminal states
  if (task.status === "completed" || task.status === "blocked") {
    return state;
  }

  // Planning phase
  if (task.status === "pending" || task.status === "planning") {
    state = runPlanningLoop(state, milestoneId, phaseId, taskId, context);
    const taskAfterPlanning = getTask(state, milestoneId, phaseId, taskId);
    if (taskAfterPlanning.status === "blocked") {
      return state;
    }
  }

  // Implementation phase
  const taskBeforeImpl = getTask(state, milestoneId, phaseId, taskId);
  if (taskBeforeImpl.status === "plan_locked" || taskBeforeImpl.status === "implementing") {
    state = runImplementationLoop(state, milestoneId, phaseId, taskId, context);
  }

  return state;
}

// ── Planning Loop ────────────────────────────────────────────

function runPlanningLoop(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
  context: string,
): PipelineState {
  const dir = taskDir(milestoneId, phaseId, taskId);
  let task = getTask(state, milestoneId, phaseId, taskId);

  // Transition from pending → planning
  if (task.status === "pending") {
    state = transitionTask(state, milestoneId, phaseId, taskId, "planning");
    task = getTask(state, milestoneId, phaseId, taskId);
  }

  // Determine resume point from artifacts
  const resumeInfo = findPlanningResumePoint(dir, task);

  for (let i = resumeInfo.startIteration; i <= CONFIG.maxPlanIterations; i++) {
    const planFile = artifactPath(dir, `plan-v${i}.md`);
    const feedbackFile = artifactPath(dir, `feedback-v${i}.md`);

    // Step 1: Draft or refine (skip if artifact already exists)
    if (!existsSync(planFile)) {
      state = incrementPlanIteration(state, milestoneId, phaseId, taskId);

      const siblingsSection = buildCompletedSiblingsSection(
        state,
        milestoneId,
        phaseId,
        taskId,
      );

      let prompt: string;
      if (i === 1) {
        log(context, "planning", "Opus drafting plan", {
          current: i,
          total: getTask(state, milestoneId, phaseId, taskId).totalPlanAttempts,
        });
        prompt = loadTemplate("plan-draft", {
          SPEC_PATH: artifactPath(dir, "spec.md"),
          TASK_DIR: dir,
          PHASE_SPEC_PATH: phaseSpecPath(milestoneId, phaseId),
          COMPLETED_SIBLINGS_SECTION: siblingsSection,
        });
      } else {
        log(context, "planning", "Opus refining plan", {
          current: i,
          total: getTask(state, milestoneId, phaseId, taskId).totalPlanAttempts,
        });
        prompt = loadTemplate("plan-refine", {
          PLAN_PATH: artifactPath(dir, `plan-v${i - 1}.md`),
          FEEDBACK_PATH: artifactPath(dir, `feedback-v${i - 1}.md`),
          SPEC_PATH: artifactPath(dir, "spec.md"),
          PHASE_SPEC_PATH: phaseSpecPath(milestoneId, phaseId),
          COMPLETED_SIBLINGS_SECTION: siblingsSection,
        });
      }

      const result = claude(prompt, {
        tools: CONFIG.steps.planDraft.tools,
      });
      writeFileSync(planFile, result.raw, "utf-8");
      checkpoint(STATE_PATH, state, `plan-v${i} drafted`);
    }

    // Step 1.5: Pre-flight structural validation (before burning a reviewer iteration)
    if (!existsSync(feedbackFile)) {
      const preflight = preflightValidatePlan(planFile);
      if (!preflight.passed) {
        log(context, "planning", "Plan failed pre-flight validation");
        writeFileSync(feedbackFile, formatPreflightFeedback(preflight), "utf-8");
        checkpoint(STATE_PATH, state, `feedback-v${i} pre-flight rejection`);

        if (i >= CONFIG.maxPlanIterations) {
          log(context, "planning", "Plan iteration limit reached — blocking");
          state = transitionTask(state, milestoneId, phaseId, taskId, "blocked");
          checkpoint(STATE_PATH, state, "task blocked (planning, pre-flight)");
          return state;
        }
        continue; // Skip to next iteration for refinement
      }
    }

    // Step 2: Challenge (skip if artifact already exists)
    if (!existsSync(feedbackFile)) {
      log(context, "planning", "Opus challenging plan", {
        current: i,
        total: getTask(state, milestoneId, phaseId, taskId).totalPlanAttempts,
      });

      const challengePrompt = loadTemplate("plan-challenge", {
        PLAN_PATH: planFile,
        SPEC_PATH: artifactPath(dir, "spec.md"),
        PHASE_SPEC_PATH: phaseSpecPath(milestoneId, phaseId),
      });

      const result = claude(challengePrompt, {
        tools: CONFIG.steps.planChallenge.tools,
        schema: "challenge-decision.json",
      });
      writeFileSync(feedbackFile, result.raw, "utf-8");
      checkpoint(STATE_PATH, state, `feedback-v${i} received`);

      // Step 3: Evaluate decision
      const decision = result.decision ?? parseDecision(result.raw, "challenge-decision.json");

      if (decision.verdict === "approved") {
        log(context, "planning", "Plan approved — locking");
        const lockedPath = artifactPath(dir, "plan-locked.md");
        copyFileSync(planFile, lockedPath);
        state = transitionTask(state, milestoneId, phaseId, taskId, "plan_locked");
        checkpoint(STATE_PATH, state, "plan locked");
        return state;
      }

      // needs_revision — continue or block
      if (i >= CONFIG.maxPlanIterations) {
        log(context, "planning", "Plan iteration limit reached — blocking");
        state = transitionTask(state, milestoneId, phaseId, taskId, "blocked");
        checkpoint(STATE_PATH, state, "task blocked (planning)");
        return state;
      }
    } else {
      // Feedback file exists — check if it was an approval we haven't processed
      const existingFeedback = readFileSync(feedbackFile, "utf-8");
      const existingDecision = parseDecision(existingFeedback, "challenge-decision.json");
      if (existingDecision.verdict === "approved") {
        const lockedPath = artifactPath(dir, "plan-locked.md");
        if (!existsSync(lockedPath)) {
          copyFileSync(planFile, lockedPath);
        }
        if (getTask(state, milestoneId, phaseId, taskId).status === "planning") {
          state = transitionTask(state, milestoneId, phaseId, taskId, "plan_locked");
          checkpoint(STATE_PATH, state, "plan locked (resume)");
        }
        return state;
      }
      // needs_revision — if at iteration limit, block instead of falling through
      if (i >= CONFIG.maxPlanIterations) {
        log(context, "planning", "Stale rejected feedback at iteration limit — blocking");
        state = transitionTask(state, milestoneId, phaseId, taskId, "blocked");
        checkpoint(STATE_PATH, state, "task blocked (planning, stale artifact)");
        return state;
      }
    }
  }

  // Should not reach here, but guard against it
  return state;
}

// ── Implementation Loop ──────────────────────────────────────

function runImplementationLoop(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
  context: string,
): PipelineState {
  const dir = taskDir(milestoneId, phaseId, taskId);
  let task = getTask(state, milestoneId, phaseId, taskId);

  // Transition from plan_locked → implementing
  if (task.status === "plan_locked") {
    state = transitionTask(state, milestoneId, phaseId, taskId, "implementing");
    task = getTask(state, milestoneId, phaseId, taskId);
  }

  // Determine resume point from artifacts
  const resumeInfo = findImplResumePoint(dir, task);

  for (let i = resumeInfo.startIteration; i <= CONFIG.maxImplIterations; i++) {
    const implFile = artifactPath(dir, `impl-notes-v${i}.md`);
    const reviewFile = artifactPath(dir, `review-v${i}.md`);

    // Step 1: Implement or fix (skip if artifact already exists)
    if (!existsSync(implFile)) {
      state = incrementImplIteration(state, milestoneId, phaseId, taskId);

      let prompt: string;
      if (i === 1) {
        log(context, "implementing", "Codex implementing", {
          current: i,
          total: getTask(state, milestoneId, phaseId, taskId).totalImplAttempts,
        });
        prompt = loadTemplate("implement", {
          PLAN_LOCKED_PATH: artifactPath(dir, "plan-locked.md"),
          SPEC_PATH: artifactPath(dir, "spec.md"),
        });
      } else {
        log(context, "implementing", "Codex fixing implementation", {
          current: i,
          total: getTask(state, milestoneId, phaseId, taskId).totalImplAttempts,
        });
        prompt = loadTemplate("implement-fix", {
          PLAN_LOCKED_PATH: artifactPath(dir, "plan-locked.md"),
          REVIEW_PATH: artifactPath(dir, `review-v${i - 1}.md`),
          SPEC_PATH: artifactPath(dir, "spec.md"),
        });
      }

      const result = codex(prompt, {
        sandbox: CONFIG.steps.implement.sandbox,
      });
      writeFileSync(implFile, result.raw, "utf-8");
      checkpoint(STATE_PATH, state, `impl-notes-v${i} written`);
    }

    // Step 2: Review (skip if artifact already exists)
    if (!existsSync(reviewFile)) {
      log(context, "implementing", "Codex reviewing implementation", {
        current: i,
        total: getTask(state, milestoneId, phaseId, taskId).totalImplAttempts,
      });

      const reviewPrompt = loadTemplate("review", {
        PLAN_LOCKED_PATH: artifactPath(dir, "plan-locked.md"),
        IMPL_NOTES_PATH: implFile,
        SPEC_PATH: artifactPath(dir, "spec.md"),
      });

      const result = codex(reviewPrompt, {
        sandbox: CONFIG.steps.review.sandbox,
        schema: "review-decision.json",
      });
      writeFileSync(reviewFile, result.raw, "utf-8");
      checkpoint(STATE_PATH, state, `review-v${i} received`);

      // Step 3: Evaluate decision
      const decision = result.decision ?? parseDecision(result.raw, "review-decision.json");

      if (decision.verdict === "approved") {
        log(context, "implementing", "Implementation approved");
        state = transitionTask(state, milestoneId, phaseId, taskId, "completed");
        checkpoint(STATE_PATH, state, "task completed");
        return state;
      }

      // needs_revision — continue or block
      if (i >= CONFIG.maxImplIterations) {
        log(context, "implementing", "Implementation iteration limit reached — blocking");
        state = transitionTask(state, milestoneId, phaseId, taskId, "blocked");
        checkpoint(STATE_PATH, state, "task blocked (implementing)");
        return state;
      }
    } else {
      // Review file exists — check if it was an approval we haven't processed
      const existingReview = readFileSync(reviewFile, "utf-8");
      const existingDecision = parseDecision(existingReview, "review-decision.json");
      if (existingDecision.verdict === "approved") {
        if (getTask(state, milestoneId, phaseId, taskId).status === "implementing") {
          state = transitionTask(state, milestoneId, phaseId, taskId, "completed");
          checkpoint(STATE_PATH, state, "task completed (resume)");
        }
        return state;
      }
      // needs_revision — if at iteration limit, block instead of falling through
      if (i >= CONFIG.maxImplIterations) {
        log(context, "implementing", "Stale rejected review at iteration limit — blocking");
        state = transitionTask(state, milestoneId, phaseId, taskId, "blocked");
        checkpoint(STATE_PATH, state, "task blocked (implementing, stale artifact)");
        return state;
      }
    }
  }

  return state;
}

// ── Resume Point Detection ───────────────────────────────────

interface ResumeInfo {
  startIteration: number;
}

function findPlanningResumePoint(dir: string, _task: { planIteration: number }): ResumeInfo {
  // Find the highest iteration that has artifacts
  let highest = 0;
  for (let i = 1; i <= CONFIG.maxPlanIterations; i++) {
    if (existsSync(artifactPath(dir, `plan-v${i}.md`))) {
      highest = i;
    } else {
      break;
    }
  }

  if (highest === 0) {
    // No artifacts — start from 1
    return { startIteration: 1 };
  }

  // Check if the feedback for the highest plan exists
  if (!existsSync(artifactPath(dir, `feedback-v${highest}.md`))) {
    // Plan exists but no feedback — resume at this iteration (will skip to challenge)
    return { startIteration: highest };
  }

  // Both exist — start next iteration (refine)
  return { startIteration: highest };
}

function findImplResumePoint(dir: string, _task: { implIteration: number }): ResumeInfo {
  let highest = 0;
  for (let i = 1; i <= CONFIG.maxImplIterations; i++) {
    if (existsSync(artifactPath(dir, `impl-notes-v${i}.md`))) {
      highest = i;
    } else {
      break;
    }
  }

  if (highest === 0) {
    return { startIteration: 1 };
  }

  if (!existsSync(artifactPath(dir, `review-v${highest}.md`))) {
    return { startIteration: highest };
  }

  return { startIteration: highest };
}
