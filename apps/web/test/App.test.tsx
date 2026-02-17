import { describe, it, expect, expectTypeOf } from "vitest";
import { App } from "../src/App.js";
import Board from "../src/components/Board.js";
import type { HealthResponse } from "@chess/shared";

describe("@chess/web", () => {
  it("App component is defined", () => {
    expect(App).toBeDefined();
  });

  it("Board component is defined", () => {
    expect(Board).toBeDefined();
  });

  it("HealthResponse type is consumed from @chess/shared", () => {
    expectTypeOf<HealthResponse>().toEqualTypeOf<{ status: "ok" }>();
  });
});
