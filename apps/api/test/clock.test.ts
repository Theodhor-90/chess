import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startClock, stopClock, switchClock, getClockState } from "../src/game/clock.js";
import type { ClockConfig } from "@chess/shared";

const DEFAULT_CONFIG: ClockConfig = { initialTime: 600, increment: 0 };
const CONFIG_WITH_INCREMENT: ClockConfig = { initialTime: 300, increment: 5 };

describe("Clock Manager", () => {
  let onTick: ReturnType<typeof vi.fn>;
  let onTimeout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onTick = vi.fn();
    onTimeout = vi.fn();
  });

  afterEach(() => {
    // Stop any active clocks to avoid leaked intervals
    stopClock(1);
    stopClock(2);
    stopClock(3);
    vi.useRealTimers();
  });

  describe("startClock", () => {
    it("initializes both players to initialTime * 1000 ms", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);
      const state = getClockState(1);
      expect(state).not.toBeNull();
      expect(state!.white).toBe(600000);
      expect(state!.black).toBe(600000);
      expect(state!.activeColor).toBe("white");
    });

    it("is idempotent — calling twice does not create a second interval", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);
      const state1 = getClockState(1);
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);
      const state2 = getClockState(1);
      expect(state1!.white).toBe(state2!.white);
    });
  });

  describe("tick deduction", () => {
    it("deducts elapsed time from active player every 100ms tick", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      // Advance 500ms (5 ticks)
      vi.advanceTimersByTime(500);

      const state = getClockState(1);
      // White should have lost ~500ms (may vary slightly due to getClockState computing elapsed)
      // Since getClockState also subtracts elapsed since last tick, and we just ticked,
      // white should be approximately 600000 - 500 = 599500
      expect(state!.white).toBeLessThanOrEqual(599500);
      expect(state!.white).toBeGreaterThanOrEqual(599400);
      // Black should be unchanged
      expect(state!.black).toBe(600000);
    });

    it("only deducts from the active player, not the opponent", () => {
      startClock(1, DEFAULT_CONFIG, "black", onTick, onTimeout);

      vi.advanceTimersByTime(1000);

      const state = getClockState(1);
      // White is NOT active, should be untouched
      expect(state!.white).toBe(600000);
      // Black is active, should have ~1000ms deducted
      expect(state!.black).toBeLessThanOrEqual(599000);
      expect(state!.black).toBeGreaterThanOrEqual(598900);
    });
  });

  describe("onTick callback", () => {
    it("calls onTick every ~1 second (every 10 ticks)", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      // Advance 900ms — should NOT have called onTick yet
      vi.advanceTimersByTime(900);
      expect(onTick).not.toHaveBeenCalled();

      // Advance another 100ms (total 1000ms = 10 ticks)
      vi.advanceTimersByTime(100);
      expect(onTick).toHaveBeenCalledTimes(1);
      expect(onTick).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          activeColor: "white",
        }),
      );
    });

    it("calls onTick 3 times after 3 seconds", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      vi.advanceTimersByTime(3000);
      expect(onTick).toHaveBeenCalledTimes(3);
    });
  });

  describe("switchClock (lag compensation)", () => {
    it("deducts elapsed time minus rtt/2, with minimum 100ms", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      // Advance 2000ms, then switch
      vi.advanceTimersByTime(2000);

      // White has been ticked down by ~2000ms during interval ticks.
      // switchClock will deduct elapsed since last tick (which is ~0ms right after a tick)
      // So let's advance by 300ms more (between ticks) and then switch
      vi.advanceTimersByTime(300);

      // RTT = 100ms, so lag compensation = 50ms
      // elapsed since last tick ≈ 300ms (one tick may fire at 2100)
      // deduction = max(elapsed - 50, 100)
      const result = switchClock(1, "white", 100);
      expect(result).not.toBeNull();
      // Active color should now be black
      expect(result!.activeColor).toBe("black");
    });

    it("enforces minimum 100ms deduction per move", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      // Switch immediately (elapsed ≈ 0ms from last tick)
      // With RTT = 0, deduction = max(0 - 0, 100) = 100
      const result = switchClock(1, "white", 0);
      expect(result).not.toBeNull();
      // White should have lost exactly 100ms from initial 600000
      expect(result!.white).toBe(599900);
      expect(result!.activeColor).toBe("black");
    });

    it("enforces minimum 100ms even with large RTT", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      // Advance 50ms, switch with RTT = 1000 (rtt/2 = 500 > elapsed)
      vi.advanceTimersByTime(50);
      // After one 100ms tick hasn't fired yet (50ms < 100ms)
      // elapsed since last tick = 50ms
      // deduction = max(50 - 500, 100) = max(-450, 100) = 100
      const result = switchClock(1, "white", 1000);
      expect(result).not.toBeNull();
      expect(result!.white).toBe(599900);
    });

    it("adds increment after deduction", () => {
      startClock(1, CONFIG_WITH_INCREMENT, "white", onTick, onTimeout);

      // Switch immediately — deduction = 100ms minimum
      // Increment = 5s = 5000ms
      // White: 300000 - 100 + 5000 = 304900
      const result = switchClock(1, "white", 0);
      expect(result).not.toBeNull();
      expect(result!.white).toBe(304900);
    });

    it("switches active color to opponent", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      const result = switchClock(1, "white", 0);
      expect(result!.activeColor).toBe("black");

      // Now switch back from black
      const result2 = switchClock(1, "black", 0);
      expect(result2!.activeColor).toBe("white");
    });

    it("returns null for non-existent clock", () => {
      const result = switchClock(999, "white", 0);
      expect(result).toBeNull();
    });
  });

  describe("timeout detection", () => {
    it("calls onTimeout when active player's time reaches 0", () => {
      // Use a short clock: 1 second total
      startClock(1, { initialTime: 1, increment: 0 }, "white", onTick, onTimeout);

      // Advance past 1 second
      vi.advanceTimersByTime(1100);

      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout).toHaveBeenCalledWith(
        1,
        "white",
        expect.objectContaining({
          white: 0,
          black: 1000,
          activeColor: "white",
        }),
      );
    });

    it("stops the clock after timeout", () => {
      startClock(1, { initialTime: 1, increment: 0 }, "white", onTick, onTimeout);

      vi.advanceTimersByTime(1100);

      // Clock should be stopped — getClockState returns null
      const state = getClockState(1);
      expect(state).toBeNull();
    });

    it("does not call onTimeout for the inactive player", () => {
      startClock(1, { initialTime: 1, increment: 0 }, "white", onTick, onTimeout);

      // Switch to black immediately, then advance
      switchClock(1, "white", 0);

      // Now black is active. Advance 1.1 seconds — black should time out
      vi.advanceTimersByTime(1100);

      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onTimeout).toHaveBeenCalledWith(
        1,
        "black",
        expect.objectContaining({
          white: 900,
          black: 0,
          activeColor: "black",
        }),
      );
    });
  });

  describe("stopClock", () => {
    it("clears the interval and removes the clock", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);
      expect(getClockState(1)).not.toBeNull();

      stopClock(1);
      expect(getClockState(1)).toBeNull();

      // Advancing timers should not trigger callbacks
      vi.advanceTimersByTime(5000);
      expect(onTick).not.toHaveBeenCalled();
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it("is safe to call on non-existent clock", () => {
      expect(() => stopClock(999)).not.toThrow();
    });
  });

  describe("getClockState", () => {
    it("returns null for non-existent clock", () => {
      expect(getClockState(999)).toBeNull();
    });

    it("returns up-to-date remaining time accounting for elapsed since last tick", () => {
      startClock(1, DEFAULT_CONFIG, "white", onTick, onTimeout);

      // Advance 50ms (less than one tick interval, so no tick has fired)
      vi.advanceTimersByTime(50);

      const state = getClockState(1);
      // getClockState should compute: white remaining = 600000 - 50 = 599950
      expect(state!.white).toBe(599950);
      expect(state!.black).toBe(600000);
    });
  });
});
