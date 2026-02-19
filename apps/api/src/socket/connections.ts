const userSockets = new Map<number, Set<string>>();

export function addConnection(userId: number, socketId: string): void {
  let sockets = userSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    userSockets.set(userId, sockets);
  }
  sockets.add(socketId);
}

export function removeConnection(userId: number, socketId: string): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
}

export function getUserSockets(userId: number): Set<string> | undefined {
  return userSockets.get(userId);
}

export function isUserConnected(userId: number): boolean {
  const sockets = userSockets.get(userId);
  return sockets !== undefined && sockets.size > 0;
}
