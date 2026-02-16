import { describe, it, expectTypeOf } from "vitest";
import type { HealthResponse } from "../src/index.js";

describe("@chess/shared", () => {
  it("exports HealthResponse type", () => {
    expectTypeOf<HealthResponse>().toEqualTypeOf<{ status: "ok" }>();
  });
});
