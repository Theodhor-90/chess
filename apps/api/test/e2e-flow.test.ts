import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { buildApp } from "../src/server.js";
import {
  ensureUsersTable,
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

const e2eDescribe = canBindLoopback() ? describe : describe.skip;

beforeAll(() => {
  ensureUsersTable();
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

e2eDescribe(
  "End-to-end flow: register → login → create → resolve → join → play → checkmate",
  () => {
    let app: ReturnType<typeof buildApp>["app"];
    let io: TypedSocketServer;
    let port: number;
    const sockets: TypedClientSocket[] = [];

    afterEach(async () => {
      for (const s of sockets) {
        s.disconnect();
      }
      sockets.length = 0;
      io.close();
      await app.close();
    });

    it("full game lifecycle via HTTP + Socket.io", async () => {
      // --- Setup ---
      ({ app, io } = buildApp());
      await app.listen({ host: "127.0.0.1", port: 0 });
      port = (app.server.address() as AddressInfo).port;

      // --- Step 1: Register user A and user B ---
      const { cookie: cookieA, userId: userIdA } = await registerAndLogin(
        app,
        uniqueEmail("e2e-user-a"),
      );
      const { cookie: cookieB, userId: userIdB } = await registerAndLogin(
        app,
        uniqueEmail("e2e-user-b"),
      );
      expect(userIdA).toBeGreaterThan(0);
      expect(userIdB).toBeGreaterThan(0);
      expect(userIdA).not.toBe(userIdB);

      // --- Step 2: User A creates a game ---
      const createRes = await app.inject({
        method: "POST",
        url: "/api/games",
        headers: { cookie: cookieA },
        payload: { clock: { initialTime: 600, increment: 0 } },
      });
      expect(createRes.statusCode).toBe(201);
      const { gameId, inviteToken, color: creatorColor } = createRes.json();
      expect(gameId).toBeGreaterThan(0);
      expect(inviteToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(["white", "black"]).toContain(creatorColor);

      // --- Step 3: Resolve invite token ---
      const resolveRes = await app.inject({
        method: "GET",
        url: `/api/games/resolve/${inviteToken}`,
      });
      expect(resolveRes.statusCode).toBe(200);
      expect(resolveRes.json()).toEqual({ gameId, status: "waiting" });

      // --- Step 4: User B joins the game ---
      const joinRes = await app.inject({
        method: "POST",
        url: `/api/games/${gameId}/join`,
        headers: { cookie: cookieB },
        payload: { inviteToken },
      });
      expect(joinRes.statusCode).toBe(200);
      expect(joinRes.json().status).toBe("active");
      expect(joinRes.json().players.white).toBeDefined();
      expect(joinRes.json().players.black).toBeDefined();

      // --- Step 5: Both connect via Socket.io ---
      const socketA = createSocketClient(port, cookieA);
      const socketB = createSocketClient(port, cookieB);
      sockets.push(socketA, socketB);
      await Promise.all([waitForConnect(socketA), waitForConnect(socketB)]);

      // --- Step 6: Both join the game room ---
      socketA.emit("joinRoom", { gameId });
      const stateA = await waitForEvent(socketA, "gameState");
      expect(stateA.id).toBe(gameId);
      expect(stateA.status).toBe("active");

      socketB.emit("joinRoom", { gameId });
      const stateB = await waitForEvent(socketB, "gameState");
      expect(stateB.id).toBe(gameId);
      expect(stateB.status).toBe("active");

      // --- Step 7: Play Scholar's mate ---
      const whiteSocket = creatorColor === "white" ? socketA : socketB;
      const blackSocket = creatorColor === "white" ? socketB : socketA;

      async function makeMove(
        mover: TypedClientSocket,
        from: string,
        to: string,
      ): Promise<Parameters<ServerToClientEvents["moveMade"]>[0]> {
        const p1 = waitForEvent(socketA, "moveMade");
        const p2 = waitForEvent(socketB, "moveMade");
        mover.emit("move", { gameId, from, to });
        const [m1] = await Promise.all([p1, p2]);
        return m1;
      }

      // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7#
      const m1 = await makeMove(whiteSocket, "e2", "e4");
      expect(m1.san).toBe("e4");
      expect(m1.status).toBe("active");

      await makeMove(blackSocket, "e7", "e5");
      await makeMove(whiteSocket, "d1", "h5");
      await makeMove(blackSocket, "b8", "c6");
      await makeMove(whiteSocket, "f1", "c4");
      await makeMove(blackSocket, "g8", "f6");

      // --- Step 8: Checkmate move ---
      const mateP1 = waitForEvent(socketA, "moveMade");
      const mateP2 = waitForEvent(socketB, "moveMade");
      const overP1 = waitForEvent(socketA, "gameOver");
      const overP2 = waitForEvent(socketB, "gameOver");

      whiteSocket.emit("move", { gameId, from: "h5", to: "f7" });

      const [mateM1, mateM2, over1, over2] = await Promise.all([mateP1, mateP2, overP1, overP2]);

      // --- Step 9: Verify moveMade events ---
      expect(mateM1.san).toBe("Qxf7#");
      expect(mateM1.status).toBe("checkmate");
      expect(mateM2.san).toBe("Qxf7#");
      expect(mateM2.status).toBe("checkmate");

      // --- Step 10: Verify gameOver events ---
      expect(over1.status).toBe("checkmate");
      expect(over1.result).toEqual({ winner: "white", reason: "checkmate" });
      expect(over2.status).toBe("checkmate");
      expect(over2.result).toEqual({ winner: "white", reason: "checkmate" });

      // --- Step 11: Verify final game state via HTTP ---
      const whiteCookie = creatorColor === "white" ? cookieA : cookieB;
      const finalRes = await app.inject({
        method: "GET",
        url: `/api/games/${gameId}`,
        headers: { cookie: whiteCookie },
      });
      expect(finalRes.statusCode).toBe(200);
      const finalState = finalRes.json();
      expect(finalState.status).toBe("checkmate");
      expect(finalState.result).toEqual({ winner: "white", reason: "checkmate" });
      expect(finalState.pgn).toContain("Qxf7#");
      expect(finalState.moves).toHaveLength(7);

      // --- Step 12: Verify resolve still works for completed game ---
      const resolveAfter = await app.inject({
        method: "GET",
        url: `/api/games/resolve/${inviteToken}`,
      });
      expect(resolveAfter.statusCode).toBe(200);
      expect(resolveAfter.json().status).toBe("checkmate");

      // --- Step 13: Verify game appears in user's game list ---
      const listRes = await app.inject({
        method: "GET",
        url: "/api/games",
        headers: { cookie: cookieA },
      });
      expect(listRes.statusCode).toBe(200);
      const games = listRes.json();
      const ourGame = games.find((g: { id: number }) => g.id === gameId);
      expect(ourGame).toBeDefined();
      expect(ourGame.status).toBe("checkmate");
    });
  },
);
