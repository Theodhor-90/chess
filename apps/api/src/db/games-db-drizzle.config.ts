import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig } from "drizzle-kit";

const GAMES_DB_PATH = process.env.GAMES_DB_PATH ?? "./databases/games.db";

mkdirSync(dirname(GAMES_DB_PATH), { recursive: true });

export default defineConfig({
  schema: "./src/db/games-db-schema.ts",
  out: "./drizzle-games",
  dialect: "sqlite",
  dbCredentials: {
    url: GAMES_DB_PATH,
  },
});
