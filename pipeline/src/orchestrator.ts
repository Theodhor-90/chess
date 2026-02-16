#!/usr/bin/env node
// Pipeline v2 — entry point

import { loadState } from "./state.js";
import { initLogger } from "./logger.js";
import { checkPrereqs } from "./cli.js";
import { setDryRun, DRY_RUN } from "./config.js";
import { walk, init, unblock, PhaseCompleteSignal } from "./walker.js";

// ── CLI Argument Parsing ─────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "init":
    runInit();
    break;
  case "run":
    runPipeline();
    break;
  case "unblock":
    runUnblock();
    break;
  default:
    printUsage();
    break;
}

// ── Commands ─────────────────────────────────────────────────

function runInit(): void {
  const force = args.includes("--force");
  init(".pipeline", force);
}

function runPipeline(): void {
  const dryRun = args.includes("--dry-run");
  if (dryRun) {
    setDryRun(true);
  }

  if (!DRY_RUN) {
    checkPrereqs();
  }

  initLogger("pipeline/logs");

  let state;
  try {
    state = loadState(".pipeline/state.json");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${message}`);
    console.error("Run 'npm run pipeline -- init' first.\n");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(56));
  console.log("  Pipeline v2 — Running");
  console.log("=".repeat(56) + "\n");

  let finalState;
  try {
    finalState = walk(state);
  } catch (err) {
    if (err instanceof PhaseCompleteSignal) {
      console.log("\n" + "=".repeat(56));
      console.log(`  Phase completed: ${err.milestoneId}/${err.phaseId}`);
      console.log("  PR created — review and merge before running pipeline again.");
      console.log("=".repeat(56) + "\n");
      process.exit(0);
    }
    throw err;
  }

  console.log("\n" + "=".repeat(56));
  console.log("  Pipeline completed successfully.");
  console.log("=".repeat(56) + "\n");

  // Summary
  let completed = 0;
  let total = 0;
  for (const m of Object.values(finalState.milestones)) {
    for (const p of Object.values(m.phases)) {
      for (const t of Object.values(p.tasks)) {
        total++;
        if (t.status === "completed") completed++;
      }
    }
  }
  console.log(`  Tasks: ${completed}/${total} completed\n`);
}

function runUnblock(): void {
  const [, milestoneId, phaseId, taskId, toStatus] = args;

  if (!milestoneId || !phaseId || !taskId || !toStatus) {
    console.error(
      "\nUsage: npm run pipeline -- unblock <milestone> <phase> <task> <planning|implementing>\n",
    );
    process.exit(1);
  }

  unblock(".pipeline/state.json", milestoneId, phaseId, taskId, toStatus);
}

function printUsage(): void {
  console.log(`
Pipeline v2 — AI-powered software delivery pipeline

Usage:
  npm run pipeline -- <command> [options]

Commands:
  init [--force]       Scan .pipeline/milestones/ and create state.json
  run [--dry-run]      Execute the pipeline from current state
  unblock <m> <p> <t> <planning|implementing>
                       Unblock a stuck task and reset its iteration counter

Examples:
  npm run pipeline -- init
  npm run pipeline -- init --force
  npm run pipeline -- run
  npm run pipeline -- run --dry-run
  npm run pipeline -- unblock m00 p01 t02 planning
`);
}
