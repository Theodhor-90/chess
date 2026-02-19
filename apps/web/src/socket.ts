import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@chess/shared";

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function connectSocket(): TypedSocket {
  if (socket) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }
  socket = io(window.location.origin, {
    withCredentials: true,
  }) as TypedSocket;
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): TypedSocket | null {
  return socket;
}
