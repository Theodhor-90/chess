import fp from "fastify-plugin";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { RegisterRequest, LoginRequest, AuthResponse, ErrorResponse } from "@chess/shared";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { createSession, destroySession } from "./session.js";
import { requireAuth } from "./plugin.js";

const SALT_ROUNDS = 10;

const authBodySchema = {
  type: "object" as const,
  required: ["email", "password"],
  properties: {
    email: { type: "string" as const, minLength: 1 },
    password: { type: "string" as const, minLength: 8 },
  },
};

function getCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    signed: true,
    secure: process.env.NODE_ENV === "production",
  };
}

async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post<{ Body: RegisterRequest; Reply: AuthResponse | ErrorResponse }>(
    "/api/auth/register",
    { schema: { body: authBodySchema } },
    async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      // Check email uniqueness
      const existing = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();

      if (existing) {
        return reply.code(409).send({ error: "Email already taken" });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      let insertedUser: { id: number; email: string };
      try {
        const result = db
          .insert(users)
          .values({ email, passwordHash })
          .returning({ id: users.id, email: users.email })
          .get();
        insertedUser = result;
      } catch (err: unknown) {
        // Handle race condition: unique constraint violation
        if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
          return reply.code(409).send({ error: "Email already taken" });
        }
        throw err;
      }

      const sessionId = createSession(insertedUser.id);
      reply.setCookie("sessionId", sessionId, getCookieOptions());

      return reply.code(201).send({ user: { id: insertedUser.id, email: insertedUser.email } });
    },
  );

  // POST /api/auth/login
  app.post<{ Body: LoginRequest; Reply: AuthResponse | ErrorResponse }>(
    "/api/auth/login",
    { schema: { body: authBodySchema } },
    async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      const user = db
        .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.email, email))
        .get();

      if (!user) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      const sessionId = createSession(user.id);
      reply.setCookie("sessionId", sessionId, getCookieOptions());

      return reply.code(200).send({ user: { id: user.id, email: user.email } });
    },
  );

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    const signedCookie = request.cookies.sessionId;
    if (signedCookie) {
      const unsigned = request.unsignCookie(signedCookie);
      if (unsigned.valid && unsigned.value) {
        destroySession(unsigned.value);
      }
    }

    reply.clearCookie("sessionId", getCookieOptions());

    return reply.code(200).send({ ok: true });
  });

  // GET /api/auth/me
  app.get<{ Reply: AuthResponse | ErrorResponse }>(
    "/api/auth/me",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, request.userId!))
        .get();

      if (!user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      return reply.code(200).send({ user: { id: user.id, email: user.email } });
    },
  );
}

export const authRoutesPlugin = fp(authRoutes, {
  name: "auth-routes",
  dependencies: ["authentication"],
});
