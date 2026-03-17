import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const globalPath = resolve(__dirname, "../src/styles/global.css");
const globalCss = readFileSync(globalPath, "utf-8");

describe("global.css", () => {
  it("includes box-sizing reset", () => {
    expect(globalCss).toContain("box-sizing: border-box");
  });

  it("sets body font-family using token", () => {
    expect(globalCss).toContain("var(--font-family-body)");
  });

  it("sets body background-color using token", () => {
    expect(globalCss).toContain("var(--color-bg)");
  });

  it("sets body text color using token", () => {
    expect(globalCss).toContain("var(--color-text)");
  });

  it("includes font-smoothing", () => {
    expect(globalCss).toContain("-webkit-font-smoothing: antialiased");
  });
});
