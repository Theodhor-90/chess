import { describe, it, expectTypeOf } from "vitest";
import type {
  HealthResponse,
  ClockState,
  ClientToServerEvents,
  ServerToClientEvents,
  ServerSocketData,
  GameState,
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
