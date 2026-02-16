import Fastify from "fastify";
import type { HealthResponse } from "@chess/shared";
import { db } from "./db/index.js";
import { sql } from "drizzle-orm";

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get<{ Reply: HealthResponse }>("/health", async (_req, reply) => {
    db.run(sql`SELECT 1`);
    return reply.send({ status: "ok" });
  });

  return app;
}

export async function start() {
  const app = buildApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server listening on http://0.0.0.0:${port}`);
  return app;
}
