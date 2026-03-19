import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  HealthResponse,
  ClockState,
  ClockConfig,
  PlayerColor,
  ClientToServerEvents,
  ServerToClientEvents,
  ServerSocketData,
  GameState,
  GameListItem,
  GameHistoryItem,
  DatabaseGame,
  DatabaseGameFilter,
  PaginatedResponse,
  DatabaseGameSortField,
  SortOrder,
  BotProfile,
  BotGameRequest,
  BotGameResponse,
} from "../src/index.js";
import { BOT_PROFILES } from "../src/index.js";

describe("@chess/shared", () => {
  it("exports HealthResponse type", () => {
    expectTypeOf<HealthResponse>().toEqualTypeOf<{ status: "ok" }>();
  });

  it("exports ClockState type with correct shape", () => {
    expectTypeOf<ClockState>().toHaveProperty("white").toBeNumber();
    expectTypeOf<ClockState>().toHaveProperty("black").toBeNumber();
    expectTypeOf<ClockState>()
      .toHaveProperty("activeColor")
      .toEqualTypeOf<"white" | "black" | null>();
    expectTypeOf<ClockState>().toHaveProperty("lastUpdate").toBeNumber();
  });

  it("exports ClientToServerEvents with all event handlers", () => {
    expectTypeOf<ClientToServerEvents>().toHaveProperty("joinRoom").toBeFunction();
    expectTypeOf<ClientToServerEvents>().toHaveProperty("leaveRoom").toBeFunction();
    expectTypeOf<ClientToServerEvents>().toHaveProperty("move").toBeFunction();
    expectTypeOf<ClientToServerEvents>().toHaveProperty("resign").toBeFunction();
    expectTypeOf<ClientToServerEvents>().toHaveProperty("offerDraw").toBeFunction();
    expectTypeOf<ClientToServerEvents>().toHaveProperty("acceptDraw").toBeFunction();
    expectTypeOf<ClientToServerEvents>().toHaveProperty("abort").toBeFunction();
  });

  it("exports ServerToClientEvents with all event handlers", () => {
    expectTypeOf<ServerToClientEvents>().toHaveProperty("gameState").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("moveMade").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("gameOver").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("opponentJoined").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("opponentDisconnected").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("opponentReconnected").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("drawOffered").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("drawDeclined").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("clockUpdate").toBeFunction();
    expectTypeOf<ServerToClientEvents>().toHaveProperty("error").toBeFunction();
  });

  it("exports ServerSocketData with userId and rtt", () => {
    expectTypeOf<ServerSocketData>().toHaveProperty("userId").toBeNumber();
    expectTypeOf<ServerSocketData>().toHaveProperty("rtt").toBeNumber();
  });

  it("GameState includes optional clockState field", () => {
    expectTypeOf<GameState>().toHaveProperty("clockState").toEqualTypeOf<ClockState | undefined>();
  });
});

describe("Database Browser Types", () => {
  it("exports DatabaseGame with all fields", () => {
    expectTypeOf<DatabaseGame>().toHaveProperty("id").toBeNumber();
    expectTypeOf<DatabaseGame>().toHaveProperty("white").toBeString();
    expectTypeOf<DatabaseGame>().toHaveProperty("black").toBeString();
    expectTypeOf<DatabaseGame>().toHaveProperty("whiteElo").toBeNumber();
    expectTypeOf<DatabaseGame>().toHaveProperty("blackElo").toBeNumber();
    expectTypeOf<DatabaseGame>().toHaveProperty("result").toBeString();
    expectTypeOf<DatabaseGame>().toHaveProperty("eco").toEqualTypeOf<string | null>();
    expectTypeOf<DatabaseGame>().toHaveProperty("opening").toEqualTypeOf<string | null>();
    expectTypeOf<DatabaseGame>().toHaveProperty("date").toEqualTypeOf<string | null>();
    expectTypeOf<DatabaseGame>().toHaveProperty("timeControl").toEqualTypeOf<string | null>();
    expectTypeOf<DatabaseGame>().toHaveProperty("termination").toEqualTypeOf<string | null>();
    expectTypeOf<DatabaseGame>().toHaveProperty("lichessUrl").toBeString();
    expectTypeOf<DatabaseGame>().toHaveProperty("pgn").toBeString();
  });

  it("exports DatabaseGameFilter with all optional fields", () => {
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("player").toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("white").toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("black").toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("minElo").toEqualTypeOf<number | undefined>();
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("maxElo").toEqualTypeOf<number | undefined>();
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("result").toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("eco").toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>()
      .toHaveProperty("opening")
      .toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>()
      .toHaveProperty("dateFrom")
      .toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>().toHaveProperty("dateTo").toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>()
      .toHaveProperty("timeControl")
      .toEqualTypeOf<string | undefined>();
    expectTypeOf<DatabaseGameFilter>()
      .toHaveProperty("termination")
      .toEqualTypeOf<string | undefined>();
  });

  it("exports PaginatedResponse as a generic type", () => {
    type TestResponse = PaginatedResponse<DatabaseGame>;
    expectTypeOf<TestResponse>().toHaveProperty("data").toEqualTypeOf<DatabaseGame[]>();
    expectTypeOf<TestResponse>().toHaveProperty("total").toBeNumber();
    expectTypeOf<TestResponse>().toHaveProperty("page").toBeNumber();
    expectTypeOf<TestResponse>().toHaveProperty("limit").toBeNumber();
    expectTypeOf<TestResponse>().toHaveProperty("totalPages").toBeNumber();
  });

  it("exports DatabaseGameSortField as a union of column names", () => {
    expectTypeOf<DatabaseGameSortField>().toEqualTypeOf<
      "date" | "whiteElo" | "blackElo" | "opening" | "eco"
    >();
  });

  it("exports SortOrder as asc | desc", () => {
    expectTypeOf<SortOrder>().toEqualTypeOf<"asc" | "desc">();
  });
});

describe("Bot Types (Phase 15.1)", () => {
  it("exports BotProfile with all required fields", () => {
    expectTypeOf<BotProfile>().toHaveProperty("id").toBeNumber();
    expectTypeOf<BotProfile>().toHaveProperty("name").toBeString();
    expectTypeOf<BotProfile>().toHaveProperty("level").toBeNumber();
    expectTypeOf<BotProfile>().toHaveProperty("estimatedElo").toBeNumber();
    expectTypeOf<BotProfile>().toHaveProperty("depth").toBeNumber();
    expectTypeOf<BotProfile>().toHaveProperty("errorRate").toBeNumber();
    expectTypeOf<BotProfile>().toHaveProperty("thinkTimeMin").toBeNumber();
    expectTypeOf<BotProfile>().toHaveProperty("thinkTimeMax").toBeNumber();
  });

  it("exports BotGameRequest with level and optional clock", () => {
    expectTypeOf<BotGameRequest>().toHaveProperty("level").toBeNumber();
    expectTypeOf<BotGameRequest>().toHaveProperty("clock").toEqualTypeOf<ClockConfig | undefined>();
  });

  it("exports BotGameResponse with gameId, color, and botProfile", () => {
    expectTypeOf<BotGameResponse>().toHaveProperty("gameId").toBeNumber();
    expectTypeOf<BotGameResponse>().toHaveProperty("color").toEqualTypeOf<PlayerColor>();
    expectTypeOf<BotGameResponse>().toHaveProperty("botProfile").toEqualTypeOf<BotProfile>();
  });

  it("BOT_PROFILES contains exactly 5 profiles", () => {
    expect(BOT_PROFILES).toHaveLength(5);
  });

  it("BOT_PROFILES levels are 1 through 5 in order", () => {
    expect(BOT_PROFILES.map((p) => p.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it("BOT_PROFILES have unique ids matching their level", () => {
    for (const profile of BOT_PROFILES) {
      expect(profile.id).toBe(profile.level);
    }
  });

  it("BOT_PROFILES estimated Elo increases with level", () => {
    for (let i = 1; i < BOT_PROFILES.length; i++) {
      expect(BOT_PROFILES[i].estimatedElo).toBeGreaterThan(BOT_PROFILES[i - 1].estimatedElo);
    }
  });

  it("BOT_PROFILES depth increases with level", () => {
    for (let i = 1; i < BOT_PROFILES.length; i++) {
      expect(BOT_PROFILES[i].depth).toBeGreaterThan(BOT_PROFILES[i - 1].depth);
    }
  });

  it("BOT_PROFILES errorRate decreases with level", () => {
    for (let i = 1; i < BOT_PROFILES.length; i++) {
      expect(BOT_PROFILES[i].errorRate).toBeLessThan(BOT_PROFILES[i - 1].errorRate);
    }
  });

  it("BOT_PROFILES profile names are non-empty strings", () => {
    for (const profile of BOT_PROFILES) {
      expect(profile.name.length).toBeGreaterThan(0);
    }
  });

  it("GameState includes optional botLevel field", () => {
    expectTypeOf<GameState>().toHaveProperty("botLevel").toEqualTypeOf<number | null | undefined>();
  });

  it("GameListItem includes optional botLevel field", () => {
    expectTypeOf<GameListItem>()
      .toHaveProperty("botLevel")
      .toEqualTypeOf<number | null | undefined>();
  });

  it("GameHistoryItem includes optional botLevel field", () => {
    expectTypeOf<GameHistoryItem>()
      .toHaveProperty("botLevel")
      .toEqualTypeOf<number | null | undefined>();
  });
});
