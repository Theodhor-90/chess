#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// AI Pipeline Orchestrator
// Opus 4.6 (plan + review)  ↔  Codex 5.3 (challenge + implement)
// Handoff medium: markdown files in .pipeline/
// ─────────────────────────────────────────────────────────────

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Configuration ──────────────────────────────────────────────

const CONFIG = {
  maxPlanIterations: 2,   // plan ↔ challenge rounds before locking
  maxImplIterations: 3,   // implement ↔ review rounds before giving up
  timeoutMs: 10 * 60_000, // 10 min per CLI call
  claude: { bin: "claude" },
  codex: { bin: "codex" },
};

const ROOT = process.cwd();
const PIPE = (...p) => join(ROOT, ".pipeline", ...p);

// ── Logging ────────────────────────────────────────────────────

const hr = () => console.log("─".repeat(60));
function log(phase, step, msg) {
  console.log(`\n[${phase}] Step ${step}: ${msg}`);
  hr();
}

// ── File helpers ───────────────────────────────────────────────

function save(name, content) {
  const p = PIPE(name);
  writeFileSync(p, content, "utf-8");
  console.log(`  → saved .pipeline/${name} (${content.length} chars)`);
  return p;
}

function read(name) {
  return readFileSync(PIPE(name), "utf-8");
}

// ── Env helper ─────────────────────────────────────────────────
// Strip variables that cause nesting-detection conflicts when
// spawning CLI subprocesses from inside a running Claude Code session.
function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE;
  return env;
}

// ── CLI wrappers ───────────────────────────────────────────────

function claude(prompt, { tools = [], maxTurns = 25 } = {}) {
  const args = [
    "-p",
    prompt,
    "--output-format", "text",
    "--max-turns", String(maxTurns),
    "--verbose",
  ];
  if (tools.length) args.push("--allowedTools", tools.join(","));

  console.log(`  ▸ claude -p (tools: ${tools.join(",") || "none"}, max-turns: ${maxTurns})`);

  const res = spawnSync(CONFIG.claude.bin, args, {
    cwd: ROOT,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: CONFIG.timeoutMs,
    env: cleanEnv(),
  });

  if (res.error) throw new Error(`claude failed: ${res.error.message}`);
  if (res.status !== 0) {
    console.error("  stderr:", res.stderr?.slice(0, 500));
    throw new Error(`claude exited with code ${res.status}`);
  }
  return (res.stdout || "").trim();
}

function codex(prompt, { sandbox = "read-only" } = {}) {
  const args = [
    "exec",
    prompt,
    "--sandbox", sandbox,
  ];

  console.log(`  ▸ codex exec (sandbox: ${sandbox})`);

  const res = spawnSync(CONFIG.codex.bin, args, {
    cwd: ROOT,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: CONFIG.timeoutMs,
    env: cleanEnv(),
  });

  if (res.error) throw new Error(`codex failed: ${res.error.message}`);
  if (res.status !== 0) {
    console.error("  stderr:", res.stderr?.slice(0, 500));
    throw new Error(`codex exited with code ${res.status}`);
  }
  return (res.stdout || "").trim();
}

// ── Prerequisite check ─────────────────────────────────────────

function checkPrereqs() {
  console.log("\nChecking prerequisites...\n");
  const problems = [];

  for (const [label, bin, pkg] of [
    ["Claude Code", CONFIG.claude.bin, "@anthropic-ai/claude-code"],
    ["Codex CLI", CONFIG.codex.bin, "@openai/codex"],
  ]) {
    const r = spawnSync("which", [bin], { encoding: "utf-8" });
    if (r.status === 0) {
      console.log(`  OK  ${label} → ${r.stdout.trim()}`);
    } else {
      console.log(`  MISSING  ${label} — install with: npm install -g ${pkg}`);
      problems.push(label);
    }
  }

  // Auth check: either API key OR subscription login is fine.
  // We verify by doing a lightweight CLI call rather than checking env vars.
  for (const [label, bin, loginCmd] of [
    ["Claude auth", CONFIG.claude.bin, "claude login"],
    ["Codex auth", CONFIG.codex.bin, "codex login"],
  ]) {
    const hasApiKey =
      (bin === "claude" && process.env.ANTHROPIC_API_KEY) ||
      (bin === "codex" && (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY));
    if (hasApiKey) {
      console.log(`  OK  ${label} (API key)`);
    } else {
      // No API key — assume subscription login. We can't cheaply verify
      // without making an actual API call, so just warn.
      console.log(`  ?   ${label} — no API key found; assuming subscription login via "${loginCmd}"`);
    }
  }

  if (problems.length) {
    console.log(`\nBlocked by ${problems.length} missing prerequisite(s). Fix and retry.\n`);
    process.exit(1);
  }
  console.log("\nAll prerequisites met.\n");
}

// ── Phase 1: Planning ──────────────────────────────────────────

function planningPhase(task) {
  console.log("\n" + "=".repeat(60));
  console.log("  PHASE 1 — PLANNING");
  console.log("=".repeat(60));

  // Step 1: Opus drafts plan
  log("PLAN", 1, "Opus drafting initial plan");
  let plan = claude(
    [
      "You are the Planning Agent for a software project.",
      "Your job is to write a clear, complete implementation plan that another AI model will execute.",
      "",
      `TASK: ${task}`,
      "",
      "Write a plan that includes:",
      "1. Project folder structure (every file to create)",
      "2. npm dependencies with versions",
      "3. Each file's purpose and complete implementation details",
      "4. API endpoints with request/response examples",
      "5. Test cases with expected inputs and outputs",
      "6. Step-by-step implementation order",
      "7. How to verify everything works (commands to run)",
      "",
      "Be precise and unambiguous. The implementer cannot ask you questions.",
      "Output clean markdown.",
    ].join("\n"),
    { tools: ["Read", "Glob", "Grep"] },
  );
  save("plan-v1.md", plan);

  // Iterate: Codex challenges → Opus refines
  for (let i = 1; i <= CONFIG.maxPlanIterations; i++) {
    log("PLAN", `${i + 1}a`, `Codex challenging plan (round ${i}/${CONFIG.maxPlanIterations})`);

    const feedback = codex(
      [
        "You are the Implementation Reviewer.",
        "A planning agent wrote the implementation plan below.",
        "Review it from an implementer's perspective.",
        "",
        "PLAN:",
        "---",
        plan,
        "---",
        "",
        "Identify:",
        "1. Ambiguities that would force you to guess",
        "2. Missing details that would block you",
        "3. Over-engineering for the stated goal",
        "4. Contradictions or things that won't work",
        "",
        'If the plan is solid and you can implement it as-is, say "PLAN APPROVED" and briefly explain why.',
        "Otherwise, list specific, actionable feedback.",
      ].join("\n"),
      { sandbox: "read-only" },
    );
    save(`plan-feedback-v${i}.md`, feedback);

    if (feedback.toUpperCase().includes("PLAN APPROVED")) {
      console.log("  Codex approved the plan.");
      save("plan-locked.md", plan);
      return plan;
    }

    log("PLAN", `${i + 1}b`, "Opus refining plan based on feedback");
    plan = claude(
      [
        "You are the Planning Agent. Your previous plan received implementer feedback.",
        "",
        "CURRENT PLAN:",
        "---",
        plan,
        "---",
        "",
        "IMPLEMENTER FEEDBACK:",
        "---",
        feedback,
        "---",
        "",
        "Revise the plan to address the feedback. Keep what works, fix what doesn't.",
        "Output the complete revised plan as clean markdown.",
      ].join("\n"),
      { tools: ["Read", "Glob", "Grep"] },
    );
    save(`plan-v${i + 1}.md`, plan);
  }

  console.log(`  Max plan iterations reached. Locking current plan.`);
  save("plan-locked.md", plan);
  return plan;
}

// ── Phase 2: Implementation ────────────────────────────────────

function implementationPhase(plan) {
  console.log("\n" + "=".repeat(60));
  console.log("  PHASE 2 — IMPLEMENTATION");
  console.log("=".repeat(60));

  for (let i = 1; i <= CONFIG.maxImplIterations; i++) {
    log("IMPL", `${i}a`, `Codex implementing (attempt ${i}/${CONFIG.maxImplIterations})`);

    const implPrompt =
      i === 1
        ? [
            "You are the Implementation Agent.",
            "Implement the following plan exactly as specified.",
            "Create all files, install dependencies, and make sure everything runs.",
            "",
            "PLAN:",
            "---",
            plan,
            "---",
            "",
            "After implementation, run the tests to verify they pass.",
            "Do NOT deviate from the plan.",
          ].join("\n")
        : [
            "You are the Implementation Agent.",
            "Your previous implementation was reviewed and needs fixes.",
            "",
            "REVIEW FEEDBACK:",
            "---",
            read(`review-v${i - 1}.md`),
            "---",
            "",
            "ORIGINAL PLAN:",
            "---",
            plan,
            "---",
            "",
            "Fix all issues identified in the review.",
            "Run the tests after fixing to verify they pass.",
          ].join("\n");

    const implNotes = codex(implPrompt, { sandbox: "workspace-write" });
    save(`impl-notes-v${i}.md`, implNotes);

    log("IMPL", `${i}b`, "Opus reviewing implementation");
    const review = claude(
      [
        "You are the Review Agent. Review the implementation against the plan.",
        "",
        `Read the locked plan at: ${PIPE("plan-locked.md")}`,
        `Read the implementer notes at: ${PIPE(`impl-notes-v${i}.md`)}`,
        "",
        "Then inspect the actual source files created in the project.",
        "Run the tests with the appropriate test command.",
        "",
        "Review checklist:",
        "1. Does the code match the plan's specifications?",
        "2. Do tests exist and cover the required cases?",
        "3. Are there security issues?",
        "4. Does everything run without errors?",
        "",
        'If everything is satisfactory, respond with "IMPLEMENTATION APPROVED" and a brief summary.',
        "Otherwise, list specific issues with file paths and what needs to change.",
      ].join("\n"),
      { tools: ["Read", "Glob", "Grep", "Bash"], maxTurns: 30 },
    );
    save(`review-v${i}.md`, review);

    if (review.toUpperCase().includes("IMPLEMENTATION APPROVED")) {
      console.log("  Opus approved the implementation.");
      return true;
    }
    console.log("  Review found issues. Looping back to Codex...");
  }

  console.error(`  Max implementation iterations (${CONFIG.maxImplIterations}) reached.`);
  return false;
}

// ── Main ───────────────────────────────────────────────────────

const task =
  process.argv[2] ||
  "Create a hello world Express server with a GET /health endpoint that returns { status: \"ok\" }, and unit tests using Jest.";

console.log("+" + "=".repeat(58) + "+");
console.log("|        AI Pipeline Orchestrator — Dry Run               |");
console.log("+" + "=".repeat(58) + "+");
console.log(`\nTask: ${task}\n`);

checkPrereqs();
mkdirSync(PIPE(), { recursive: true });

const plan = planningPhase(task);
const success = implementationPhase(plan);

console.log("\n" + "=".repeat(60));
if (success) {
  console.log("Pipeline completed successfully.");
  console.log("Artifacts saved in .pipeline/");
} else {
  console.log("Pipeline finished with unresolved issues.");
  console.log("Check .pipeline/ for details.");
}
console.log("=".repeat(60) + "\n");

process.exit(success ? 0 : 1);
