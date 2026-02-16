import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSession } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: number | null;
  }
}

async function authPlugin(app: FastifyInstance) {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  await app.register(cookie, {
    secret: secret ?? "dev-fallback-secret-not-for-production",
    parseOptions: {},
  });

  app.decorateRequest("userId", null);

  app.addHook("onRequest", async (request: FastifyRequest) => {
    const signedCookie = request.cookies.sessionId;
    if (!signedCookie) {
      request.userId = null;
      return;
    }

    const unsigned = request.unsignCookie(signedCookie);
    if (!unsigned.valid || !unsigned.value) {
      request.userId = null;
      return;
    }

    const session = getSession(unsigned.value);
    request.userId = session?.userId ?? null;
  });
}

export const authenticationPlugin = fp(authPlugin, {
  name: "authentication",
});

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (request.userId === null) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}
