import { describe, it, expect } from "vitest";
import { computeRatingUpdate } from "../../src/puzzle/rating.js";

describe("computeRatingUpdate", () => {
  it("increases rating when solving a higher-rated puzzle", () => {
    // User 1500, puzzle 1600, RD 350 → K=32, expected ≈ 0.36, score=1
    // delta = round(32 * (1 - 0.3599)) = round(32 * 0.6401) = round(20.48) = 20
    const result = computeRatingUpdate(1500, 350, 1600, true);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.newRating).toBe(1500 + result.delta);
    expect(result.newRD).toBe(349);
  });

  it("decreases rating when failing a lower-rated puzzle", () => {
    // User 1500, puzzle 1400, RD 350 → K=32, expected ≈ 0.64, score=0
    // delta = round(32 * (0 - 0.6401)) = round(-20.48) = -20
    const result = computeRatingUpdate(1500, 350, 1400, false);
    expect(result.delta).toBeLessThan(0);
    expect(result.newRating).toBe(1500 + result.delta);
    expect(result.newRD).toBe(349);
  });

  it("gives smaller delta with lower rating deviation", () => {
    // RD 100 → K = 32 * (100/350) ≈ 9.14
    const highRD = computeRatingUpdate(1500, 350, 1500, true);
    const lowRD = computeRatingUpdate(1500, 100, 1500, true);
    expect(Math.abs(highRD.delta)).toBeGreaterThan(Math.abs(lowRD.delta));
  });

  it("rating deviation decreases by 1 per attempt", () => {
    const result = computeRatingUpdate(1500, 200, 1500, true);
    expect(result.newRD).toBe(199);
  });

  it("rating deviation does not go below 50", () => {
    const result = computeRatingUpdate(1500, 50, 1500, true);
    expect(result.newRD).toBe(50);
  });

  it("returns exact expected values for known inputs", () => {
    // User 1500, puzzle 1500, RD 350, solved=true
    // K = 32 * (350/350) = 32
    // expected = 1 / (1 + 10^(0/400)) = 1 / (1 + 1) = 0.5
    // delta = round(32 * (1 - 0.5)) = round(16) = 16
    const result = computeRatingUpdate(1500, 350, 1500, true);
    expect(result.delta).toBe(16);
    expect(result.newRating).toBe(1516);
    expect(result.newRD).toBe(349);
  });

  it("returns exact expected values for a failed equal-rated puzzle", () => {
    // User 1500, puzzle 1500, RD 350, solved=false
    // delta = round(32 * (0 - 0.5)) = round(-16) = -16
    const result = computeRatingUpdate(1500, 350, 1500, false);
    expect(result.delta).toBe(-16);
    expect(result.newRating).toBe(1484);
    expect(result.newRD).toBe(349);
  });

  it("handles large rating difference correctly", () => {
    // User 1500, puzzle 2000, RD 350, solved=true
    // expected = 1 / (1 + 10^(500/400)) = 1 / (1 + 10^1.25) ≈ 1 / (1 + 17.78) ≈ 0.05325
    // delta = round(32 * (1 - 0.05325)) = round(32 * 0.94675) = round(30.296) = 30
    const result = computeRatingUpdate(1500, 350, 2000, true);
    expect(result.delta).toBe(30);
    expect(result.newRating).toBe(1530);
  });
});
