import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tokensPath = resolve(__dirname, "../src/styles/tokens.css");
const tokensCss = readFileSync(tokensPath, "utf-8");

describe("tokens.css", () => {
  it('defines tokens under [data-theme="light"] selector', () => {
    expect(tokensCss).toContain('[data-theme="light"]');
  });

  it("defines color tokens", () => {
    expect(tokensCss).toContain("--color-primary:");
    expect(tokensCss).toContain("--color-success:");
    expect(tokensCss).toContain("--color-error:");
    expect(tokensCss).toContain("--color-warning:");
    expect(tokensCss).toContain("--color-text:");
    expect(tokensCss).toContain("--color-bg:");
    expect(tokensCss).toContain("--color-surface:");
    expect(tokensCss).toContain("--color-border:");
  });

  it("defines spacing tokens from space-1 to space-8", () => {
    for (let i = 1; i <= 8; i++) {
      expect(tokensCss).toContain(`--space-${i}:`);
    }
  });

  it("defines typography tokens", () => {
    expect(tokensCss).toContain("--font-family-body:");
    expect(tokensCss).toContain("--font-family-mono:");
    expect(tokensCss).toContain("--font-size-xs:");
    expect(tokensCss).toContain("--font-size-sm:");
    expect(tokensCss).toContain("--font-size-md:");
    expect(tokensCss).toContain("--font-size-lg:");
    expect(tokensCss).toContain("--font-size-xl:");
    expect(tokensCss).toContain("--font-size-2xl:");
    expect(tokensCss).toContain("--font-weight-normal:");
    expect(tokensCss).toContain("--font-weight-medium:");
    expect(tokensCss).toContain("--font-weight-semibold:");
    expect(tokensCss).toContain("--font-weight-bold:");
    expect(tokensCss).toContain("--line-height-tight:");
    expect(tokensCss).toContain("--line-height-normal:");
  });

  it("defines border and radius tokens", () => {
    expect(tokensCss).toContain("--radius-sm:");
    expect(tokensCss).toContain("--radius-md:");
    expect(tokensCss).toContain("--radius-lg:");
    expect(tokensCss).toContain("--radius-full:");
  });

  it("defines shadow tokens", () => {
    expect(tokensCss).toContain("--shadow-sm:");
    expect(tokensCss).toContain("--shadow-md:");
    expect(tokensCss).toContain("--shadow-lg:");
  });

  it("defines transition tokens", () => {
    expect(tokensCss).toContain("--transition-duration:");
    expect(tokensCss).toContain("--transition-easing:");
    expect(tokensCss).toContain("--transition-default:");
  });

  it("defines breakpoint tokens", () => {
    expect(tokensCss).toContain("--bp-sm:");
    expect(tokensCss).toContain("--bp-md:");
    expect(tokensCss).toContain("--bp-lg:");
    expect(tokensCss).toContain("--bp-xl:");
  });

  it("defines mobile typography scale override", () => {
    expect(tokensCss).toContain("@media (max-width: 768px)");
    expect(tokensCss).toMatch(/--font-size-2xl:\s*24px/);
  });

  it('defines dark mode tokens under [data-theme="dark"] selector', () => {
    expect(tokensCss).toContain('[data-theme="dark"]');
  });

  it("defines dark mode color overrides", () => {
    const darkSection = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));
    expect(darkSection).toContain("--color-primary:");
    expect(darkSection).toContain("--color-bg:");
    expect(darkSection).toContain("--color-surface:");
    expect(darkSection).toContain("--color-text:");
    expect(darkSection).toContain("--color-text-secondary:");
    expect(darkSection).toContain("--color-border:");
    expect(darkSection).toContain("--color-error:");
    expect(darkSection).toContain("--color-success:");
  });

  it("defines overlay tokens in light theme", () => {
    expect(tokensCss).toContain("--color-overlay:");
    expect(tokensCss).toContain("--color-overlay-light:");
    expect(tokensCss).toContain("--color-scroll-hint:");
    expect(tokensCss).toContain("--color-shadow-subtle:");
  });

  it("defines move classification token", () => {
    expect(tokensCss).toContain("--color-mistake:");
  });

  it("defines dark mode shadow overrides", () => {
    const darkSection = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));
    expect(darkSection).toContain("--shadow-sm:");
    expect(darkSection).toContain("--shadow-md:");
    expect(darkSection).toContain("--shadow-lg:");
  });

  it("defines dark mode mobile typography scale", () => {
    const matches = tokensCss.match(/@media \(max-width: 768px\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });
});
