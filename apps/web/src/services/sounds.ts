const PREFS_KEY = "chess-preferences";

type SoundName = "move" | "capture" | "check" | "castle" | "gameStart" | "gameEnd" | "lowTime";

const SOUND_FILES: Record<SoundName, string> = {
  move: "/sounds/move.mp3",
  capture: "/sounds/capture.mp3",
  check: "/sounds/check.mp3",
  castle: "/sounds/castle.mp3",
  gameStart: "/sounds/game-start.mp3",
  gameEnd: "/sounds/game-end.mp3",
  lowTime: "/sounds/low-time.mp3",
};

let audioCache: Map<SoundName, HTMLAudioElement> | null = null;
let initialized = false;

function readMuted(): boolean {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { muted?: boolean };
      return parsed.muted === true;
    }
  } catch {
    // localStorage unavailable or corrupted
  }
  return false;
}

function writeMuted(muted: boolean): void {
  try {
    const existing = localStorage.getItem(PREFS_KEY);
    let prefs: Record<string, unknown> = {};
    try {
      if (existing) prefs = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      // ignore corrupted JSON
    }
    prefs.muted = muted;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable
  }
}

function initSounds(): void {
  if (initialized) return;
  initialized = true;
  audioCache = new Map();
  for (const [name, path] of Object.entries(SOUND_FILES)) {
    const audio = new Audio(path);
    audio.preload = "auto";
    audioCache.set(name as SoundName, audio);
  }
}

function playSound(name: SoundName): void {
  if (readMuted()) return;
  if (!audioCache) {
    initSounds();
  }
  const audio = audioCache!.get(name);
  if (!audio) return;
  const clone = audio.cloneNode() as HTMLAudioElement;
  clone.volume = audio.volume;
  clone.play().catch(() => {
    // Autoplay was blocked — silently ignore
  });
}

function isMuted(): boolean {
  return readMuted();
}

function setMuted(muted: boolean): void {
  writeMuted(muted);
}

export { initSounds, playSound, isMuted, setMuted };
export type { SoundName };
