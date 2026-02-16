import { spawnSync } from "node:child_process";
import { log } from "./logger.js";
import { DRY_RUN } from "./config.js";

// ── Git Helpers ─────────────────────────────────────────────

function git(args: string[], description: string): string {
  if (DRY_RUN) {
    log("", "git", `[DRY-RUN] git ${args.join(" ")}`);
    return "";
  }

  log("", "git", description);
  const res = spawnSync("git", args, {
    encoding: "utf-8",
    timeout: 30_000,
  });

  if (res.error) {
    throw new Error(`git ${args[0]} failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || "").trim();
    throw new Error(`git ${args[0]} exited with code ${res.status}: ${stderr}`);
  }

  return (res.stdout || "").trim();
}

// ── Branch Management ───────────────────────────────────────

export function createPhaseBranch(milestoneId: string, phaseId: string): void {
  const branchName = phaseBranchName(milestoneId, phaseId);

  if (DRY_RUN) {
    log("", "git", `[DRY-RUN] Would create/checkout branch ${branchName}`);
    return;
  }

  // Check if branch already exists (local)
  const existing = spawnSync("git", ["rev-parse", "--verify", branchName], {
    encoding: "utf-8",
  });

  if (existing.status === 0) {
    // Branch exists — check it out
    git(["checkout", branchName], `Switching to existing branch ${branchName}`);
  } else {
    // Create new branch from main
    git(["checkout", "-b", branchName, "main"], `Creating branch ${branchName} from main`);
  }
}

export function commitTaskCompletion(
  milestoneId: string,
  phaseId: string,
  taskId: string,
): void {
  if (DRY_RUN) {
    log("", "git", `[DRY-RUN] Would commit task ${milestoneId}/${phaseId}/${taskId}`);
    return;
  }

  // Check if there are changes to commit
  const status = spawnSync("git", ["status", "--porcelain"], {
    encoding: "utf-8",
  });
  const changes = (status.stdout || "").trim();

  if (!changes) {
    log("", "git", `No changes to commit for task ${taskId}`);
    return;
  }

  git(["add", "-A"], `Staging all changes for task ${taskId}`);
  git(
    [
      "commit",
      "-m",
      `${milestoneId}/${phaseId}/${taskId}: task completed\n\nAutomated commit by pipeline after task approval.`,
    ],
    `Committing task ${milestoneId}/${phaseId}/${taskId}`,
  );
}

export function createPhasePR(milestoneId: string, phaseId: string): void {
  const branchName = phaseBranchName(milestoneId, phaseId);

  if (DRY_RUN) {
    log("", "git", `[DRY-RUN] Would push ${branchName} and create PR`);
    return;
  }

  // Push branch to remote
  git(["push", "-u", "origin", branchName], `Pushing ${branchName} to origin`);

  // Create PR via gh CLI
  const title = `${milestoneId}/${phaseId}: phase completed`;
  const body =
    `## Phase ${phaseId} (Milestone ${milestoneId})\n\n` +
    `All tasks in this phase have been completed by the AI pipeline.\n\n` +
    `### Review checklist\n` +
    `- [ ] Code review\n` +
    `- [ ] Tests passing\n` +
    `- [ ] Merge to main\n`;

  log("", "git", `Creating PR for ${branchName}`);
  const res = spawnSync("gh", ["pr", "create", "--title", title, "--body", body, "--base", "main"], {
    encoding: "utf-8",
    timeout: 30_000,
  });

  if (res.error) {
    throw new Error(`gh pr create failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || "").trim();
    // If PR already exists, that's fine
    if (stderr.includes("already exists")) {
      log("", "git", "PR already exists, skipping creation");
      return;
    }
    throw new Error(`gh pr create exited with code ${res.status}: ${stderr}`);
  }

  const prUrl = (res.stdout || "").trim();
  log("", "git", `PR created: ${prUrl}`);
  console.log(`\n  PR created: ${prUrl}\n`);
}

export function returnToMain(): void {
  git(["checkout", "main"], "Switching back to main");
}

// ── Helpers ─────────────────────────────────────────────────

function phaseBranchName(milestoneId: string, phaseId: string): string {
  return `phase/${milestoneId}-${phaseId}`;
}
