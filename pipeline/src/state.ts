import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { log } from "./logger.js";

// ── Types ────────────────────────────────────────────────────

export type Status = "pending" | "in_progress" | "completed";

export type TaskStatus =
  | "pending"
  | "planning"
  | "plan_locked"
  | "implementing"
  | "completed"
  | "blocked";

export interface TaskState {
  status: TaskStatus;
  planIteration: number;
  implIteration: number;
  totalPlanAttempts: number;
  totalImplAttempts: number;
}

export interface PhaseState {
  status: Status;
  currentTask: string | null;
  tasks: Record<string, TaskState>;
}

export interface MilestoneState {
  status: Status;
  currentPhase: string | null;
  phases: Record<string, PhaseState>;
}

export interface PipelineState {
  project: string;
  currentMilestone: string | null;
  milestones: Record<string, MilestoneState>;
}

// ── Valid Transitions ────────────────────────────────────────

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["planning"],
  planning: ["plan_locked", "blocked"],
  plan_locked: ["implementing"],
  implementing: ["completed", "blocked"],
  completed: [],
  blocked: ["planning", "implementing"],
};

// ── State I/O ────────────────────────────────────────────────

export function loadState(path: string): PipelineState {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    throw new Error(`State file not found: ${path}. Run 'init' first.`);
  }

  try {
    return JSON.parse(raw) as PipelineState;
  } catch {
    throw new Error(`State file is malformed JSON: ${path}`);
  }
}

export function saveState(path: string, state: PipelineState): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmp, path);
}

// ── Checkpoint ───────────────────────────────────────────────

export function checkpoint(path: string, state: PipelineState, step: string): void {
  saveState(path, state);
  log("", "checkpoint", `State saved after: ${step}`);
}

// ── Resume ───────────────────────────────────────────────────

export interface ResumePoint {
  milestoneId: string;
  phaseId: string;
  taskId: string;
}

export function findResumePoint(state: PipelineState): ResumePoint | null {
  // Use currentMilestone pointer if set
  if (state.currentMilestone) {
    const milestone = state.milestones[state.currentMilestone];
    if (milestone && milestone.status === "in_progress") {
      const taskPoint = findTaskInMilestone(state.currentMilestone, milestone);
      if (taskPoint) return taskPoint;
    }
  }

  // Otherwise scan for first non-completed milestone
  for (const milestoneId of sortedKeys(state.milestones)) {
    const milestone = state.milestones[milestoneId];
    if (milestone.status === "completed") continue;

    const taskPoint = findTaskInMilestone(milestoneId, milestone);
    if (taskPoint) return taskPoint;
  }

  return null;
}

function findTaskInMilestone(milestoneId: string, milestone: MilestoneState): ResumePoint | null {
  // Use currentPhase pointer if set
  if (milestone.currentPhase) {
    const phase = milestone.phases[milestone.currentPhase];
    if (phase && phase.status !== "completed") {
      const taskPoint = findTaskInPhase(milestoneId, milestone.currentPhase, phase);
      if (taskPoint) return taskPoint;
    }
  }

  // Otherwise scan for first non-completed phase
  for (const phaseId of sortedKeys(milestone.phases)) {
    const phase = milestone.phases[phaseId];
    if (phase.status === "completed") continue;

    const taskPoint = findTaskInPhase(milestoneId, phaseId, phase);
    if (taskPoint) return taskPoint;
  }

  return null;
}

function findTaskInPhase(
  milestoneId: string,
  phaseId: string,
  phase: PhaseState,
): ResumePoint | null {
  // Use currentTask pointer if set
  if (phase.currentTask) {
    const task = phase.tasks[phase.currentTask];
    if (task && task.status !== "completed") {
      return { milestoneId, phaseId, taskId: phase.currentTask };
    }
  }

  // Otherwise scan for first non-completed task
  for (const taskId of sortedKeys(phase.tasks)) {
    const task = phase.tasks[taskId];
    if (task.status === "completed") continue;
    return { milestoneId, phaseId, taskId };
  }

  return null;
}

// ── State Transitions ────────────────────────────────────────

export function transitionTask(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
  newStatus: TaskStatus,
): PipelineState {
  const task = getTask(state, milestoneId, phaseId, taskId);
  const currentStatus = task.status;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid task transition: ${currentStatus} → ${newStatus} ` +
        `(task ${milestoneId}/${phaseId}/${taskId}). ` +
        `Allowed: ${allowed.join(", ") || "none"}`,
    );
  }

  task.status = newStatus;

  // Handle iteration counter resets on unblock
  if (currentStatus === "blocked" && newStatus === "planning") {
    task.planIteration = 0;
  }
  if (currentStatus === "blocked" && newStatus === "implementing") {
    task.implIteration = 0;
  }

  return state;
}

// ── Iteration Counter Helpers ────────────────────────────────

export function incrementPlanIteration(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
): PipelineState {
  const task = getTask(state, milestoneId, phaseId, taskId);
  task.planIteration++;
  task.totalPlanAttempts++;
  return state;
}

export function incrementImplIteration(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
): PipelineState {
  const task = getTask(state, milestoneId, phaseId, taskId);
  task.implIteration++;
  task.totalImplAttempts++;
  return state;
}

// ── Helpers ──────────────────────────────────────────────────

export function getTask(
  state: PipelineState,
  milestoneId: string,
  phaseId: string,
  taskId: string,
): TaskState {
  const milestone = state.milestones[milestoneId];
  if (!milestone) throw new Error(`Milestone not found: ${milestoneId}`);

  const phase = milestone.phases[phaseId];
  if (!phase) throw new Error(`Phase not found: ${milestoneId}/${phaseId}`);

  const task = phase.tasks[taskId];
  if (!task) throw new Error(`Task not found: ${milestoneId}/${phaseId}/${taskId}`);

  return task;
}

export function sortedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

export function makeDefaultTaskState(): TaskState {
  return {
    status: "pending",
    planIteration: 0,
    implIteration: 0,
    totalPlanAttempts: 0,
    totalImplAttempts: 0,
  };
}
