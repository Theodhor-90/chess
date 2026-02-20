import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/server.js";
import { ensureUsersTable, uniqueEmail, registerAndLogin, createAndJoinGame } from "./helpers.js";

beforeAll(() => {
  ensureUsersTable();
});

describe("Invite edge cases — resolve endpoint", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns status 'aborted' for an aborted game", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("invite-aborted"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie },
      payload: {},
    });
    const { gameId, inviteToken } = createRes.json();

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/abort`,
      headers: { cookie },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/games/resolve/${inviteToken}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("aborted");
  });

  it("returns status 'checkmate' for a completed game", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("invite-checkmate-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("invite-checkmate-j"));
    const { gameId, inviteToken, creatorColor } = await createAndJoinGame(app, c1, c2);

    const whiteCookie = creatorColor === "white" ? c1 : c2;
    const blackCookie = creatorColor === "white" ? c2 : c1;

    // Scholar's mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7#
    async function move(cookie: string, from: string, to: string) {
      const res = await app.inject({
        method: "POST",
        url: `/api/games/${gameId}/moves`,
        headers: { cookie },
        payload: { from, to },
      });
      expect(res.statusCode).toBe(200);
    }

    await move(whiteCookie, "e2", "e4");
    await move(blackCookie, "e7", "e5");
    await move(whiteCookie, "d1", "h5");
    await move(blackCookie, "b8", "c6");
    await move(whiteCookie, "f1", "c4");
    await move(blackCookie, "g8", "f6");
    await move(whiteCookie, "h5", "f7");

    const res = await app.inject({
      method: "GET",
      url: `/api/games/resolve/${inviteToken}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("checkmate");
  });

  it("returns status 'resigned' for a resigned game", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("invite-resigned-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("invite-resigned-j"));
    const { gameId, inviteToken } = await createAndJoinGame(app, c1, c2);

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/resign`,
      headers: { cookie: c1 },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/games/resolve/${inviteToken}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("resigned");
  });
});

describe("Join edge cases — join endpoint", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 400 when joining own game", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("join-self"));
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

  it("returns 409 when game is already active (reused link)", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("join-reuse-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("join-reuse-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("join-reuse-x"));
    const { gameId, inviteToken } = await createAndJoinGame(app, c1, c2);

    const joinRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: c3 },
      payload: { inviteToken },
    });
    expect(joinRes.statusCode).toBe(409);
    expect(joinRes.json()).toEqual({ error: "Game is not waiting for players" });
  });

  it("returns 409 when game is aborted", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("join-abort-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("join-abort-j"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: c1 },
      payload: {},
    });
    const { gameId, inviteToken } = createRes.json();

    await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/abort`,
      headers: { cookie: c1 },
    });

    const joinRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: c2 },
      payload: { inviteToken },
    });
    expect(joinRes.statusCode).toBe(409);
    expect(joinRes.json()).toEqual({ error: "Game is not waiting for players" });
  });

  it("returns 409 when game is completed (checkmate)", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("join-completed-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("join-completed-j"));
    const { cookie: c3 } = await registerAndLogin(app, uniqueEmail("join-completed-x"));
    const { gameId, inviteToken, creatorColor } = await createAndJoinGame(app, c1, c2);

    const whiteCookie = creatorColor === "white" ? c1 : c2;
    const blackCookie = creatorColor === "white" ? c2 : c1;

    async function move(cookie: string, from: string, to: string) {
      await app.inject({
        method: "POST",
        url: `/api/games/${gameId}/moves`,
        headers: { cookie },
        payload: { from, to },
      });
    }

    await move(whiteCookie, "e2", "e4");
    await move(blackCookie, "e7", "e5");
    await move(whiteCookie, "d1", "h5");
    await move(blackCookie, "b8", "c6");
    await move(whiteCookie, "f1", "c4");
    await move(blackCookie, "g8", "f6");
    await move(whiteCookie, "h5", "f7");

    const joinRes = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/join`,
      headers: { cookie: c3 },
      payload: { inviteToken },
    });
    expect(joinRes.statusCode).toBe(409);
    expect(joinRes.json()).toEqual({ error: "Game is not waiting for players" });
  });
});

describe("Abort edge cases", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 409 when aborting an active game", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("abort-active-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("abort-active-j"));
    const { gameId } = await createAndJoinGame(app, c1, c2);

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/abort`,
      headers: { cookie: c1 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Game can only be aborted while waiting" });
  });

  it("returns 403 when non-creator tries to abort", async () => {
    const { cookie: c1 } = await registerAndLogin(app, uniqueEmail("abort-noncreator-c"));
    const { cookie: c2 } = await registerAndLogin(app, uniqueEmail("abort-noncreator-j"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { cookie: c1 },
      payload: {},
    });
    const { gameId } = createRes.json();

    const res = await app.inject({
      method: "POST",
      url: `/api/games/${gameId}/abort`,
      headers: { cookie: c2 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Only the creator can abort the game" });
  });
});
