import { readdirSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  type PipelineState,
  type MilestoneState,
  type PhaseState,
  type TaskState,
  loadState,
  saveState,
  checkpoint,
  getTask,
  sortedKeys,
  transitionTask,
  makeDefaultTaskState,
} from "./state.js";
import { runTaskPipeline } from "./task-pipeline.js";
import { log } from "./logger.js";
import { createPhaseBranch, commitTaskCompletion, createPhasePR, returnToMain } from "./git.js";

// ── Phase Completion Signal ─────────────────────────────────

export class PhaseCompleteSignal extends Error {
  constructor(
    public readonly milestoneId: string,
    public readonly phaseId: string,
  ) {
    super(`Phase ${milestoneId}/${phaseId} completed — PR created, awaiting review.`);
    this.name = "PhaseCompleteSignal";
  }
}

// ── Walk ─────────────────────────────────────────────────────

export function walk(state: PipelineState): PipelineState {
  const statePath = ".pipeline/state.json";

  try {
    const milestoneIds = sortedKeys(state.milestones);

    for (const milestoneId of milestoneIds) {
      const milestone = state.milestones[milestoneId];
      if (milestone.status === "completed") continue;

      // Activate milestone
      if (milestone.status === "pending") {
        milestone.status = "in_progress";
      }
      state.currentMilestone = milestoneId;

      const phaseIds = sortedKeys(milestone.phases);

      for (const phaseId of phaseIds) {
        const phase = milestone.phases[phaseId];
        if (phase.status === "completed") continue;

        // Activate phase
        if (phase.status === "pending") {
          phase.status = "in_progress";
          createPhaseBranch(milestoneId, phaseId);
        }
        milestone.currentPhase = phaseId;

        const taskIds = sortedKeys(phase.tasks);

        for (const taskId of taskIds) {
          const task = phase.tasks[taskId];
          if (task.status === "completed") continue;

          phase.currentTask = taskId;
          checkpoint(statePath, state, `starting task ${milestoneId}/${phaseId}/${taskId}`);

          log(`${milestoneId}/${phaseId}/${taskId}`, "walker", "Running task pipeline");

          state = runTaskPipeline(state, milestoneId, phaseId, taskId);

          const taskAfter = getTask(state, milestoneId, phaseId, taskId);
          if (taskAfter.status === "blocked") {
            printBlockContext(state, milestoneId, phaseId, taskId);
            saveState(statePath, state);
            process.exit(1);
          }

          // Task completed — commit changes
          commitTaskCompletion(milestoneId, phaseId, taskId);
          log(`${milestoneId}/${phaseId}/${taskId}`, "walker", "Task completed");
        }

        // All tasks in phase completed
        phase.status = "completed";
        phase.currentTask = null;
        checkpoint(statePath, state, `phase ${milestoneId}/${phaseId} completed`);
        log(`${milestoneId}/${phaseId}`, "walker", "Phase completed");

        // Create PR and wait for human review
        createPhasePR(milestoneId, phaseId);
        returnToMain();
        saveState(statePath, state);
        throw new PhaseCompleteSignal(milestoneId, phaseId);
      }

      // All phases in milestone completed
      milestone.status = "completed";
      milestone.currentPhase = null;
      log(milestoneId, "walker", "Milestone completed");
    }

    state.currentMilestone = null;
    saveState(statePath, state);
    return state;
  } catch (err) {
    // Phase completion — not an error, pipeline pauses for human review
    if (err instanceof PhaseCompleteSignal) {
      throw err;
    }

    // Unexpected error — checkpoint and exit
    const message = err instanceof Error ? err.message : String(err);
    log("", "walker", `UNEXPECTED ERROR: ${message}`);
    checkpoint(statePath, state, `error: ${message}`);
    console.error(`\nUnexpected error: ${message}`);
    console.error("State has been checkpointed. Review .pipeline/state.json and logs.\n");
    process.exit(2);
  }
}

// ── Block Context Dump ───────────────────────────────────────

function printBlockContext(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
): void {
  const task = getTask(state, milestoneId, phaseId, taskId);
  const dir = `.pipeline/milestones/${milestoneId}/phases/${phaseId}/tasks/${taskId}`;

  const bar = "\u2550".repeat(56);
  console.log(`\n${bar}`);
  console.log("  PIPELINE BLOCKED");
  console.log(bar);

  console.log(`\n  Task:       ${milestoneId} \u2192 ${phaseId} \u2192 ${taskId}`);

  // Determine which phase blocked
  const inPlanning =
    task.planIteration > 0 && task.status === "blocked" && !existsSync(join(dir, "plan-locked.md"));
  const phase = inPlanning ? "planning" : "implementing";

  console.log(`  Status:     blocked (${phase})`);

  if (inPlanning) {
    const n = task.planIteration;
    console.log(
      `  Iterations: ${n}/${n} plan attempts (${task.totalPlanAttempts} total across restarts)`,
    );
    console.log("\n  Artifacts to review:");
    console.log(`    Plan:     ${join(dir, `plan-v${n}.md`)}`);
    console.log(`    Feedback: ${join(dir, `feedback-v${n}.md`)}`);

    const feedbackPath = join(dir, `feedback-v${n}.md`);
    if (existsSync(feedbackPath)) {
      const feedback = readFileSync(feedbackPath, "utf-8");
      const summary = feedback.substring(0, 300);
      console.log(`\n  Last feedback summary:\n    "${summary}"`);
    }

    console.log(
      `\n  To unblock:\n    npm run pipeline -- unblock ${milestoneId} ${phaseId} ${taskId} planning`,
    );
  } else {
    const n = task.implIteration;
    console.log(
      `  Iterations: ${n}/${n} impl attempts (${task.totalImplAttempts} total across restarts)`,
    );
    console.log("\n  Artifacts to review:");
    console.log(`    Impl:   ${join(dir, `impl-notes-v${n}.md`)}`);
    console.log(`    Review: ${join(dir, `review-v${n}.md`)}`);

    const reviewPath = join(dir, `review-v${n}.md`);
    if (existsSync(reviewPath)) {
      const review = readFileSync(reviewPath, "utf-8");
      const summary = review.substring(0, 300);
      console.log(`\n  Last review summary:\n    "${summary}"`);
    }

    console.log(
      `\n  To unblock:\n    npm run pipeline -- unblock ${milestoneId} ${phaseId} ${taskId} implementing`,
    );
  }

  console.log(`\n${bar}\n`);
}

// ── Init ─────────────────────────────────────────────────────

export function init(pipelineDir: string, force: boolean = false): PipelineState {
  const statePath = join(pipelineDir, "state.json");

  if (existsSync(statePath)) {
    if (force) {
      unlinkSync(statePath);
    } else {
      console.error(
        `Error: ${statePath} already exists. Delete it manually or use --force to reinitialize.`,
      );
      process.exit(1);
    }
  }

  const milestonesDir = join(pipelineDir, "milestones");
  const milestones: Record<string, MilestoneState> = {};
  let milestoneCount = 0;
  let phaseCount = 0;
  let taskCount = 0;

  if (existsSync(milestonesDir)) {
    const milestoneIds = listDirs(milestonesDir).sort();

    for (const milestoneId of milestoneIds) {
      const milestoneDir = join(milestonesDir, milestoneId);
      if (!existsSync(join(milestoneDir, "spec.md"))) continue;

      const phases: Record<string, PhaseState> = {};
      const phasesDir = join(milestoneDir, "phases");

      if (existsSync(phasesDir)) {
        const phaseIds = listDirs(phasesDir).sort();

        for (const phaseId of phaseIds) {
          const phaseDir = join(phasesDir, phaseId);
          if (!existsSync(join(phaseDir, "spec.md"))) continue;

          const tasks: Record<string, TaskState> = {};
          const tasksDir = join(phaseDir, "tasks");

          if (existsSync(tasksDir)) {
            const taskIds = listDirs(tasksDir).sort();

            for (const taskId of taskIds) {
              const taskDir = join(tasksDir, taskId);
              if (!existsSync(join(taskDir, "spec.md"))) continue;

              tasks[taskId] = makeDefaultTaskState();
              taskCount++;
            }
          }

          phases[phaseId] = {
            status: "pending",
            currentTask: null,
            tasks,
          };
          phaseCount++;
        }
      }

      milestones[milestoneId] = {
        status: "pending",
        currentPhase: null,
        phases,
      };
      milestoneCount++;
    }
  }

  const state: PipelineState = {
    project: "chess-platform",
    currentMilestone: null,
    milestones,
  };

  saveState(statePath, state);

  console.log(
    `\nInitialized: ${milestoneCount} milestone(s), ${phaseCount} phase(s), ${taskCount} task(s)`,
  );
  console.log(`State saved to ${statePath}\n`);

  return state;
}

// ── Unblock ──────────────────────────────────────────────────

export function unblock(
  statePath: string,
  milestoneId: string,
  phaseId: string,
  taskId: string,
  toStatus: string,
): void {
  if (toStatus !== "planning" && toStatus !== "implementing") {
    console.error(`Error: toStatus must be "planning" or "implementing", got "${toStatus}"`);
    process.exit(1);
  }

  const state = loadState(statePath);
  const task = getTask(state, milestoneId, phaseId, taskId);

  if (task.status !== "blocked") {
    console.error(
      `Error: Task ${milestoneId}/${phaseId}/${taskId} is not blocked (status: ${task.status})`,
    );
    process.exit(1);
  }

  // Clean up stale artifacts from the blocked iteration so resume logic re-runs the step.
  const dir = `.pipeline/milestones/${milestoneId}/phases/${phaseId}/tasks/${taskId}`;

  if (toStatus === "planning") {
    // Delete the last rejected feedback file so the challenge re-runs
    const lastFeedback = join(dir, `feedback-v${task.planIteration}.md`);
    if (existsSync(lastFeedback)) {
      unlinkSync(lastFeedback);
    }
  } else {
    // Delete the last rejected review file so the review re-runs
    const lastReview = join(dir, `review-v${task.implIteration}.md`);
    if (existsSync(lastReview)) {
      unlinkSync(lastReview);
    }
  }

  transitionTask(state, milestoneId, phaseId, taskId, toStatus as "planning" | "implementing");

  saveState(statePath, state);

  console.log(`\nTask ${milestoneId}/${phaseId}/${taskId} unblocked \u2192 ${toStatus}.`);
  console.log("Run 'npm run pipeline -- run' to continue.\n");
}

// ── Helpers ──────────────────────────────────────────────────

function listDirs(parentDir: string): string[] {
  return readdirSync(parentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
