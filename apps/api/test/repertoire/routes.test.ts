import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type { RepertoireListItem, RepertoireTree, CreateRepertoireResponse } from "@chess/shared";

beforeAll(() => {
  ensureSchema();
});

describe("POST /api/repertoires", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      payload: { name: "My Sicilian", color: "black" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Unauthorized" });
  });

  it("creates a repertoire and returns 201", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-create"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "My Sicilian", color: "black", description: "Najdorf lines" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as CreateRepertoireResponse;
    expect(body.id).toEqual(expect.any(Number));
    expect(body.name).toBe("My Sicilian");
    expect(body.color).toBe("black");
    expect(body.description).toBe("Najdorf lines");
    expect(body.createdAt).toEqual(expect.any(Number));
  });

  it("creates a repertoire without description", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-create-nodesc"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Italian", color: "white" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as CreateRepertoireResponse;
    expect(body.description).toBeNull();
  });

  it("rejects missing name", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-create-noname"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { color: "white" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid color", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-create-badcolor"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "My Rep", color: "red" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects empty name", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-create-emptyname"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "", color: "white" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/repertoires", () => {
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
      url: "/api/repertoires",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns empty array for user with no repertoires", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-list-empty"));
    const res = await app.inject({
      method: "GET",
      url: "/api/repertoires",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns repertoires with move counts", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-list"));

    // Create two repertoires
    await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Rep A", color: "white" },
    });
    const res2 = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Rep B", color: "black", description: "desc" },
    });
    const repBId = (res2.json() as CreateRepertoireResponse).id;

    // Manually insert a move for Rep B to test moveCount
    sqlite.exec(
      `INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen)
       VALUES (${repBId}, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e4', 'e2e4', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -')`,
    );

    const listRes = await app.inject({
      method: "GET",
      url: "/api/repertoires",
      headers: { cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const items = listRes.json() as RepertoireListItem[];
    expect(items.length).toBe(2);

    // Ordered by updatedAt DESC — Rep B was created second
    const repB = items.find((i) => i.name === "Rep B")!;
    expect(repB.color).toBe("black");
    expect(repB.description).toBe("desc");
    expect(repB.moveCount).toBe(1);
    expect(repB.updatedAt).toEqual(expect.any(Number));

    const repA = items.find((i) => i.name === "Rep A")!;
    expect(repA.moveCount).toBe(0);
  });

  it("does not return other users' repertoires", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("rep-list-iso1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("rep-list-iso2"));

    await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie: cookie1 },
      payload: { name: "User1 Rep", color: "white" },
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/repertoires",
      headers: { cookie: cookie2 },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toEqual([]);
  });
});

describe("GET /api/repertoires/:id", () => {
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
      url: "/api/repertoires/1",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-get-404"));
    const res = await app.inject({
      method: "GET",
      url: "/api/repertoires/999999",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Repertoire not found" });
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("rep-get-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("rep-get-other2"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie: cookie1 },
      payload: { name: "Private", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns empty tree for repertoire with no moves", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-get-empty"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Empty Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireTree;
    expect(body.id).toBe(repId);
    expect(body.name).toBe("Empty Rep");
    expect(body.color).toBe("white");
    expect(body.tree.fen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
    expect(body.tree.san).toBeNull();
    expect(body.tree.uci).toBeNull();
    expect(body.tree.isMainLine).toBe(true);
    expect(body.tree.children).toEqual([]);
  });

  it("returns correct nested tree structure", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-get-tree"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Sicilian", color: "black" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -";
    const afterE4c5 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -";
    const afterE4e5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -";

    // Seed moves: 1.e4 -> c5 (main line) and 1.e4 -> e5 (sideline)
    sqlite.exec(`
      INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen, is_main_line, sort_order)
      VALUES
        (${repId}, '${startFen}', 'e4', 'e2e4', '${afterE4}', 1, 0),
        (${repId}, '${afterE4}', 'c5', 'c7c5', '${afterE4c5}', 1, 0),
        (${repId}, '${afterE4}', 'e5', 'e7e5', '${afterE4e5}', 0, 1)
    `);

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireTree;

    // Root node
    expect(body.tree.fen).toBe(startFen);
    expect(body.tree.children).toHaveLength(1);

    // 1. e4
    const e4Node = body.tree.children[0];
    expect(e4Node.san).toBe("e4");
    expect(e4Node.uci).toBe("e2e4");
    expect(e4Node.fen).toBe(afterE4);
    expect(e4Node.isMainLine).toBe(true);
    expect(e4Node.children).toHaveLength(2);

    // 1... c5 (main line, first due to sort)
    const c5Node = e4Node.children[0];
    expect(c5Node.san).toBe("c5");
    expect(c5Node.isMainLine).toBe(true);
    expect(c5Node.fen).toBe(afterE4c5);
    expect(c5Node.children).toEqual([]);

    // 1... e5 (sideline)
    const e5Node = e4Node.children[1];
    expect(e5Node.san).toBe("e5");
    expect(e5Node.isMainLine).toBe(false);
    expect(e5Node.fen).toBe(afterE4e5);
  });
});

describe("PUT /api/repertoires/:id", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/repertoires/1",
      payload: { name: "Updated" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-put-404"));
    const res = await app.inject({
      method: "PUT",
      url: "/api/repertoires/999999",
      headers: { cookie },
      payload: { name: "Updated" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("rep-put-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("rep-put-other2"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie: cookie1 },
      payload: { name: "Private", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}`,
      headers: { cookie: cookie2 },
      payload: { name: "Hacked" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("updates name and description", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-put-ok"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Old Name", color: "white", description: "Old desc" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
      payload: { name: "New Name", description: "New desc" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });

    // Verify the update
    const getRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    const body = getRes.json() as RepertoireTree;
    expect(body.name).toBe("New Name");
    expect(body.description).toBe("New desc");
  });

  it("updates only name when description not provided", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-put-partial"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Original", color: "black", description: "Keep me" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
      payload: { name: "Renamed" },
    });

    const getRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    const body = getRes.json() as RepertoireTree;
    expect(body.name).toBe("Renamed");
    expect(body.description).toBe("Keep me");
  });
});

describe("DELETE /api/repertoires/:id", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/repertoires/1",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-del-404"));
    const res = await app.inject({
      method: "DELETE",
      url: "/api/repertoires/999999",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("rep-del-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("rep-del-other2"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie: cookie1 },
      payload: { name: "Protected", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}`,
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("deletes repertoire and all its moves", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("rep-del-ok"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "To Delete", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Add a move
    sqlite.exec(
      `INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen)
       VALUES (${repId}, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e4', 'e2e4', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -')`,
    );

    const res = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });

    // Verify repertoire is gone
    const getRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    expect(getRes.statusCode).toBe(404);

    // Verify moves are also gone
    const moveRow = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_moves WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(moveRow.cnt).toBe(0);
  });
});
