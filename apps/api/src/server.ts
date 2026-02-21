import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import type { HealthResponse } from "@chess/shared";
import { db } from "./db/index.js";
import { sql } from "drizzle-orm";
import { authenticationPlugin } from "./auth/plugin.js";
import { authRoutesPlugin } from "./auth/routes.js";
import { gameRoutesPlugin } from "./game/routes.js";
import { setupSocketServer, type TypedSocketServer } from "./socket/index.js";

const COOKIE_SECRET = process.env.SESSION_SECRET ?? "dev-fallback-secret-not-for-production";

export interface BuildAppOptions {
  staticDir?: string;
}

export function buildApp(options?: BuildAppOptions): {
  app: ReturnType<typeof Fastify>;
  io: TypedSocketServer;
} {
  const app = Fastify({ logger: false });

  app.register(authenticationPlugin);
  app.register(authRoutesPlugin);
  app.register(gameRoutesPlugin, { prefix: "/api/games" });

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction || options?.staticDir) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const staticRoot =
      options?.staticDir ?? process.env.STATIC_DIR ?? path.resolve(__dirname, "../../web/dist");

    app.register(fastifyStatic, {
      root: staticRoot,
      wildcard: false,
    });
  }

  app.get<{ Reply: HealthResponse }>("/health", async (_req, reply) => {
    db.run(sql`SELECT 1`);
    return reply.send({ status: "ok" });
  });

  if (isProduction || options?.staticDir) {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/socket.io/")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  const io = setupSocketServer(app.server, COOKIE_SECRET);

  return { app, io };
}

export async function start() {
  const { app } = buildApp();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  console.log(`Server listening on http://${host}:${port}`);
  return app;
}
