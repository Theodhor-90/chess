import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to the pipeline directory (not CWD)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PIPELINE_ROOT = join(__dirname, "..");

const PROMPTS_DIR = join(PIPELINE_ROOT, "prompts");

export function loadTemplate(name: string, vars: Record<string, string>): string {
  const templatePath = join(PROMPTS_DIR, `${name}.md`);

  let content: string;
  try {
    content = readFileSync(templatePath, "utf-8");
  } catch {
    throw new Error(`Template not found: ${templatePath}`);
  }

  // Substitute all {{VAR}} placeholders
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }

  // Check for any remaining unreplaced placeholders
  const remaining = content.match(/\{\{[A-Z_]+\}\}/g);
  if (remaining) {
    throw new Error(
      `Template "${name}" has unreplaced placeholders: ${remaining.join(", ")}. ` +
        `Provided vars: ${Object.keys(vars).join(", ")}`,
    );
  }

  return content;
}
