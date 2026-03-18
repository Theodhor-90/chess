import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Audio constructor before importing the module
const mockPlay = vi.fn().mockResolvedValue(undefined);
const mockAudio = {
  preload: "",
  volume: 1,
  play: mockPlay,
  cloneNode: vi.fn(),
};
mockAudio.cloneNode.mockReturnValue(mockAudio);

vi.stubGlobal(
  "Audio",
  vi.fn(() => ({ ...mockAudio })),
);

// Dynamic import to ensure the mock is in place before module loads
// We need to reset the module state between tests
let soundModule: typeof import("../src/services/sounds.js");

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  mockPlay.mockClear();
  mockAudio.cloneNode.mockClear();
  (globalThis.Audio as ReturnType<typeof vi.fn>).mockClear();
  // Re-import to get a fresh module with reset state
  soundModule = await import("../src/services/sounds.js");
});

afterEach(() => {
  localStorage.clear();
});

describe("sounds service", () => {
  describe("isMuted / setMuted", () => {
    it("returns false by default when no preferences stored", () => {
      expect(soundModule.isMuted()).toBe(false);
    });

    it("returns true after setMuted(true)", () => {
      soundModule.setMuted(true);
      expect(soundModule.isMuted()).toBe(true);
    });

    it("returns false after setMuted(false)", () => {
      soundModule.setMuted(true);
      soundModule.setMuted(false);
      expect(soundModule.isMuted()).toBe(false);
    });

    it("persists muted state in localStorage under chess-preferences", () => {
      soundModule.setMuted(true);
      const stored = JSON.parse(localStorage.getItem("chess-preferences")!);
      expect(stored.muted).toBe(true);
    });

    it("preserves other preferences when writing muted", () => {
      localStorage.setItem(
        "chess-preferences",
        JSON.stringify({ theme: "dark", boardTheme: "blue" }),
      );
      soundModule.setMuted(true);
      const stored = JSON.parse(localStorage.getItem("chess-preferences")!);
      expect(stored.theme).toBe("dark");
      expect(stored.boardTheme).toBe("blue");
      expect(stored.muted).toBe(true);
    });

    it("reads muted state from existing preferences", () => {
      localStorage.setItem("chess-preferences", JSON.stringify({ muted: true }));
      // Need to re-import to test reading
      expect(soundModule.isMuted()).toBe(true);
    });
  });

  describe("initSounds", () => {
    it("creates Audio objects for all 7 sounds", () => {
      soundModule.initSounds();
      // 7 sounds: move, capture, check, castle, gameStart, gameEnd, lowTime
      expect(globalThis.Audio).toHaveBeenCalledTimes(7);
    });

    it("does not create Audio objects twice on repeated calls", () => {
      soundModule.initSounds();
      soundModule.initSounds();
      expect(globalThis.Audio).toHaveBeenCalledTimes(7);
    });

    it("sets preload to auto on each Audio object", () => {
      soundModule.initSounds();
      const calls = (globalThis.Audio as ReturnType<typeof vi.fn>).mock.results;
      for (const call of calls) {
        expect(call.value.preload).toBe("auto");
      }
    });
  });

  describe("playSound", () => {
    it("does not play when muted", () => {
      soundModule.setMuted(true);
      soundModule.initSounds();
      soundModule.playSound("move");
      expect(mockPlay).not.toHaveBeenCalled();
    });

    it("plays sound when not muted", () => {
      soundModule.initSounds();
      soundModule.playSound("move");
      // playSound clones the audio and calls play on the clone
      expect(mockPlay).toHaveBeenCalled();
    });

    it("auto-initializes if initSounds was not called", () => {
      soundModule.playSound("capture");
      expect(globalThis.Audio).toHaveBeenCalled();
    });
  });
});
