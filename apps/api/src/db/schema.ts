import { sqliteTable, integer, text, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  preferences: text("preferences"),
});

export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inviteToken: text("invite_token").notNull(),
    status: text("status").notNull().default("waiting"),
    whitePlayerId: integer("white_player_id").references(() => users.id),
    blackPlayerId: integer("black_player_id").references(() => users.id),
    fen: text("fen").notNull().default("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    pgn: text("pgn").notNull().default(""),
    currentTurn: text("current_turn").notNull().default("white"),
    clockInitialTime: integer("clock_initial_time").notNull().default(600),
    clockIncrement: integer("clock_increment").notNull().default(0),
    drawOffer: text("draw_offer"),
    resultWinner: text("result_winner"),
    resultReason: text("result_reason"),
    clockWhiteRemaining: integer("clock_white_remaining"),
    clockBlackRemaining: integer("clock_black_remaining"),
    botLevel: integer("bot_level"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("games_invite_token_idx").on(table.inviteToken),
    index("games_white_player_id_idx").on(table.whitePlayerId),
    index("games_black_player_id_idx").on(table.blackPlayerId),
  ],
);

export const moves = sqliteTable(
  "moves",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    moveNumber: integer("move_number").notNull(),
    san: text("san").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("moves_game_id_move_number_idx").on(table.gameId, table.moveNumber)],
);

export const gameAnalyses = sqliteTable(
  "game_analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    analysisTree: text("analysis_tree").notNull(),
    whiteAccuracy: real("white_accuracy").notNull(),
    blackAccuracy: real("black_accuracy").notNull(),
    engineDepth: integer("engine_depth").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex("game_analyses_game_id_idx").on(table.gameId)],
);
