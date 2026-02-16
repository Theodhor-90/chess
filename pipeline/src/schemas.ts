import { log } from "./logger.js";

// ── Types ────────────────────────────────────────────────────

export interface ChallengeDecision {
  verdict: "approved" | "needs_revision";
  feedback: string;
}

export interface ReviewDecision {
  verdict: "approved" | "needs_revision";
  feedback: string;
  issues?: { file: string; description: string }[];
}

export type Decision = ChallengeDecision | ReviewDecision;

// ── Parser ───────────────────────────────────────────────────

export function parseDecision(raw: string, schemaName: string): Decision {
  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(raw);
    if (isValidDecision(parsed)) {
      return parsed;
    }
  } catch {
    // Not valid JSON — fall through
  }

  // Strategy 2: Extract JSON block from surrounding text
  log("", "parse", `Direct JSON parse failed for ${schemaName}, trying extraction`);
  try {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonBlock = raw.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonBlock);
      if (isValidDecision(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Extraction failed — fall through
  }

  // Strategy 3: Text matching fallback
  log("", "parse", `JSON extraction failed for ${schemaName}, trying text matching`);
  const lowerRaw = raw.toLowerCase();
  if (lowerRaw.includes("approved") && !lowerRaw.includes("needs_revision")) {
    log("", "parse", `WARNING: Fell back to text matching for ${schemaName} — detected "approved"`);
    return { verdict: "approved", feedback: "" };
  }
  if (lowerRaw.includes("needs_revision") || lowerRaw.includes("needs revision")) {
    log(
      "",
      "parse",
      `WARNING: Fell back to text matching for ${schemaName} — detected "needs_revision"`,
    );
    return { verdict: "needs_revision", feedback: raw };
  }

  // Strategy 4: Total failure — treat as rejection
  log(
    "",
    "parse",
    `WARNING: All parse strategies failed for ${schemaName}. Treating as needs_revision.`,
  );
  return {
    verdict: "needs_revision",
    feedback: "Failed to parse decision output. Raw response saved for manual review.",
  };
}

// ── Validation Helper ────────────────────────────────────────

function isValidDecision(obj: unknown): obj is Decision {
  if (typeof obj !== "object" || obj === null) return false;
  const d = obj as Record<string, unknown>;
  if (d.verdict !== "approved" && d.verdict !== "needs_revision") return false;
  if (typeof d.feedback !== "string") return false;
  return true;
}
