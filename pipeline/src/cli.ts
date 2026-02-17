import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, DRY_RUN } from "./config.js";
import { parseDecision, type Decision } from "./schemas.js";
import { log } from "./logger.js";

// ── Path Resolution ──────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PIPELINE_ROOT = join(__dirname, "..");
const PROJECT_ROOT = join(PIPELINE_ROOT, "..");
const SCHEMAS_DIR = join(PIPELINE_ROOT, "schemas");
const TMP_DIR = join(PROJECT_ROOT, ".pipeline", "tmp");

// ── Types ────────────────────────────────────────────────────

export interface CliResult {
  raw: string;
  decision?: Decision;
}

// ── Mock State (for --dry-run) ───────────────────────────────

let mockDecisions: Decision[] = [];
let mockDecisionIndex = 0;

export function setMockDecisions(decisions: Decision[]): void {
  mockDecisions = decisions;
  mockDecisionIndex = 0;
}

function nextMockDecision(): Decision {
  if (mockDecisionIndex < mockDecisions.length) {
    return mockDecisions[mockDecisionIndex++];
  }
  return { verdict: "approved", feedback: "" };
}

// ── Environment Helper ───────────────────────────────────────

function cleanEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE;
  return env;
}

// ── Claude Wrapper ───────────────────────────────────────────

export function claude(
  prompt: string,
  options: {
    tools?: string[];
    maxTurns?: number;
    schema?: string;
  } = {},
): CliResult {
  if (DRY_RUN) {
    return mockCliCall("claude", prompt, !!options.schema);
  }

  const { tools = [], maxTurns = CONFIG.claude.defaultMaxTurns, schema } = options;
  const isDecision = !!schema;

  const args: string[] = [
    "-p",
    prompt,
    "--model",
    CONFIG.claude.model,
    "--output-format",
    isDecision ? "json" : "text",
    "--max-turns",
    String(maxTurns),
  ];

  if (tools.length) {
    args.push("--allowedTools", tools.join(","));
  }

  if (schema) {
    const schemaContent = readFileSync(join(SCHEMAS_DIR, schema), "utf-8");
    args.push("--json-schema", schemaContent);
  }

  log(
    "",
    "cli",
    `claude -p (tools: ${tools.join(",") || "none"}, max-turns: ${maxTurns}, schema: ${schema || "none"})`,
  );

  const res = spawnSync(CONFIG.claude.bin, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: CONFIG.timeoutMs,
    env: cleanEnv(),
  });

  if (res.error) {
    throw new Error(`claude failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = res.stderr?.slice(0, 500) || "";
    throw new Error(`claude exited with code ${res.status}: ${stderr}`);
  }

  const stdout = (res.stdout || "").trim();

  if (!isDecision) {
    return { raw: stdout };
  }

  // Decision call — parse structured output
  return parseClaudeDecision(stdout, schema!);
}

function parseClaudeDecision(stdout: string, schema: string): CliResult {
  // Try to parse the JSON envelope from --output-format json
  try {
    const envelope = JSON.parse(stdout);

    const raw = typeof envelope.result === "string" ? envelope.result : stdout;

    // Prefer structured_output if available
    if (envelope.structured_output != null) {
      const structured =
        typeof envelope.structured_output === "string"
          ? envelope.structured_output
          : JSON.stringify(envelope.structured_output);
      const decision = parseDecision(structured, schema);
      return { raw, decision };
    }

    // Fall back to parsing the result text
    const decision = parseDecision(raw, schema);
    return { raw, decision };
  } catch {
    // JSON envelope parse failed — try raw text through defensive parser
    log("", "cli", "Claude JSON envelope parse failed, falling back to raw text");
    const decision = parseDecision(stdout, schema);
    return { raw: stdout, decision };
  }
}

// ── Codex Wrapper ────────────────────────────────────────────

export function codex(
  prompt: string,
  options: {
    sandbox?: "read-only" | "workspace-write";
    schema?: string;
  } = {},
): CliResult {
  if (DRY_RUN) {
    return mockCliCall("codex", prompt, !!options.schema);
  }

  const { sandbox = CONFIG.codex.defaultSandbox, schema } = options;
  const isDecision = !!schema;

  const args: string[] = ["exec", prompt, "--sandbox", sandbox];

  let outputFile: string | null = null;

  if (schema) {
    const schemaPath = join(SCHEMAS_DIR, schema);
    args.push("--output-schema", schemaPath);

    mkdirSync(TMP_DIR, { recursive: true });
    outputFile = join(TMP_DIR, `codex-output-${Date.now()}.json`);
    args.push("-o", outputFile);
  }

  log("", "cli", `codex exec (sandbox: ${sandbox}, schema: ${schema || "none"})`);

  const res = spawnSync(CONFIG.codex.bin, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: CONFIG.timeoutMs,
    env: cleanEnv(),
  });

  if (res.error) {
    throw new Error(`codex failed: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = res.stderr?.slice(0, 500) || "";
    throw new Error(`codex exited with code ${res.status}: ${stderr}`);
  }

  const stdout = (res.stdout || "").trim();

  if (!isDecision) {
    return { raw: stdout };
  }

  // Decision call — read output file and parse
  return parseCodexDecision(outputFile!, stdout, schema!);
}

function parseCodexDecision(outputFile: string, stdout: string, schema: string): CliResult {
  let raw: string;
  try {
    raw = readFileSync(outputFile, "utf-8").trim();
  } catch {
    // Output file not created — fall back to stdout
    log("", "cli", "Codex output file not found, falling back to stdout");
    raw = stdout;
  }

  // Clean up temp file
  try {
    unlinkSync(outputFile);
  } catch {
    // Ignore cleanup failure
  }

  const decision = parseDecision(raw, schema);
  return { raw, decision };
}

// ── Mock CLI Call (dry-run) ──────────────────────────────────

function mockCliCall(cli: string, prompt: string, isDecision: boolean): CliResult {
  const preview = prompt.length > 80 ? prompt.substring(0, 80) + "..." : prompt;
  log("", "cli", `[DRY-RUN] ${cli}: ${preview}`);

  if (isDecision) {
    const decision = nextMockDecision();
    return { raw: JSON.stringify(decision), decision };
  }

  // Keep dry-run planning flows compatible with plan pre-flight validation.
  if (cli === "claude" && prompt.includes("You are the Planning Agent")) {
    return {
      raw: [
        "# Mock Plan",
        "",
        "## File Structure",
        "- Mock file changes",
        "",
        "## Dependencies",
        "- No dependency changes",
        "",
        "## Implementation Details",
        "- Mock implementation details",
        "",
        "## API Contracts",
        "- No API changes",
        "",
        "## Test Plan",
        "- Mock test notes",
        "",
        "## Implementation Order",
        "1. Mock step",
        "",
        "## Verification Commands",
        "```bash",
        "pnpm build",
        "pnpm typecheck",
        "pnpm test",
        "```",
      ].join("\n"),
    };
  }

  return { raw: `Mock ${cli} response for dry-run testing.` };
}

// ── Prerequisite Check ───────────────────────────────────────

export function checkPrereqs(): void {
  console.log("\nChecking prerequisites...\n");
  const problems: string[] = [];

  for (const [label, bin, pkg] of [
    ["Claude Code", CONFIG.claude.bin, "@anthropic-ai/claude-code"],
    ["Codex CLI", CONFIG.codex.bin, "@openai/codex"],
    ["GitHub CLI", "gh", "https://cli.github.com"],
  ] as const) {
    const r = spawnSync("which", [bin], { encoding: "utf-8" });
    if (r.status === 0) {
      console.log(`  OK  ${label} → ${r.stdout.trim()}`);
    } else {
      console.log(`  MISSING  ${label} — install with: npm install -g ${pkg}`);
      problems.push(label);
    }
  }

  // Auth check — API key or subscription login
  for (const [label, bin, loginCmd] of [
    ["Claude auth", CONFIG.claude.bin, "claude login"],
    ["Codex auth", CONFIG.codex.bin, "codex login"],
  ] as const) {
    const hasApiKey =
      (bin === "claude" && process.env.ANTHROPIC_API_KEY) ||
      (bin === "codex" && (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY));
    if (hasApiKey) {
      console.log(`  OK  ${label} (API key)`);
    } else {
      console.log(
        `  ?   ${label} — no API key found; assuming subscription login via "${loginCmd}"`,
      );
    }
  }

  if (problems.length) {
    console.log(`\nBlocked by ${problems.length} missing prerequisite(s). Fix and retry.\n`);
    process.exit(1);
  }
  console.log("\nAll prerequisites met.\n");
}
