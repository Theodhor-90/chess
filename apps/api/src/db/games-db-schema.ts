import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const databaseGames = sqliteTable(
  "database_games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    white: text("white").notNull(),
    black: text("black").notNull(),
    whiteElo: integer("white_elo").notNull(),
    blackElo: integer("black_elo").notNull(),
    result: text("result").notNull(),
    eco: text("eco"),
    opening: text("opening"),
    date: text("date"),
    timeControl: text("time_control"),
    termination: text("termination"),
    lichessUrl: text("lichess_url").notNull().unique(),
    pgn: text("pgn").notNull(),
  },
  (table) => [
    index("database_games_white_idx").on(table.white),
    index("database_games_black_idx").on(table.black),
    index("database_games_white_elo_idx").on(table.whiteElo),
    index("database_games_black_elo_idx").on(table.blackElo),
    index("database_games_result_idx").on(table.result),
    index("database_games_eco_idx").on(table.eco),
    index("database_games_date_idx").on(table.date),
  ],
);
