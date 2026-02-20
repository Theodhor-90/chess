import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

const DB_PATH = process.env.DATABASE_URL ?? "./data/chess.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite: DatabaseType = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { sqlite };

export type DrizzleDb = typeof db;

export function createDb(path: string): { db: DrizzleDb; sqlite: DatabaseType } {
  mkdirSync(dirname(path), { recursive: true });
  const sqliteInstance = new Database(path);
  sqliteInstance.pragma("journal_mode = WAL");
  return { db: drizzle(sqliteInstance, { schema }), sqlite: sqliteInstance };
}
