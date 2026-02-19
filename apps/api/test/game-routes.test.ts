import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/server.js";
import { sqlite } from "../src/db/index.js";
import {
  bootstrapSchema,
  cleanTables,
  uniqueEmail,
  registerAndLogin,
  createAndJoinGame,
} from "./helpers.js";

beforeAll(() => {
  bootstrapSchema(sqlite);
});

describe("Auth enforcement", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const protectedEndpoints = [
    { method: "POST" as const, url: "/api/games", payload: {} },
    { method: "GET" as const, url: "/api/games", payload: undefined },
    { method: "POST" as const, url: "/api/games/1/join", payload: { inviteToken: "x" } },
    { method: "GET" as const, url: "/api/games/1", payload: undefined },
    { method: "POST" as const, url: "/api/games/1/moves", payload: { from: "e2", to: "e4" } },
    { method: "POST" as const, url: "/api/games/1/resign", payload: undefined },
    { method: "POST" as const, url: "/api/games/1/draw", payload: undefined },
    { method: "POST" as const, url: "/api/games/1/abort", payload: undefined },
  ];

  for (const { method, url, payload } of protectedEndpoints) {
    it(`${method} ${url} returns 401 without session cookie`, async () => {
      const res = await app.inject({ method, url, payload });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "Unauthorized" });
    });
  }
});

describe("POST /api/games — Create game", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 201 with gameId, inviteToken, color", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("create-game"));
    const res = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.gameId).toBeGreaterThan(0);
    expect(body.inviteToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(["white", "black"]).toContain(body.color);
  });
});

describe("POST /api/games/:id/join — Join game", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with full game state, status is active", async () => {
    const { cookie: creatorCookie } = await registerAndLogin(app, uniqueEmail("join-creator"));
    const { cookie: joinerCookie } = await registerAndLogin(app, uniqueEmail("join-joiner"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: creatorCookie },
      payload: {},
    });
    const { gameId, inviteToken } = createRes.json();

    const joinRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: joinerCookie },
      payload: { inviteToken },
    });
    expect(joinRes.statusCode).toBe(200);
    const body = joinRes.json();
    expect(body.status).toBe("active");
    expect(body.players.white).toBeDefined();
    expect(body.players.black).toBeDefined();
  });

  it("returns 400 with wrong token", async () => {
    const { cookie: creatorCookie } = await registerAndLogin(app, uniqueEmail("join-wrongtoken-c"));
    const { cookie: joinerCookie } = await registerAndLogin(app, uniqueEmail("join-wrongtoken-j"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: creatorCookie },
      payload: {},
    });
    const { gameId } = createRes.json();

    const joinRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: joinerCookie },
      payload: { inviteToken: "wrong-token" },
    });
    expect(joinRes.statusCode).toBe(400);
    expect(joinRes.json()).toEqual({ error: "Invalid invite token" });
  });

  it("returns 400 when joining own game", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("join-own"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie },
      payload: {},
    });
    const { gameId, inviteToken } = createRes.json();

    const joinRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie },
      payload: { inviteToken },
    });
    expect(joinRes.statusCode).toBe(400);
    expect(joinRes.json()).toEqual({ error: "Cannot join your own game" });
  });
});

describe("POST /api/games/:id/moves — Make move", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with updated FEN, SAN, status", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("move-ok-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("move-ok-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const whiteCookie = creatorColor === "white" ? c1 : c2;

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/moves`,
      headers: { cookie: whiteCookie },
      payload: { from: "e2", to: "e4" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.san).toBe("e4");
    expect(body.status).toBe("active");
    expect(body.fen).toBeDefined();
    expect(body.pgn).toBeDefined();
  });

  it("returns 400 for illegal move", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("move-illegal-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("move-illegal-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const whiteCookie = creatorColor === "white" ? c1 : c2;

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/moves`,
      headers: { cookie: whiteCookie },
      payload: { from: "e2", to: "e5" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it("returns 403 when not your turn", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("move-turn-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("move-turn-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const blackCookie = creatorColor === "white" ? c2 : c1;

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/moves`,
      headers: { cookie: blackCookie },
      payload: { from: "e7", to: "e5" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "It is not your turn" });
  });
});

describe("GET /api/games/:id — Get game", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with full game state", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("get-game"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie },
      payload: {},
    });
    const { gameId } = createRes.json();

    const res = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(gameId);
    expect(body.status).toBe("waiting");
    expect(body.fen).toBeDefined();
  });

  it("returns 404 for nonexistent game", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("get-missing"));
    const res = await app.inject({
      method: "GET",
      url: "/api/games/99999",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Game not found" });
  });
});

describe("POST /api/games/:id/resign — Resign", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200, status is resigned", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("resign-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("resign-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie: c1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("resigned");
    expect(res.json().result.reason).toBe("resigned");
  });
});

describe("POST /api/games/:id/draw — Draw", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("offer then accept → status draw", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("draw-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("draw-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const offerRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/draw`,
      headers: { cookie: c1 },
    });
    expect(offerRes.statusCode).toBe(200);
    expect(offerRes.json().drawOffer).toBeDefined();
    expect(offerRes.json().status).toBe("active");

    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/draw`,
      headers: { cookie: c2 },
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.json().status).toBe("draw");
    expect(acceptRes.json().result).toEqual({ reason: "draw" });
  });
});

describe("POST /api/games/:id/abort — Abort", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200, status is aborted", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("abort"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie },
      payload: {},
    });
    const { gameId } = createRes.json();

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/abort`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("aborted");
  });
});

describe("GET /api/games — Game list", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns empty array when user has no games", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("list-empty"));
    const res = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ games: [] });
  });

  it("returns games where user is a player with correct playerColor", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("list-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("list-j"));

    // Create a game as c1 and have c2 join it
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: c1 },
      payload: {},
    });
    expect(createRes.statusCode).toBe(201);
    const { gameId, inviteToken, color: creatorColor } = createRes.json();

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: c2 },
      payload: { inviteToken },
    });

    // c1 should see the game with the color they were assigned at creation
    const res1 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c1 },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.games).toHaveLength(1);
    expect(body1.games[0].id).toBe(gameId);
    expect(body1.games[0].status).toBe("active");
    expect(body1.games[0].playerColor).toBe(creatorColor);

    // c2 (the joiner) should see the opposite color
    const joinerColor = creatorColor === "white" ? "black" : "white";
    const res2 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c2 },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.games).toHaveLength(1);
    expect(body2.games[0].id).toBe(gameId);
    expect(body2.games[0].playerColor).toBe(joinerColor);
  });

  it("does not return games where user is not a player", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("list-other-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("list-other-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("list-other-x"));

    // Create a game between c1 and c2
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: c1 },
      payload: {},
    });
    const { gameId, inviteToken } = createRes.json();
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: c2 },
      payload: { inviteToken },
    });

    // c3 should see no games
    const res = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ games: [] });
  });

  it("includes playerColor and game fields, excludes fen/pgn/moves", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("list-fields"));

    await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie },
      payload: {},
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const game = res.json().games[0];

    // Fields that SHOULD be present
    expect(game.id).toBeDefined();
    expect(game.status).toBeDefined();
    expect(game.players).toBeDefined();
    expect(game.clock).toBeDefined();
    expect(game.createdAt).toBeDefined();
    expect(game.playerColor).toBeDefined();

    // Fields that should NOT be present (stripped in GameListItem)
    expect(game.fen).toBeUndefined();
    expect(game.pgn).toBeUndefined();
    expect(game.moves).toBeUndefined();
    expect(game.currentTurn).toBeUndefined();
    expect(game.drawOffer).toBeUndefined();
    expect(game.inviteToken).toBeUndefined();

    // result should be absent (not null) for non-terminal games
    expect(game).not.toHaveProperty("result");
  });

  it("returns games ordered by most recent first (descending ID for tied timestamps)", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("list-order"));

    // Create three games sequentially — they will all have the same
    // unixepoch() timestamp (second precision) in a fast test.
    // The store orders by createdAt DESC, id DESC, so the most recently
    // created game (highest id) comes first.
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/games",
        headers: { cookie },
        payload: {},
      });
      ids.push(createRes.json().gameId);
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const games = res.json().games;
    expect(games).toHaveLength(3);

    // Assert IDs are in descending order (most recently created first)
    const returnedIds = games.map((g: { id: number }) => g.id);
    expect(returnedIds).toEqual([ids[2], ids[1], ids[0]]);
  });

  it("includes result with correct shape for terminal games", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("list-result-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("list-result-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    // Resign the game to create a terminal state
    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie: c1 },
    });

    // Verify c1 sees the resigned game with result in game list
    const res1 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c1 },
    });
    expect(res1.statusCode).toBe(200);
    const game1 = res1.json().games[0];
    expect(game1.id).toBe(gameId);
    expect(game1.status).toBe("resigned");
    expect(game1).toHaveProperty("result");
    expect(game1.result.reason).toBe("resigned");
    expect(game1.result.winner).toBeDefined();

    // Verify c2 also sees the result
    const res2 = await app.inject({
      method: "GET",
      url: "/api/games",
      headers: { cookie: c2 },
    });
    expect(res2.statusCode).toBe(200);
    const game2 = res2.json().games[0];
    expect(game2.id).toBe(gameId);
    expect(game2.status).toBe("resigned");
    expect(game2.result.reason).toBe("resigned");
    // The winner is the opponent of the resigner (c1)
    // Since c1 resigned, the winner is whichever color c1 is NOT
    expect(["white", "black"]).toContain(game2.result.winner);
  });
});

describe("Full game flow — Scholar's mate", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    cleanTables(sqlite);
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("register → login → create → join → play to checkmate", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("flow-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("flow-j"));
    const { gameId, creatorColor } = await createAndJoinGame(app, c1, c2);

    const whiteCookie = creatorColor === "white" ? c1 : c2;
    const blackCookie = creatorColor === "white" ? c2 : c1;

    async function move(cookie: string, from: string, to: string) {
      const res = await app.inject({
        method: "POST",
        url: `/api/games/${gameId}/moves`,
        headers: { cookie },
        payload: { from, to },
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    }

    // Scholar's mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7#
    await move(whiteCookie, "e2", "e4");
    await move(blackCookie, "e7", "e5");
    await move(whiteCookie, "d1", "h5");
    await move(blackCookie, "b8", "c6");
    await move(whiteCookie, "f1", "c4");
    await move(blackCookie, "g8", "f6");
    const result = await move(whiteCookie, "h5", "f7");

    expect(result.status).toBe("checkmate");
    expect(result.result).toEqual({ winner: "white", reason: "checkmate" });

    // Verify final state via GET
    const getRes = await app.inject({
      method: "GET",
      url: `/api/games/${gameId}`,
      headers: { cookie: whiteCookie },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().status).toBe("checkmate");
    expect(getRes.json().result).toEqual({ winner: "white", reason: "checkmate" });
    expect(getRes.json().pgn).toContain("Qxf7#");
  });
});
