import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});
