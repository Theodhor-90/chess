import { Chess } from "chess.js";
import type { BotProfile, MoveRequest, PlayerColor, ClockState, GameState } from "@chess/shared";
import type { EnginePool } from "../engine/engine-pool.js";
import type { TypedSocketServer } from "../socket/index.js";
import * as gameService from "../game/service.js";
import { switchClock, getClockState, getClockRemainingTimes, stopClock } from "../game/clock.js";
import * as store from "../game/store.js";
import { aggregatePlatformGame, tagGameOpening } from "../explorer/service.js";
import { aggregatePlayerGameIfIndexed } from "../explorer/player-stats.js";
import { db } from "../db/index.js";
import { games as gamesTable } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const BOT_USER_ID = 0;

/**
 * Convert a SAN move to a MoveRequest by replaying it on a chess.js instance.
 * The engine returns SAN moves (via uciMovesToSan in uci-engine.ts:406-428),
 * so we convert them back to {from, to, promotion} format for gameService.makeMove().
 */
function sanToMoveRequest(fen: string, san: string): MoveRequest {
  const chess = new Chess(fen);
  const move = chess.move(san);
  if (!move) {
    throw new Error(`Invalid SAN move: ${san}`);
  }
  return { from: move.from, to: move.to, promotion: move.promotion ?? undefined };
}

/**
 * Select a bot move by evaluating the position with the engine and applying
 * the difficulty profile's error rate to occasionally pick suboptimal lines.
 *
 * The engine returns up to 3 MultiPV lines with SAN moves (see
 * uci-engine.ts:303-321 snapshotCurrentEval). With probability
 * `profile.errorRate`, a non-best line is selected at random.
 */
export async function selectBotMove(
  enginePool: EnginePool,
  fen: string,
  profile: BotProfile,
): Promise<MoveRequest> {
  const result = await enginePool.evaluate(fen, profile.depth);
  const lines = result.engineLines ?? [];

  if (lines.length === 0) {
    // Fallback: use bestLine from the result (also SAN)
    if (result.bestLine.length === 0) {
      throw new Error("Engine returned no moves");
    }
    return sanToMoveRequest(fen, result.bestLine[0]);
  }

  // Determine which line to use
  let selectedLineIndex = 0;

  if (lines.length > 1 && profile.errorRate > 0 && Math.random() < profile.errorRate) {
    // Pick a random suboptimal line (index 1 or 2, if available)
    const suboptimalCount = lines.length - 1;
    selectedLineIndex = 1 + Math.floor(Math.random() * suboptimalCount);
  }

  const selectedLine = lines[selectedLineIndex];
  if (!selectedLine || selectedLine.moves.length === 0) {
    // Fallback to best line
    if (lines[0].moves.length === 0) {
      throw new Error("Engine returned empty lines");
    }
    return sanToMoveRequest(fen, lines[0].moves[0]);
  }

  return sanToMoveRequest(fen, selectedLine.moves[0]);
}

/**
 * Wait for a random duration within the bot profile's think-time range.
 * Returns an object with `promise` (resolves after the delay) and `cancel`
 * (clears the timeout, e.g. on server shutdown). The caller (t03) is
 * responsible for calling `cancel()` during shutdown cleanup.
 */
export function waitThinkTime(profile: BotProfile): { promise: Promise<void>; cancel: () => void } {
  const duration =
    profile.thinkTimeMin + Math.random() * (profile.thinkTimeMax - profile.thinkTimeMin);
  let timerId: ReturnType<typeof setTimeout>;
  const promise = new Promise<void>((resolve) => {
    timerId = setTimeout(resolve, duration);
  });
  const cancel = () => clearTimeout(timerId);
  return { promise, cancel };
}

/**
 * Determine the bot's color in a bot game.
 * The bot side is whichever player slot is empty (null).
 */
function getBotColor(game: GameState): PlayerColor | null {
  if (!game.players.white) return "white";
  if (!game.players.black) return "black";
  return null;
}

/**
 * Build a ClockState for a game, using the active clock if running
 * or constructing one from persisted values.
 *
 * Note: this duplicates the logic in socket/handlers.ts:32-44.
 * A future refactor could extract it to a shared utility, but for now
 * the duplication is acceptable to keep this module self-contained.
 */
function buildClockStateForGame(game: GameState): ClockState {
  const activeClock = getClockState(game.id);
  if (activeClock) {
    return activeClock;
  }
  const initialMs = game.clock.initialTime * 1000;
  return {
    white: game.clockWhiteRemaining ?? initialMs,
    black: game.clockBlackRemaining ?? initialMs,
    activeColor: game.status === "active" ? game.currentTurn : null,
    lastUpdate: Date.now(),
  };
}

/**
 * Persist clock remaining times to the database.
 */
function persistClock(gameId: number): void {
  const remainingTimes = getClockRemainingTimes(gameId);
  if (remainingTimes) {
    store.updateGame(gameId, {
      clockWhiteRemaining: remainingTimes.white,
      clockBlackRemaining: remainingTimes.black,
    });
  }
}

/**
 * Full bot move orchestrator:
 * 1. Get the game state; if not active, return.
 * 2. Verify it's the bot's turn.
 * 3. Wait the think-time delay.
 * 4. Re-fetch game state (it may have ended during think time).
 * 5. Select and make the move via gameService.makeMove.
 * 6. Switch clock and emit socket events.
 */
export async function makeBotMove(
  enginePool: EnginePool,
  io: TypedSocketServer,
  gameId: number,
  profile: BotProfile,
): Promise<void> {
  let game: GameState;
  try {
    game = gameService.getGame(gameId);
  } catch {
    return;
  }
  if (game.status !== "active") return;

  const botColor = getBotColor(game);
  if (!botColor) return;
  if (game.currentTurn !== botColor) return;

  // Wait think time before making move
  const { promise } = waitThinkTime(profile);
  await promise;

  // Re-fetch after waiting — game may have ended (resign, timeout, etc.)
  try {
    game = gameService.getGame(gameId);
  } catch {
    return;
  }
  if (game.status !== "active") return;
  if (game.currentTurn !== botColor) return;

  // Select and execute the move
  const move = await selectBotMove(enginePool, game.fen, profile);
  const moveResult = gameService.makeMove(gameId, BOT_USER_ID, move);

  // Switch clock (bot gets 0 RTT compensation)
  const clockFromSwitch = switchClock(gameId, botColor, 0);
  persistClock(gameId);

  // Check if game ended on this move
  const isTerminal =
    moveResult.status === "checkmate" ||
    moveResult.status === "stalemate" ||
    moveResult.status === "draw";

  if (isTerminal) {
    persistClock(gameId);
    stopClock(gameId);
  }

  // Emit socket events to the game room
  const updatedGame = gameService.getGame(gameId);
  const clockState = clockFromSwitch ?? buildClockStateForGame(updatedGame);
  const roomName = `game:${gameId}`;

  io.to(roomName).emit("moveMade", {
    fen: moveResult.fen,
    san: moveResult.san,
    pgn: moveResult.pgn,
    status: moveResult.status,
    ...(moveResult.result ? { result: moveResult.result } : {}),
    clock: clockState,
  });

  if (isTerminal) {
    io.to(roomName).emit("gameOver", {
      status: moveResult.status,
      result: moveResult.result!,
      clock: clockState,
    });
    try {
      tagGameOpening(gameId);
      aggregatePlatformGame(gameId);
    } catch (err) {
      console.error(`Opening aggregation failed for bot game ${gameId}:`, err);
    }
    try {
      const gameRow = db.select().from(gamesTable).where(eq(gamesTable.id, gameId)).get();
      if (gameRow) {
        if (gameRow.whitePlayerId && gameRow.whitePlayerId !== 0) {
          aggregatePlayerGameIfIndexed(gameRow.whitePlayerId, gameId);
        }
        if (gameRow.blackPlayerId && gameRow.blackPlayerId !== 0) {
          aggregatePlayerGameIfIndexed(gameRow.blackPlayerId, gameId);
        }
      }
    } catch (err) {
      console.error(`Player stats aggregation failed for bot game ${gameId}:`, err);
    }
  }
}
