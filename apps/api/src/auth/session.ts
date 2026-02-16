import { randomUUID } from "node:crypto";

interface SessionData {
  userId: number;
}

const sessions = new Map<string, SessionData>();

export function createSession(userId: number): string {
  const sessionId = randomUUID();
  sessions.set(sessionId, { userId });
  return sessionId;
}

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}
