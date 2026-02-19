import Fastify from "fastify";
import type { HealthResponse } from "@chess/shared";
import { db } from "./db/index.js";
import { sql } from "drizzle-orm";
import { authenticationPlugin } from "./auth/plugin.js";
import { authRoutesPlugin } from "./auth/routes.js";
import { gameRoutesPlugin } from "./game/routes.js";
import { setupSocketServer, type TypedSocketServer } from "./socket/index.js";

const COOKIE_SECRET = process.env.SESSION_SECRET ?? "dev-fallback-secret-not-for-production";

export function buildApp(): { app: ReturnType<typeof Fastify>; io: TypedSocketServer } {
  const app = Fastify({ logger: false });

  app.register(authenticationPlugin);
  app.register(authRoutesPlugin);
  app.register(gameRoutesPlugin, { prefix: "/api/games" });

  app.get<{ Reply: HealthResponse }>("/health", async (_req, reply) => {
    db.run(sql`SELECT 1`);
    return reply.send({ status: "ok" });
  });

  const io = setupSocketServer(app.server, COOKIE_SECRET);

  return { app, io };
}

export async function start() {
  const { app } = buildApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server listening on http://0.0.0.0:${port}`);
  return app;
}
