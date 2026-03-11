import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server.js";
import { ensureSchema, uniqueEmail, registerAndLogin, createAndJoinGame } from "./helpers.js";

beforeAll(() => {
  ensureSchema();
});

async function createCompletedGame(
  app: FastifyInstance,
  creator: { cookie: string },
  joiner: { cookie: string },
  outcome: "resign-creator" | "resign-joiner" | "draw",
): Promise<number> {
  const { gameId } = await createAndJoinGame(app, creator.cookie, joiner.cookie);

  if (outcome === "resign-creator") {
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie: creator.cookie },
    });
  } else if (outcome === "resign-joiner") {
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie: joiner.cookie },
    });
  } else {
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/draw`,
      headers: { cookie: creator.cookie },
    });
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/draw`,
      headers: { cookie: joiner.cookie },
    });
  }

  return gameId;
}

describe("GET /api/games/history — Game history", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/games/history",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns empty for user with no completed games", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("hist-empty"));
    const res = await app.inject({
      method: "GET",
      url: "/api/games/history",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], total: 0 });
  });

  it("excludes non-terminal games", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-nonterminal-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-nonterminal-j"));

    // Create a waiting game (not joined)
    await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: creator.cookie },
      payload: {},
    });

    // Create an active game (joined but not finished)
    await createAndJoinGame(app, creator.cookie, joiner.cookie);

    // Create a resigned game (terminal)
    await createCompletedGame(app, creator, joiner, "resign-creator");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("paginates correctly with default params", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-paginate-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-paginate-j"));

    await createCompletedGame(app, creator, joiner, "resign-creator");
    await createCompletedGame(app, creator, joiner, "resign-joiner");
    await createCompletedGame(app, creator, joiner, "draw");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it("paginates with custom page/limit", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-custom-page-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-custom-page-j"));

    await createCompletedGame(app, creator, joiner, "resign-creator");
    await createCompletedGame(app, creator, joiner, "resign-joiner");
    await createCompletedGame(app, creator, joiner, "draw");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history?page=2&limit=2",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(3);
  });

  it("returns empty when page exceeds total", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-exceed-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-exceed-j"));

    await createCompletedGame(app, creator, joiner, "resign-creator");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history?page=100",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(1);
  });

  it("filters by result=win", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-win-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-win-j"));

    // Creator loses (resigns)
    await createCompletedGame(app, creator, joiner, "resign-creator");
    // Creator wins (joiner resigns)
    await createCompletedGame(app, creator, joiner, "resign-joiner");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history?result=win",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].result).toBe("win");
  });

  it("filters by result=loss", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-loss-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-loss-j"));

    // Creator loses (resigns)
    await createCompletedGame(app, creator, joiner, "resign-creator");
    // Creator wins (joiner resigns)
    await createCompletedGame(app, creator, joiner, "resign-joiner");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history?result=loss",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].result).toBe("loss");
  });

  it("filters by result=draw", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-draw-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-draw-j"));

    await createCompletedGame(app, creator, joiner, "draw");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history?result=draw",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].result).toBe("draw");
  });

  it("sorts newest first by default", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-sort-default-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-sort-default-j"));

    await createCompletedGame(app, creator, joiner, "resign-creator");
    await createCompletedGame(app, creator, joiner, "resign-joiner");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].playedAt).toBeGreaterThanOrEqual(body.items[1].playedAt);
  });

  it("sorts oldest first", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-sort-oldest-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-sort-oldest-j"));

    await createCompletedGame(app, creator, joiner, "resign-creator");
    await createCompletedGame(app, creator, joiner, "resign-joiner");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history?sort=oldest",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].playedAt).toBeLessThanOrEqual(body.items[1].playedAt);
  });

  it("returns correct fields per item", async () => {
    const creator = await registerAndLogin(app, uniqueEmail("hist-fields-c"));
    const joiner = await registerAndLogin(app, uniqueEmail("hist-fields-j"));

    await createCompletedGame(app, creator, joiner, "resign-joiner");

    const res = await app.inject({
      method: "GET",
      url: "/api/games/history",
      headers: { cookie: creator.cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);

    const item = body.items[0];
    expect(typeof item.id).toBe("number");
    expect(typeof item.opponentUsername).toBe("string");
    expect(typeof item.opponentId).toBe("number");
    expect(["win", "loss", "draw"]).toContain(item.result);
    expect(item.resultReason).toBe("resigned");
    expect(["white", "black"]).toContain(item.myColor);
    expect(item.timeControl).toMatch(/^\d+\+\d+$/);
    expect(typeof item.playedAt).toBe("number");
  });

  it("rejects invalid result param", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("hist-invalid"));
    const res = await app.inject({
      method: "GET",
      url: "/api/games/history?result=invalid",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});
