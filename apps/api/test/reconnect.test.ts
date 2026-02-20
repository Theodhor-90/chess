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

    expect(state.fen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
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

    expect(state.fen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
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
});
