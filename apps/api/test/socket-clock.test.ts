import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
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

function collectEvents<K extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: K,
  count: number,
  timeoutMs = 10000,
): Promise<Array<Parameters<ServerToClientEvents[K]>[0]>> {
  return new Promise((resolve, reject) => {
    const results: Array<Parameters<ServerToClientEvents[K]>[0]> = [];
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Timed out collecting ${count} "${event}" events (got ${results.length})`),
        ),
      timeoutMs,
    );
    socket.on(event, (data) => {
      results.push(data);
      if (results.length >= count) {
        clearTimeout(timer);
        socket.off(event);
        resolve(results);
      }
    });
  });
}

socketDescribe("Socket.io + Clock integration", () => {
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
    const emailA = uniqueEmail("clock-a");
    const emailB = uniqueEmail("clock-b");
    const { cookie: cookieA } = await registerAndLogin(app, emailA);
    const { cookie: cookieB } = await registerAndLogin(app, emailB);

    // Create game with custom clock
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: cookieA },
      payload: clockConfig ? { clock: clockConfig } : {},
    });
    const { gameId, inviteToken, color: creatorColor } = createRes.json();

    // Join game
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: cookieB },
      payload: { inviteToken },
    });

    // Connect sockets
    const socketA = createSocketClient(port, cookieA);
    const socketB = createSocketClient(port, cookieB);
    sockets.push(socketA, socketB);
    await Promise.all([waitForConnect(socketA), waitForConnect(socketB)]);

    // Join room — both receive gameState
    const statePromiseA = waitForEvent(socketA, "gameState");
    const statePromiseB = waitForEvent(socketB, "gameState");
    socketA.emit("joinRoom", { gameId });
    socketB.emit("joinRoom", { gameId });
    const [stateA] = await Promise.all([statePromiseA, statePromiseB]);

    // Determine who is white and who is black
    const whiteSocket = creatorColor === "white" ? socketA : socketB;
    const blackSocket = creatorColor === "white" ? socketB : socketA;

    return { gameId, whiteSocket, blackSocket, initialState: stateA };
  }

  it("moveMade events include ClockState with updated times", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame({
      initialTime: 60,
      increment: 0,
    });

    // White makes a move — e2e4
    const moveMadePromiseW = waitForEvent(whiteSocket, "moveMade");
    const moveMadePromiseB = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });

    const [moveDataW, moveDataB] = await Promise.all([moveMadePromiseW, moveMadePromiseB]);

    // Both players receive the same moveMade event with clock data
    expect(moveDataW.fen).toBeDefined();
    expect(moveDataW.san).toBe("e4");
    expect(moveDataW.clock).toBeDefined();
    expect(moveDataW.clock.white).toBeLessThanOrEqual(60000);
    expect(moveDataW.clock.black).toBe(60000); // Black hasn't moved yet
    expect(moveDataW.clock.activeColor).toBe("black"); // Now black's turn

    expect(moveDataB.clock).toBeDefined();
    expect(moveDataB.clock.activeColor).toBe("black");
  });

  it("moving player's time decreases while opponent stays the same", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame({
      initialTime: 60,
      increment: 2,
    });

    // White plays e4
    const movePromise1 = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    const move1 = await movePromise1;

    // White's time should be less than initial + increment (deduction is at least 100ms)
    // Formula: 60000 - deduction(>=100ms) + 2000(increment) <= 61900
    expect(move1.clock.white).toBeLessThanOrEqual(61900);
    // White's time should be more than initial (since increment > minimum deduction)
    expect(move1.clock.white).toBeGreaterThan(59000);
    // Black hasn't moved, stays at initial
    expect(move1.clock.black).toBe(60000);

    // Black plays e5
    const movePromise2 = waitForEvent(whiteSocket, "moveMade");
    blackSocket.emit("move", { gameId, from: "e7", to: "e5" });
    const move2 = await movePromise2;

    // Black's time should now be less than initial (minus at least 100ms) + increment
    expect(move2.clock.black).toBeLessThanOrEqual(62000);
    // White's time should be unchanged from last move
    expect(move2.clock.white).toBe(move1.clock.white);
    // Active color should now be white
    expect(move2.clock.activeColor).toBe("white");
  });

  it("clockUpdate events are received approximately every 1 second", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame({
      initialTime: 60,
      increment: 0,
    });

    // White makes a move to start the clock ticking for black
    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    // Collect 2 clockUpdate events (should arrive ~1s apart)
    const updates = await collectEvents(blackSocket, "clockUpdate", 2, 5000);

    expect(updates).toHaveLength(2);
    // Both updates should have activeColor as "black" (black's turn)
    expect(updates[0].activeColor).toBe("black");
    expect(updates[1].activeColor).toBe("black");
    // Black's time should decrease between updates
    expect(updates[1].black).toBeLessThan(updates[0].black);
  });

  it("timeout: short clock expires and emits gameOver with timeout status", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame({
      initialTime: 1, // 1 second total
      increment: 0,
    });

    // White makes a move — now black has ~1s on clock
    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4" });
    await movePromise;

    // Wait for gameOver event (black's clock should expire in ~1 second)
    const gameOverW = waitForEvent(whiteSocket, "gameOver", 5000);
    const gameOverB = waitForEvent(blackSocket, "gameOver", 5000);

    const [overW, overB] = await Promise.all([gameOverW, gameOverB]);

    // Both players receive timeout
    expect(overW.status).toBe("timeout");
    expect(overW.result.winner).toBe("white");
    expect(overW.result.reason).toBe("timeout");
    expect(overW.clock.black).toBe(0);

    expect(overB.status).toBe("timeout");
    expect(overB.result.winner).toBe("white");
  });
});
