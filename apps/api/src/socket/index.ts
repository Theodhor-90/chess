import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import fastifyCookie from "@fastify/cookie";
import type { ClientToServerEvents, ServerToClientEvents, ServerSocketData } from "@chess/shared";
import { getSession } from "../auth/session.js";
import { addConnection, removeConnection, getUserSockets } from "./connections.js";
import { registerGameHandlers } from "./handlers.js";

type CookieUtils = {
  parse: (cookieHeader: string) => Record<string, string>;
  unsign: (
    input: string,
    secret: string | Buffer,
  ) => {
    valid: boolean;
    value: string | null;
  };
};

const cookieUtils = fastifyCookie as unknown as CookieUtils;

export type TypedSocketServer = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  ServerSocketData
>;

export function setupSocketServer(httpServer: HttpServer, cookieSecret: string): TypedSocketServer {
  const io: TypedSocketServer = new SocketServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return next(new Error("Authentication failed"));
    }

    const cookies = cookieUtils.parse(cookieHeader);
    const signedSessionId = cookies.sessionId;
    if (!signedSessionId) {
      return next(new Error("Authentication failed"));
    }

    const unsigned = cookieUtils.unsign(signedSessionId, cookieSecret);
    if (!unsigned.valid || !unsigned.value) {
      return next(new Error("Authentication failed"));
    }

    const session = getSession(unsigned.value);
    if (!session) {
      return next(new Error("Authentication failed"));
    }

    socket.data.userId = session.userId;
    socket.data.rtt = 0;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    addConnection(userId, socket.id);

    registerGameHandlers(io, socket);

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (!room.startsWith("game:")) continue;
        const userSockets = getUserSockets(userId);
        let hasOtherSocketInRoom = false;
        if (userSockets) {
          for (const sid of userSockets) {
            if (sid === socket.id) continue;
            const roomMembers = io.sockets.adapter.rooms.get(room);
            if (roomMembers && roomMembers.has(sid)) {
              hasOtherSocketInRoom = true;
              break;
            }
          }
        }
        if (!hasOtherSocketInRoom) {
          socket.to(room).emit("opponentDisconnected", {});
        }
      }
    });

    socket.on("disconnect", () => {
      removeConnection(userId, socket.id);
    });
  });

  return io;
}
