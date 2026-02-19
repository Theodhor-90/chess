import type { ClockConfig, ClockState, PlayerColor } from "@chess/shared";

export type TickCallback = (gameId: number, clockState: ClockState) => void;
export type TimeoutCallback = (
  gameId: number,
  timedOutColor: PlayerColor,
  clockState: ClockState,
) => void;

interface ActiveClock {
  gameId: number;
  white: number; // remaining ms
  black: number; // remaining ms
  activeColor: PlayerColor;
  lastTick: number; // Date.now() of last tick/switch
  increment: number; // increment in ms
  intervalId: NodeJS.Timeout;
  tickCounter: number; // counts 100ms ticks, used to emit onTick every 1s (every 10 ticks)
}

const activeClocks = new Map<number, ActiveClock>();

export function startClock(
  gameId: number,
  config: ClockConfig,
  activeColor: PlayerColor,
  onTick: TickCallback,
  onTimeout: TimeoutCallback,
): void {
  // If clock already running for this game, do nothing
  if (activeClocks.has(gameId)) return;

  const now = Date.now();
  const initialMs = config.initialTime * 1000;

  const clock: ActiveClock = {
    gameId,
    white: initialMs,
    black: initialMs,
    activeColor,
    lastTick: now,
    increment: config.increment * 1000,
    tickCounter: 0,
    intervalId: null as unknown as NodeJS.Timeout,
  };

  clock.intervalId = setInterval(() => {
    const tickNow = Date.now();
    const elapsed = tickNow - clock.lastTick;
    clock.lastTick = tickNow;

    // Deduct elapsed from active player
    clock[clock.activeColor] -= elapsed;

    // Check timeout
    if (clock[clock.activeColor] <= 0) {
      clock[clock.activeColor] = 0;
      const timedOutColor = clock.activeColor;
      const clockState = buildClockState(clock);
      stopClock(gameId);
      onTimeout(gameId, timedOutColor, clockState);
      return;
    }

    // Emit onTick every 10 ticks (~1 second)
    clock.tickCounter += 1;
    if (clock.tickCounter >= 10) {
      clock.tickCounter = 0;
      onTick(gameId, buildClockState(clock));
    }
  }, 100);

  activeClocks.set(gameId, clock);
}

export function stopClock(gameId: number): void {
  const clock = activeClocks.get(gameId);
  if (!clock) return;
  clearInterval(clock.intervalId);
  activeClocks.delete(gameId);
}

export function switchClock(
  gameId: number,
  playerWhoMoved: PlayerColor,
  rtt: number,
): ClockState | null {
  const clock = activeClocks.get(gameId);
  if (!clock) return null;

  const now = Date.now();
  const elapsed = now - clock.lastTick;

  // Lag compensation: credit RTT/2 back to moving player
  const lagCompensation = rtt / 2;

  // Minimum 100ms (0.1s) deduction per move
  const deduction = Math.max(elapsed - lagCompensation, 100);

  // Deduct from the player who just moved
  clock[playerWhoMoved] -= deduction;

  // Floor at 0 (timeout will be caught on next tick if needed)
  if (clock[playerWhoMoved] < 0) {
    clock[playerWhoMoved] = 0;
  }

  // Add increment
  clock[playerWhoMoved] += clock.increment;

  // Switch active color to opponent
  clock.activeColor = playerWhoMoved === "white" ? "black" : "white";

  // Reset tick tracking
  clock.lastTick = now;
  clock.tickCounter = 0;

  return buildClockState(clock);
}

export function getClockState(gameId: number): ClockState | null {
  const clock = activeClocks.get(gameId);
  if (!clock) return null;

  // Compute up-to-date remaining time
  const now = Date.now();
  const elapsed = now - clock.lastTick;
  const white = clock.activeColor === "white" ? Math.max(clock.white - elapsed, 0) : clock.white;
  const black = clock.activeColor === "black" ? Math.max(clock.black - elapsed, 0) : clock.black;

  return {
    white,
    black,
    activeColor: clock.activeColor,
    lastUpdate: now,
  };
}

function buildClockState(clock: ActiveClock): ClockState {
  return {
    white: clock.white,
    black: clock.black,
    activeColor: clock.activeColor,
    lastUpdate: Date.now(),
  };
}
