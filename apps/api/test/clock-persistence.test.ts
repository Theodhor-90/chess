import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { buildApp } from "../src/server.js";
import {
  ensureSchema,
  uniqueEmail,
  registerAndLogin,
  createSocketClient,
  type TypedClientSocket,
} from "./helpers.js";
import type { TypedSocketServer } from "../src/socket/index.js";
import type { AddressInfo } from "node:net";
import type { ServerToClientEvents } from "@chess/shared";
import * as store from "../src/game/store.js";
import { startClock, stopClock, getClockState, getClockRemainingTimes } from "../src/game/clock.js";

function canBindLoopback(): boolean {
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      "const net=require('node:net');const s=net.createServer();s.once('error',()=>process.exit(1));s.listen(0,'127.0.0.1',()=>s.close(()=>process.exit(0)));",
    ],
    { stdio: "ignore" },
  );
  return probe.status === 0;
}

const socketDescribe = canBindLoopback() ? describe : describe.skip;

beforeAll(() => {
  ensureSchema();
});

function waitForEvent<K extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: K,
  timeoutMs = 5000,
): Promise<Parameters<ServerToClientEvents[K]>[0]> {
  return new Promise<Parameters<ServerToClientEvents[K]>[0]>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForConnect(socket: TypedClientSocket, timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error("Timed out waiting for connect")), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("startClock with remainingTimes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopClock(9001);
    vi.useRealTimers();
  });

  it("uses remainingTimes instead of initialTime when provided", () => {
    const onTick = vi.fn();
    const onTimeout = vi.fn();
    startClock(9001, { initialTime: 600, increment: 0 }, "white", onTick, onTimeout, {
      white: 123000,
      black: 456000,
    });
    const state = getClockState(9001);
    expect(state).not.toBeNull();
    expect(state!.white).toBe(123000);
    expect(state!.black).toBe(456000);
    expect(state!.activeColor).toBe("white");
  });

  it("uses initialTime * 1000 when remainingTimes is undefined", () => {
    const onTick = vi.fn();
    const onTimeout = vi.fn();
    startClock(9001, { initialTime: 300, increment: 0 }, "black", onTick, onTimeout);
    const state = getClockState(9001);
    expect(state).not.toBeNull();
    expect(state!.white).toBe(300000);
    expect(state!.black).toBe(300000);
  });
});

describe("getClockRemainingTimes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopClock(9002);
    vi.useRealTimers();
  });

  it("returns raw remaining times from in-memory clock", () => {
    const onTick = vi.fn();
    const onTimeout = vi.fn();
    startClock(9002, { initialTime: 600, increment: 0 }, "white", onTick, onTimeout);
    const times = getClockRemainingTimes(9002);
    expect(times).not.toBeNull();
    expect(times!.white).toBe(600000);
    expect(times!.black).toBe(600000);
  });

  it("returns null for non-existent clock", () => {
    expect(getClockRemainingTimes(99999)).toBeNull();
  });
});

socketDescribe("Clock persistence via socket", () => {
  let app: ReturnType<typeof buildApp>["app"];
  let io: TypedSocketServer;
  let port: number;
  const sockets: TypedClientSocket[] = [];

  beforeEach(async () => {
    ({ app, io } = buildApp());
    await app.listen({ host: "127.0.0.1", port: 0 });
    port = (app.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const s of sockets) {
      s.disconnect();
    }
    sockets.length = 0;
    io.close();
    await app.close();
  });

  async function setupGame(clockConfig?: { initialTime: number; increment: number }) {
    const emailA = uniqueEmail("clkp-a");
    const emailB = uniqueEmail("clkp-b");
    const { cookie: cookieA } = await registerAndLogin(app, emailA);
    const { cookie: cookieB } = await registerAndLogin(app, emailB);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: cookieA },
      payload: { clock: clockConfig ?? { initialTime: 60, increment: 0 } },
    });
    const { gameId, inviteToken, color: creatorColor } = createRes.json();

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: cookieB },
      payload: { inviteToken },
    });

    const socketA = createSocketClient(port, cookieA);
    const socketB = createSocketClient(port, cookieB);
    sockets.push(socketA, socketB);
    await Promise.all([waitForConnect(socketA), waitForConnect(socketB)]);

    const statePromiseA = waitForEvent(socketA, "gameState");
    const statePromiseB = waitForEvent(socketB, "gameState");
    socketA.emit("joinRoom", { gameId });
    socketB.emit("joinRoom", { gameId });
    await Promise.all([statePromiseA, statePromiseB]);

    const whiteSocket = creatorColor === "white" ? socketA : socketB;
    const blackSocket = creatorColor === "white" ? socketB : socketA;
    const whiteCookie = creatorColor === "white" ? cookieA : cookieB;
    const blackCookie = creatorColor === "white" ? cookieB : cookieA;

    return { gameId, whiteSocket, blackSocket, whiteCookie, blackCookie };
  }

  it("persists clock remaining times to DB after a move", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame();

    const beforeGame = store.getGame(gameId);
    expect(beforeGame).toBeDefined();
    expect(beforeGame!.clockWhiteRemaining).toBeNull();
    expect(beforeGame!.clockBlackRemaining).toBeNull();

    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    const afterGame = store.getGame(gameId);
    expect(afterGame).toBeDefined();
    expect(afterGame!.clockWhiteRemaining).not.toBeNull();
    expect(afterGame!.clockBlackRemaining).not.toBeNull();
    expect(afterGame!.clockWhiteRemaining!).toBeLessThan(60000);
    expect(afterGame!.clockWhiteRemaining!).toBeGreaterThan(50000);
    expect(afterGame!.clockBlackRemaining!).toBe(60000);
  });

  it("round-trip: persisted times survive in-memory clock removal", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame();

    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    const afterMove = store.getGame(gameId);
    const persistedWhite = afterMove!.clockWhiteRemaining!;
    const persistedBlack = afterMove!.clockBlackRemaining!;

    stopClock(gameId);
    expect(getClockState(gameId)).toBeNull();

    const reloaded = store.getGame(gameId);
    expect(reloaded!.clockWhiteRemaining).toBe(persistedWhite);
    expect(reloaded!.clockBlackRemaining).toBe(persistedBlack);
  });

  it("reconnecting player receives persisted clock times after in-memory clock is cleared", async () => {
    const { gameId, whiteSocket, blackSocket, whiteCookie } = await setupGame();

    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    const afterMove = store.getGame(gameId);
    const persistedWhite = afterMove!.clockWhiteRemaining!;
    const persistedBlack = afterMove!.clockBlackRemaining!;

    stopClock(gameId);

    whiteSocket.disconnect();
    blackSocket.disconnect();
    sockets.length = 0;

    const reconnSocket = createSocketClient(port, whiteCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    const reconStatePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    const reconState = await reconStatePromise;

    expect((reconState.clock as { white: number }).white).toBe(persistedWhite);
    expect((reconState.clock as { black: number }).black).toBe(persistedBlack);
  });

  it("resign persists clock remaining times to DB", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame();

    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    const afterMove = store.getGame(gameId);
    expect(afterMove!.clockWhiteRemaining).not.toBeNull();

    const gameOverW = waitForEvent(whiteSocket, "gameOver");
    const gameOverB = waitForEvent(blackSocket, "gameOver");
    whiteSocket.emit("resign", { gameId });
    await Promise.all([gameOverW, gameOverB]);

    const afterResign = store.getGame(gameId);
    expect(afterResign!.status).toBe("resigned");
    expect(afterResign!.clockWhiteRemaining).not.toBeNull();
    expect(afterResign!.clockBlackRemaining).not.toBeNull();
    expect(afterResign!.clockWhiteRemaining!).toBeLessThan(60000);
    expect(afterResign!.clockWhiteRemaining!).toBeGreaterThan(0);
    expect(afterResign!.clockBlackRemaining!).toBe(60000);
  });

  it("timeout persists clock remaining times to DB with timed-out player at 0", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame({
      initialTime: 1,
      increment: 0,
    });

    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    const gameOverW = waitForEvent(whiteSocket, "gameOver", 5000);
    const gameOverB = waitForEvent(blackSocket, "gameOver", 5000);
    await Promise.all([gameOverW, gameOverB]);

    const afterTimeout = store.getGame(gameId);
    expect(afterTimeout!.status).toBe("timeout");
    expect(afterTimeout!.clockWhiteRemaining).not.toBeNull();
    expect(afterTimeout!.clockBlackRemaining).not.toBeNull();
    expect(afterTimeout!.clockBlackRemaining!).toBe(0);
    expect(afterTimeout!.clockWhiteRemaining!).toBeGreaterThan(0);
    expect(afterTimeout!.clockWhiteRemaining!).toBeLessThanOrEqual(1000);
  });

  it("draw accepted persists clock remaining times to DB", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame();

    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    const drawOfferedW = waitForEvent(whiteSocket, "drawOffered");
    const drawOfferedB = waitForEvent(blackSocket, "drawOffered");
    whiteSocket.emit("offerDraw", { gameId });
    await Promise.all([drawOfferedW, drawOfferedB]);

    const gameOverW = waitForEvent(whiteSocket, "gameOver");
    const gameOverB = waitForEvent(blackSocket, "gameOver");
    blackSocket.emit("acceptDraw", { gameId });
    await Promise.all([gameOverW, gameOverB]);

    const afterDraw = store.getGame(gameId);
    expect(afterDraw!.status).toBe("draw");
    expect(afterDraw!.clockWhiteRemaining).not.toBeNull();
    expect(afterDraw!.clockBlackRemaining).not.toBeNull();
    expect(afterDraw!.clockWhiteRemaining!).toBeLessThan(60000);
    expect(afterDraw!.clockWhiteRemaining!).toBeGreaterThan(0);
    expect(afterDraw!.clockBlackRemaining!).toBe(60000);
  });
});
