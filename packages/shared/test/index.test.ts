import { describe, it, expectTypeOf } from "vitest";
import type {
  HealthResponse,
  ClockState,
  ClientToServerEvents,
  ServerToClientEvents,
  ServerSocketData,
  GameState,
  DatabaseGame,
  DatabaseGameFilter,
  PaginatedResponse,
  DatabaseGameSortField,
  SortOrder,
} from "../src/index.js";

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
