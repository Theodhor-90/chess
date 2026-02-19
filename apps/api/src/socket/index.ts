import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import fastifyCookie from "@fastify/cookie";
import type { ClientToServerEvents, ServerToClientEvents, ServerSocketData } from "@chess/shared";
import { getSession } from "../auth/session.js";
import { addConnection, removeConnection } from "./connections.js";

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

    // Event handlers registered by t03

    socket.on("disconnect", () => {
      removeConnection(userId, socket.id);
      // Room disconnect notifications implemented in t03
    });
  });

  return io;
}
