import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./games-db-schema.js";

const GAMES_DB_PATH = process.env.GAMES_DB_PATH ?? "./databases/games.db";

mkdirSync(dirname(GAMES_DB_PATH), { recursive: true });

const sqlite: DatabaseType = new Database(GAMES_DB_PATH);
sqlite.pragma("journal_mode = WAL");

export const gamesDb = drizzle(sqlite, { schema });
export const gamesSqlite: DatabaseType = sqlite;

export { schema as gamesDbSchema };
