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
import * as store from "../src/game/store.js";
import { stopClock, getClockState } from "../src/game/clock.js";

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

socketDescribe("Reconnection scenarios", () => {
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

  async function setupGame() {
    const emailA = uniqueEmail("reconn-a");
    const emailB = uniqueEmail("reconn-b");
    const { cookie: cookieA } = await registerAndLogin(app, emailA);
    const { cookie: cookieB } = await registerAndLogin(app, emailB);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: cookieA },
      payload: { clock: { initialTime: 60, increment: 0 } },
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

  async function makeMove(
    moverSocket: TypedClientSocket,
    otherSocket: TypedClientSocket,
    gameId: number,
    from: string,
    to: string,
    moveNumber: number,
  ): Promise<void> {
    const p1 = waitForEvent(moverSocket, "moveMade");
    const p2 = waitForEvent(otherSocket, "moveMade");
    moverSocket.emit("move", { gameId, from, to, moveNumber });
    await Promise.all([p1, p2]);
  }

  it("reconnecting player re-joins room and receives correct gameState", async () => {
    const { gameId, whiteSocket, blackSocket, whiteCookie } = await setupGame();

    const movePromise = waitForEvent(blackSocket, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 });
    await movePromise;

    whiteSocket.disconnect();
    const whiteIdx = sockets.indexOf(whiteSocket);
    if (whiteIdx >= 0) sockets.splice(whiteIdx, 1);

    const reconnSocket = createSocketClient(port, whiteCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    const state = await statePromise;

    expect(state.fen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    expect(state.status).toBe("active");
  });

  it("move made while player B disconnected is reflected when B re-joins", async () => {
    const { gameId, whiteSocket, blackSocket, blackCookie } = await setupGame();

    blackSocket.disconnect();
    const blackIdx = sockets.indexOf(blackSocket);
    if (blackIdx >= 0) sockets.splice(blackIdx, 1);

    whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const reconnSocket = createSocketClient(port, blackCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    const state = await statePromise;

    expect(state.fen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    expect(state.moves).toContain("e4");
  });

  it("opponent receives opponentReconnected when reconnecting player re-joins room", async () => {
    const { gameId, whiteSocket, blackSocket, whiteCookie } = await setupGame();

    const disconnectedPromise = waitForEvent(blackSocket, "opponentDisconnected");
    whiteSocket.disconnect();
    const whiteIdx = sockets.indexOf(whiteSocket);
    if (whiteIdx >= 0) sockets.splice(whiteIdx, 1);

    await disconnectedPromise;

    const reconnSocket = createSocketClient(port, whiteCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    const reconnectedPromise = waitForEvent(blackSocket, "opponentReconnected");

    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    await statePromise;

    const reconnectedData = await reconnectedPromise;
    expect(reconnectedData).toBeDefined();
  });

  it("valid move with correct moveNumber acks ok and broadcasts moveMade", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame();

    const movePromiseW = waitForEvent(whiteSocket, "moveMade");
    const movePromiseB = waitForEvent(blackSocket, "moveMade");
    const ackPromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 }, resolve);
    });

    const [moveW, moveB, ack] = await Promise.all([movePromiseW, movePromiseB, ackPromise]);

    expect(ack).toEqual({ ok: true });
    expect(moveW.san).toBe("e4");
    expect(moveB.san).toBe("e4");
  });

  it("duplicate move returns duplicate ack and does not broadcast moveMade", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame();

    const firstMovePromiseB = waitForEvent(blackSocket, "moveMade");
    const firstAck = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 }, resolve);
    });
    await Promise.all([firstMovePromiseB, firstAck]);

    let receivedMoveMade = false;
    blackSocket.on("moveMade", () => {
      receivedMoveMade = true;
    });

    const duplicateAck = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 }, resolve);
    });

    expect(duplicateAck).toEqual({ ok: false, error: "duplicate" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receivedMoveMade).toBe(false);
  });

  it("out-of-sync move returns ack error", async () => {
    const { gameId, whiteSocket } = await setupGame();

    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 1 }, resolve);
    });

    expect(ack).toEqual({ ok: false, error: "Move out of sync" });
  });

  it("two rapid identical moves only apply once", async () => {
    const { gameId, whiteSocket, blackSocket } = await setupGame();

    let moveMadeCount = 0;
    blackSocket.on("moveMade", () => {
      moveMadeCount += 1;
    });

    const ackOnePromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 }, resolve);
    });
    const ackTwoPromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 }, resolve);
    });

    const [ackOne, ackTwo] = await Promise.all([ackOnePromise, ackTwoPromise]);

    expect([ackOne, ackTwo]).toContainEqual({ ok: true });
    expect([ackOne, ackTwo]).toContainEqual({ ok: false, error: "duplicate" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(moveMadeCount).toBe(1);
  });

  it("Scenario 1: full reconnect — player B disconnects, A moves, B reconnects and receives updated state", async () => {
    const { gameId, whiteSocket, blackSocket, blackCookie } = await setupGame();

    // Both players make some initial moves
    await makeMove(whiteSocket, blackSocket, gameId, "e2", "e4", 0);
    await makeMove(blackSocket, whiteSocket, gameId, "e7", "e5", 1);

    // Player B (black) disconnects
    blackSocket.disconnect();
    const blackIdx = sockets.indexOf(blackSocket);
    if (blackIdx >= 0) sockets.splice(blackIdx, 1);

    // Player A (white) makes a move while B is disconnected
    // Since black is disconnected, we can't wait for moveMade on blackSocket.
    // Instead, use an ack callback to confirm the move was accepted.
    const ackPromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "d2", to: "d4", moveNumber: 2 }, resolve);
    });
    const ack = await ackPromise;
    expect(ack.ok).toBe(true);

    // Player B reconnects with a new socket
    const reconnSocket = createSocketClient(port, blackCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    // B re-joins the room
    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    const state = await statePromise;

    // B should see the updated FEN that includes white's d4 move
    // After 1.e4 e5 2.d4, the FEN is:
    expect(state.fen).toBe("rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2");
    expect(state.status).toBe("active");
    expect(state.moves).toContain("e4");
    expect(state.moves).toContain("e5");
    expect(state.moves).toContain("d4");
    expect(state.moves).toHaveLength(3);

    // Verify clock state is included and reasonable
    const clock = state.clock as { white: number; black: number; activeColor: string | null };
    expect(clock.white).toBeGreaterThan(0);
    expect(clock.black).toBeGreaterThan(0);
    expect(clock.activeColor).toBe("black");
  });

  it("Scenario 2: clock accuracy — after 3 moves, disconnect and reconnect, clock values match persisted", async () => {
    const { gameId, whiteSocket, blackSocket, blackCookie } = await setupGame();

    // Play 3 moves (clock switches 3 times)
    await makeMove(whiteSocket, blackSocket, gameId, "e2", "e4", 0);
    await makeMove(blackSocket, whiteSocket, gameId, "e7", "e5", 1);
    await makeMove(whiteSocket, blackSocket, gameId, "d2", "d4", 2);

    // Read persisted clock values from DB
    const gameAfterMoves = store.getGame(gameId);
    expect(gameAfterMoves).toBeDefined();
    const persistedWhite = gameAfterMoves!.clockWhiteRemaining;
    const persistedBlack = gameAfterMoves!.clockBlackRemaining;
    expect(persistedWhite).not.toBeNull();
    expect(persistedBlack).not.toBeNull();

    // Player B disconnects
    blackSocket.disconnect();
    const blackIdx = sockets.indexOf(blackSocket);
    if (blackIdx >= 0) sockets.splice(blackIdx, 1);

    // Player B reconnects
    const reconnSocket = createSocketClient(port, blackCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    const state = await statePromise;

    // Verify clock state matches persisted values within tolerance
    // The in-memory clock is still running (not cleared), so values may have drifted
    // slightly from the persisted snapshot. Allow 200ms tolerance.
    const clock = state.clock as { white: number; black: number };
    expect(clock.white).toBeGreaterThan(0);
    expect(clock.black).toBeGreaterThan(0);
    // White made 2 moves, black made 1. Both should have less than 60000ms.
    expect(clock.white).toBeLessThan(60000);
    expect(clock.black).toBeLessThan(60000);
    // Values should be close to persisted values (within 500ms for test timing margin)
    expect(Math.abs(clock.white - persistedWhite!)).toBeLessThan(500);
    expect(Math.abs(clock.black - persistedBlack!)).toBeLessThan(500);
  });

  it("Scenario 3: server restart simulation — in-memory clock cleared, reconnect uses persisted times", async () => {
    const { gameId, whiteSocket, blackSocket, whiteCookie } = await setupGame();

    // Play several moves
    await makeMove(whiteSocket, blackSocket, gameId, "e2", "e4", 0);
    await makeMove(blackSocket, whiteSocket, gameId, "e7", "e5", 1);
    await makeMove(whiteSocket, blackSocket, gameId, "d2", "d4", 2);

    // Read persisted clock values from the database
    const gameFromDb = store.getGame(gameId);
    expect(gameFromDb).toBeDefined();
    const persistedWhite = gameFromDb!.clockWhiteRemaining!;
    const persistedBlack = gameFromDb!.clockBlackRemaining!;
    expect(persistedWhite).toBeGreaterThan(0);
    expect(persistedBlack).toBeGreaterThan(0);
    expect(persistedWhite).toBeLessThan(60000);

    // Simulate server restart: clear the in-memory clock
    stopClock(gameId);
    expect(getClockState(gameId)).toBeNull();

    // Disconnect all sockets
    whiteSocket.disconnect();
    blackSocket.disconnect();
    const whiteIdx = sockets.indexOf(whiteSocket);
    if (whiteIdx >= 0) sockets.splice(whiteIdx, 1);
    const blackIdx = sockets.indexOf(blackSocket);
    if (blackIdx >= 0) sockets.splice(blackIdx, 1);

    // Player reconnects with a new socket
    const reconnSocket = createSocketClient(port, whiteCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    const state = await statePromise;

    // Verify the server started a new clock using persisted remaining times
    const clock = state.clock as { white: number; black: number; activeColor: string | null };

    // Clock should NOT be the initial 60000ms — it should match persisted values
    expect(clock.white).toBeLessThan(60000);
    expect(clock.black).toBeLessThan(60000);

    // Values should match persisted times closely (within 200ms since a new clock was just started)
    expect(Math.abs(clock.white - persistedWhite)).toBeLessThan(200);
    expect(Math.abs(clock.black - persistedBlack)).toBeLessThan(200);

    // Clock should be active (game was active, joinRoom restarts clock)
    expect(clock.activeColor).toBe("black"); // It's black's turn after 3 moves
  });

  it("Scenario 4: duplicate move after reconnect — same moveNumber is rejected as duplicate", async () => {
    const { gameId, whiteSocket, blackSocket, whiteCookie } = await setupGame();

    // Player A sends move with correct moveNumber, receives ok ack
    const movePromise = waitForEvent(blackSocket, "moveMade");
    const firstAck = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 }, resolve);
    });
    await movePromise;
    expect(firstAck.ok).toBe(true);

    // Player A disconnects
    whiteSocket.disconnect();
    const whiteIdx = sockets.indexOf(whiteSocket);
    if (whiteIdx >= 0) sockets.splice(whiteIdx, 1);

    // Track if black receives any additional moveMade events
    let extraMoveMadeCount = 0;
    blackSocket.on("moveMade", () => {
      extraMoveMadeCount++;
    });

    // Player A reconnects with a new socket
    const reconnSocket = createSocketClient(port, whiteCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    // Re-join the room
    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    await statePromise;

    // Player A re-sends the same move with the same moveNumber (simulating retry)
    const duplicateAck = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      reconnSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 }, resolve);
    });

    // Verify ack is duplicate rejection
    expect(duplicateAck.ok).toBe(false);
    expect(duplicateAck.error).toBe("duplicate");

    // Verify no second moveMade event is broadcast
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(extraMoveMadeCount).toBe(0);
  });

  it("Scenario 5: opponent disconnect/reconnect visibility — A sees B disconnect and reconnect", async () => {
    const { gameId, whiteSocket, blackSocket, blackCookie } = await setupGame();

    // Player B disconnects → Player A receives opponentDisconnected
    const disconnectedPromise = waitForEvent(whiteSocket, "opponentDisconnected");
    blackSocket.disconnect();
    const blackIdx = sockets.indexOf(blackSocket);
    if (blackIdx >= 0) sockets.splice(blackIdx, 1);

    const disconnectedData = await disconnectedPromise;
    expect(disconnectedData).toBeDefined();

    // Player B reconnects with a new socket and re-joins
    const reconnSocket = createSocketClient(port, blackCookie);
    sockets.push(reconnSocket);
    await waitForConnect(reconnSocket);

    const reconnectedPromise = waitForEvent(whiteSocket, "opponentReconnected");
    const statePromise = waitForEvent(reconnSocket, "gameState");
    reconnSocket.emit("joinRoom", { gameId });
    await statePromise;

    // Player A receives opponentReconnected
    const reconnectedData = await reconnectedPromise;
    expect(reconnectedData).toBeDefined();
  });
});
