import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { EnginePool } from "./engine-pool.js";

declare module "fastify" {
  interface FastifyInstance {
    engine: EnginePool;
  }
}

async function enginePluginFn(app: FastifyInstance) {
  const pool = new EnginePool();

  try {
    await pool.init();
    app.log.info(`Engine pool ready (${pool.size} engines)`);
  } catch (err) {
    app.log.warn(`Engine pool unavailable: ${err instanceof Error ? err.message : err}`);
    app.log.warn("Engine endpoints will return 503");
    return;
  }

  app.decorate("engine", pool);

  app.addHook("onClose", () => {
    pool.shutdown();
  });
}

export const enginePlugin = fp(enginePluginFn, {
  name: "engine",
});
