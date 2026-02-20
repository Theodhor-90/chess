import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { buildApp } from "../src/server.js";
import {
  ensureSchema,
  uniqueEmail,
  registerAndLogin,
  createAndJoinGame,
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

socketDescribe("Authentication", () => {
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

  it("rejects unauthenticated connection", async () => {
    const socket = createSocketClient(port, "");
    sockets.push(socket);

    const err = await new Promise<Error>((resolve) => {
      socket.on("connect_error", resolve);
    });

    expect(err.message).toBe("Authentication failed");
    expect(socket.connected).toBe(false);
  });

  it("rejects invalid cookie", async () => {
    const socket = createSocketClient(port, "sessionId=forged-invalid-value");
    sockets.push(socket);

    const err = await new Promise<Error>((resolve) => {
      socket.on("connect_error", resolve);
    });

    expect(err.message).toBe("Authentication failed");
    expect(socket.connected).toBe(false);
  });

  it("connects with valid session cookie", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("sock-auth-ok"));
    const socket = createSocketClient(port, cookie);
    sockets.push(socket);

    await waitForConnect(socket);

    expect(socket.connected).toBe(true);
  });
});

socketDescribe("Room management", () => {
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

  it("joinRoom emits gameState for a valid game", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("room-join-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("room-join-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket = createSocketClient(port, c1);
    sockets.push(socket);
    await waitForConnect(socket);

    const statePromise = waitForEvent(socket, "gameState");
    socket.emit("joinRoom", { gameId });
    const state = await statePromise;

    expect(state.id).toBe(gameId);
    expect(state.status).toBe("active");
    expect(state.fen).toBeDefined();
    expect(state.clock).toBeDefined();
    expect(state.clock.white).toBeGreaterThan(0);
    expect(state.clock.black).toBeGreaterThan(0);
    expect(state.clock.lastUpdate).toBeGreaterThan(0);
  });

  it("joinRoom emits error for non-existent game", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("room-missing"));
    const socket = createSocketClient(port, cookie);
    sockets.push(socket);
    await waitForConnect(socket);

    const errPromise = waitForEvent(socket, "error");
    socket.emit("joinRoom", { gameId: 999999 });
    const err = await errPromise;

    expect(err.message).toBe("Game not found");
  });

  it("joinRoom emits error for non-player", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("room-noplay-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("room-noplay-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("room-noplay-x"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket = createSocketClient(port, c3);
    sockets.push(socket);
    await waitForConnect(socket);

    const errPromise = waitForEvent(socket, "error");
    socket.emit("joinRoom", { gameId });
    const err = await errPromise;

    expect(err.message).toBe("You are not a player in this game");
  });

  it("leaveRoom stops receiving broadcasts", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("room-leave-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("room-leave-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");

    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    socket1.emit("leaveRoom", { gameId });
    await new Promise((r) => setTimeout(r, 100));

    let receivedGameOver = false;
    socket1.on("gameOver", () => {
      receivedGameOver = true;
    });

    socket2.emit("resign", { gameId });
    await waitForEvent(socket2, "gameOver");

    await new Promise((r) => setTimeout(r, 200));
    expect(receivedGameOver).toBe(false);
  });
});

socketDescribe("Move events", () => {
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

  it("valid move broadcasts moveMade to both players", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("move-ok-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("move-ok-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const whiteSocket = creatorColor === "white" ? socket1 : socket2;

    const s1move = waitForEvent(socket1, "moveMade");
    const s2move = waitForEvent(socket2, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 });

    const [m1, m2] = await Promise.all([s1move, s2move]);

    expect(m1.san).toBe("e4");
    expect(m1.status).toBe("active");
    expect(m1.fen).toBeDefined();
    expect(m1.pgn).toBeDefined();
    expect(m1.clock).toBeDefined();
    expect(m2.san).toBe("e4");
    expect(m2.status).toBe("active");
  });

  it("illegal move returns error only to sender", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("move-bad-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("move-bad-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const whiteSocket = creatorColor === "white" ? socket1 : socket2;
    const blackSocket = creatorColor === "white" ? socket2 : socket1;

    let opponentReceivedError = false;
    blackSocket.on("error", () => {
      opponentReceivedError = true;
    });

    const errPromise = waitForEvent(whiteSocket, "error");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e5", moveNumber: 0 });
    const err = await errPromise;

    expect(err.message).toBeDefined();
    await new Promise((r) => setTimeout(r, 200));
    expect(opponentReceivedError).toBe(false);
  });

  it("wrong turn returns error", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("move-turn-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("move-turn-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const blackSocket = creatorColor === "white" ? socket2 : socket1;

    const errPromise = waitForEvent(blackSocket, "error");
    blackSocket.emit("move", { gameId, from: "e7", to: "e5", moveNumber: 0 });
    const err = await errPromise;

    expect(err.message).toBe("It is not your turn");
  });

  it("checkmate triggers moveMade and gameOver", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("mate-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("mate-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const whiteSocket = creatorColor === "white" ? socket1 : socket2;
    const blackSocket = creatorColor === "white" ? socket2 : socket1;

    let moveNumber = 0;
    async function makeMove(mover: TypedClientSocket, from: string, to: string): Promise<void> {
      const p1 = waitForEvent(socket1, "moveMade");
      const p2 = waitForEvent(socket2, "moveMade");
      mover.emit("move", { gameId, from, to, moveNumber });
      await Promise.all([p1, p2]);
      moveNumber += 1;
    }

    await makeMove(whiteSocket, "e2", "e4");
    await makeMove(blackSocket, "e7", "e5");
    await makeMove(whiteSocket, "d1", "h5");
    await makeMove(blackSocket, "b8", "c6");
    await makeMove(whiteSocket, "f1", "c4");
    await makeMove(blackSocket, "g8", "f6");

    const moveP1 = waitForEvent(socket1, "moveMade");
    const moveP2 = waitForEvent(socket2, "moveMade");
    const overP1 = waitForEvent(socket1, "gameOver");
    const overP2 = waitForEvent(socket2, "gameOver");

    whiteSocket.emit("move", { gameId, from: "h5", to: "f7", moveNumber });

    const [m1, m2, o1, o2] = await Promise.all([moveP1, moveP2, overP1, overP2]);

    expect(m1.status).toBe("checkmate");
    expect(m1.san).toBe("Qxf7#");
    expect(m2.status).toBe("checkmate");

    expect(o1.status).toBe("checkmate");
    expect(o1.result).toEqual({ winner: "white", reason: "checkmate" });
    expect(o2.status).toBe("checkmate");
    expect(o2.result).toEqual({ winner: "white", reason: "checkmate" });
  });
});

socketDescribe("Resign", () => {
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

  it("resign broadcasts gameOver to both players", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("resign-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("resign-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const overP1 = waitForEvent(socket1, "gameOver");
    const overP2 = waitForEvent(socket2, "gameOver");
    socket1.emit("resign", { gameId });

    const [o1, o2] = await Promise.all([overP1, overP2]);

    expect(o1.status).toBe("resigned");
    expect(o1.result.reason).toBe("resigned");
    expect(o2.status).toBe("resigned");
    expect(o2.result.reason).toBe("resigned");
    const resignerColor = creatorColor;
    const winnerColor = resignerColor === "white" ? "black" : "white";
    expect(o1.result.winner).toBe(winnerColor);
  });
});

socketDescribe("Draw", () => {
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

  it("draw offer broadcasts drawOffered", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("draw-offer-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("draw-offer-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const drawP1 = waitForEvent(socket1, "drawOffered");
    const drawP2 = waitForEvent(socket2, "drawOffered");
    socket1.emit("offerDraw", { gameId });

    const [d1, d2] = await Promise.all([drawP1, drawP2]);

    expect(d1.by).toBe(creatorColor);
    expect(d2.by).toBe(creatorColor);
  });

  it("draw accept broadcasts gameOver", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("draw-accept-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("draw-accept-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const drawP1 = waitForEvent(socket1, "drawOffered");
    const drawP2 = waitForEvent(socket2, "drawOffered");
    socket1.emit("offerDraw", { gameId });
    await Promise.all([drawP1, drawP2]);

    const overP1 = waitForEvent(socket1, "gameOver");
    const overP2 = waitForEvent(socket2, "gameOver");
    socket2.emit("acceptDraw", { gameId });

    const [o1, o2] = await Promise.all([overP1, overP2]);

    expect(o1.status).toBe("draw");
    expect(o1.result).toEqual({ reason: "draw" });
    expect(o2.status).toBe("draw");
    expect(o2.result).toEqual({ reason: "draw" });
  });

  it("draw declined on move broadcasts drawDeclined then moveMade", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("draw-decline-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("draw-decline-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const whiteSocket = creatorColor === "white" ? socket1 : socket2;
    const blackSocket = creatorColor === "white" ? socket2 : socket1;

    const m1p = waitForEvent(socket1, "moveMade");
    const m2p = waitForEvent(socket2, "moveMade");
    whiteSocket.emit("move", { gameId, from: "e2", to: "e4", moveNumber: 0 });
    await Promise.all([m1p, m2p]);

    const drawP = waitForEvent(socket2, "drawOffered");
    whiteSocket.emit("offerDraw", { gameId });
    await drawP;

    const declineP1 = waitForEvent(socket1, "drawDeclined");
    const declineP2 = waitForEvent(socket2, "drawDeclined");
    const moveP1 = waitForEvent(socket1, "moveMade");
    const moveP2 = waitForEvent(socket2, "moveMade");
    blackSocket.emit("move", { gameId, from: "e7", to: "e5", moveNumber: 1 });

    const [, , mm1, mm2] = await Promise.all([declineP1, declineP2, moveP1, moveP2]);

    expect(mm1.san).toBe("e5");
    expect(mm2.san).toBe("e5");
  });
});

socketDescribe("Abort", () => {
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

  it("abort broadcasts gameOver", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("abort-c"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: c1 },
      payload: {},
    });
    const { gameId } = createRes.json();

    const socket1 = createSocketClient(port, c1);
    sockets.push(socket1);
    await waitForConnect(socket1);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");

    const overP = waitForEvent(socket1, "gameOver");
    socket1.emit("abort", { gameId });
    const result = await overP;

    expect(result.status).toBe("aborted");
    expect(result.result.reason).toBe("aborted");
  });
});

socketDescribe("Disconnect notifications", () => {
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

  it("opponent disconnect sends opponentDisconnected", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("dc-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("dc-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const dcPromise = waitForEvent(socket1, "opponentDisconnected");
    socket2.disconnect();

    await dcPromise;
  });

  it("opponent reconnect sends opponentReconnected", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("rc-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("rc-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket1 = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1, socket2);
    await Promise.all([waitForConnect(socket1), waitForConnect(socket2)]);

    socket1.emit("joinRoom", { gameId });
    await waitForEvent(socket1, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const dcPromise = waitForEvent(socket1, "opponentDisconnected");
    socket2.disconnect();
    await dcPromise;

    const socket2b = createSocketClient(port, c2);
    sockets.push(socket2b);
    await waitForConnect(socket2b);

    const rcPromise = waitForEvent(socket1, "opponentReconnected");
    socket2b.emit("joinRoom", { gameId });
    await waitForEvent(socket2b, "gameState");
    await rcPromise;
  });
});

socketDescribe("Multi-tab", () => {
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

  it("multiple sockets from same user both receive events", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("multi-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("multi-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket1a = createSocketClient(port, c1);
    const socket1b = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1a, socket1b, socket2);
    await Promise.all([
      waitForConnect(socket1a),
      waitForConnect(socket1b),
      waitForConnect(socket2),
    ]);

    socket1a.emit("joinRoom", { gameId });
    await waitForEvent(socket1a, "gameState");
    socket1b.emit("joinRoom", { gameId });
    await waitForEvent(socket1b, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    const overPa = waitForEvent(socket1a, "gameOver");
    const overPb = waitForEvent(socket1b, "gameOver");
    const overP2 = waitForEvent(socket2, "gameOver");
    socket2.emit("resign", { gameId });

    const [oa, ob, o2] = await Promise.all([overPa, overPb, overP2]);

    expect(oa.status).toBe("resigned");
    expect(ob.status).toBe("resigned");
    expect(o2.status).toBe("resigned");
  });

  it("disconnecting one tab does not send opponentDisconnected if other tab is in room", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("multitab-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("multitab-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const socket1a = createSocketClient(port, c1);
    const socket1b = createSocketClient(port, c1);
    const socket2 = createSocketClient(port, c2);
    sockets.push(socket1a, socket1b, socket2);
    await Promise.all([
      waitForConnect(socket1a),
      waitForConnect(socket1b),
      waitForConnect(socket2),
    ]);

    socket1a.emit("joinRoom", { gameId });
    await waitForEvent(socket1a, "gameState");
    socket1b.emit("joinRoom", { gameId });
    await waitForEvent(socket1b, "gameState");
    socket2.emit("joinRoom", { gameId });
    await waitForEvent(socket2, "gameState");

    let receivedDisconnect = false;
    socket2.on("opponentDisconnected", () => {
      receivedDisconnect = true;
    });

    socket1a.disconnect();

    await new Promise((r) => setTimeout(r, 500));

    expect(receivedDisconnect).toBe(false);
  });
});
