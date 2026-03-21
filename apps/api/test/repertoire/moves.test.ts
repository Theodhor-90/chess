import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type {
  CreateRepertoireResponse,
  AddRepertoireMoveResponse,
  DeleteRepertoireMoveResponse,
} from "@chess/shared";

beforeAll(() => {
  ensureSchema();
});

async function createRepertoireForTest(
  app: ReturnType<typeof buildApp>["app"],
  cookie: string,
  name = "Test Rep",
  color: "white" | "black" = "white",
): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: "/api/repertoires",
    headers: { cookie },
    payload: { name, color },
  });
  return (res.json() as CreateRepertoireResponse).id;
}

async function addMove(
  app: ReturnType<typeof buildApp>["app"],
  cookie: string,
  repId: number,
  positionFen: string,
  moveSan: string,
  opts?: { isMainLine?: boolean; comment?: string },
): Promise<AddRepertoireMoveResponse> {
  const res = await app.inject({
    method: "POST",
    url: `/api/repertoires/${repId}/moves`,
    headers: { cookie },
    payload: { positionFen, moveSan, ...opts },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as AddRepertoireMoveResponse;
}

describe("POST /api/repertoires/:id/moves", () => {
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
      url: "/api/repertoires/1/moves",
      payload: {
        positionFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
        moveSan: "e4",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-add-404"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires/999999/moves",
      headers: { cookie },
      payload: {
        positionFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
        moveSan: "e4",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Repertoire not found" });
  });

  it("adds a valid move and returns 201 with computed fields", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-add-ok"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    const body = await addMove(app, cookie, repId, startFen, "e4");
    expect(body.id).toEqual(expect.any(Number));
    expect(body.positionFen).toBe(startFen);
    expect(body.moveSan).toBe("e4");
    expect(body.moveUci).toBe("e2e4");
    // chess.js only sets en passant square when a legal ep capture exists; from the start position after 1.e4, no enemy pawn can capture ep so it outputs '-'
    expect(body.resultFen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -");
    expect(body.isMainLine).toBe(true);
    expect(body.comment).toBeNull();
  });

  it("adds a move with comment and isMainLine=false", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-add-opts"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    const body = await addMove(app, cookie, repId, startFen, "d4", {
      isMainLine: false,
      comment: "Queen's pawn opening",
    });
    expect(body.moveSan).toBe("d4");
    expect(body.moveUci).toBe("d2d4");
    expect(body.isMainLine).toBe(false);
    expect(body.comment).toBe("Queen's pawn opening");
  });

  it("returns 400 for invalid move", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-add-invalid"));
    const repId = await createRepertoireForTest(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: {
        positionFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
        moveSan: "e5",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid move" });
  });

  it("returns 400 for invalid position FEN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-add-badfen"));
    const repId = await createRepertoireForTest(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: {
        positionFen: "not-a-valid-fen",
        moveSan: "e4",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid position FEN" });
  });

  it("upserts on duplicate (positionFen, moveSan)", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-add-upsert"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    // First insert
    const body1 = await addMove(app, cookie, repId, startFen, "e4", { comment: "original" });
    expect(body1.comment).toBe("original");

    // Upsert: same position + move, different comment
    const res2 = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: startFen, moveSan: "e4", comment: "updated", isMainLine: false },
    });
    expect(res2.statusCode).toBe(201);
    const body2 = res2.json() as AddRepertoireMoveResponse;
    expect(body2.id).toBe(body1.id); // same row updated
    expect(body2.comment).toBe("updated");
    expect(body2.isMainLine).toBe(false);
  });

  it("handles promotion moves correctly", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-add-promo"));
    const repId = await createRepertoireForTest(app, cookie);

    // A position where a pawn can promote. White pawn on e7, black king on h8, white king on e1
    const promoFen = "7k/4P3/8/8/8/8/8/4K3 w - -";
    const body = await addMove(app, cookie, repId, promoFen, "e8=Q");
    expect(body.moveUci).toBe("e7e8q");
    expect(body.moveSan).toBe("e8=Q");
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("mv-add-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("mv-add-other2"));
    const repId = await createRepertoireForTest(app, cookie1);

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie: cookie2 },
      payload: {
        positionFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -",
        moveSan: "e4",
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/repertoires/:id/moves/:moveId", () => {
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
      url: "/api/repertoires/1/moves/1",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-del-404rep"));
    const res = await app.inject({
      method: "DELETE",
      url: "/api/repertoires/999999/moves/1",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Repertoire not found" });
  });

  it("returns 404 for non-existent move", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-del-404mv"));
    const repId = await createRepertoireForTest(app, cookie);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}/moves/999999`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Move not found" });
  });

  it("deletes a leaf move (no descendants)", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-del-leaf"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    // Add a single move
    const e4 = await addMove(app, cookie, repId, startFen, "e4");

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}/moves/${e4.id}`,
      headers: { cookie },
    });
    expect(delRes.statusCode).toBe(200);
    const body = delRes.json() as DeleteRepertoireMoveResponse;
    expect(body.deleted).toBe(1);

    // Verify move is gone
    const moveRow = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_moves WHERE id = ?")
      .get(e4.id) as { cnt: number };
    expect(moveRow.cnt).toBe(0);
  });

  it("cascades delete to all descendants", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-del-cascade"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    // Build a chain: e4 -> c5 -> Nf3 using chained API responses
    const e4 = await addMove(app, cookie, repId, startFen, "e4");
    const c5 = await addMove(app, cookie, repId, e4.resultFen, "c5");
    await addMove(app, cookie, repId, c5.resultFen, "Nf3");

    // Verify 3 moves exist
    const countBefore = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_moves WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(countBefore.cnt).toBe(3);

    // Delete e4 — should cascade to c5 and Nf3
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}/moves/${e4.id}`,
      headers: { cookie },
    });
    expect(delRes.statusCode).toBe(200);
    const body = delRes.json() as DeleteRepertoireMoveResponse;
    expect(body.deleted).toBe(3);

    // Verify all moves are gone
    const countAfter = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_moves WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(countAfter.cnt).toBe(0);
  });

  it("only deletes descendants, not siblings", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-del-sibling"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    // Add: e4 -> c5 (main), e4 -> e5 (sideline)
    const e4 = await addMove(app, cookie, repId, startFen, "e4");
    const c5 = await addMove(app, cookie, repId, e4.resultFen, "c5");
    await addMove(app, cookie, repId, e4.resultFen, "e5", { isMainLine: false });

    // Delete c5 — should NOT delete e5 (sibling) or e4 (parent)
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}/moves/${c5.id}`,
      headers: { cookie },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().deleted).toBe(1);

    // Verify 2 moves remain (e4 and e5)
    const countAfter = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_moves WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(countAfter.cnt).toBe(2);
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("mv-del-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("mv-del-other2"));
    const repId = await createRepertoireForTest(app, cookie1);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    // Add a move as user1
    const e4 = await addMove(app, cookie1, repId, startFen, "e4");

    // Try to delete as user2
    const res = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}/moves/${e4.id}`,
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /api/repertoires/:id/moves/:moveId", () => {
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
      url: "/api/repertoires/1/moves/1",
      payload: { comment: "test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-put-404rep"));
    const res = await app.inject({
      method: "PUT",
      url: "/api/repertoires/999999/moves/1",
      headers: { cookie },
      payload: { comment: "test" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Repertoire not found" });
  });

  it("returns 404 for non-existent move", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-put-404mv"));
    const repId = await createRepertoireForTest(app, cookie);
    const res = await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}/moves/999999`,
      headers: { cookie },
      payload: { comment: "test" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Move not found" });
  });

  it("updates comment only", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-put-comment"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    const e4 = await addMove(app, cookie, repId, startFen, "e4");

    const res = await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}/moves/${e4.id}`,
      headers: { cookie },
      payload: { comment: "King's pawn" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as AddRepertoireMoveResponse;
    expect(body.comment).toBe("King's pawn");
    expect(body.isMainLine).toBe(true); // unchanged
  });

  it("sets isMainLine=true and unsets siblings", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-put-mainline"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    // Add e4 first, then use its resultFen for sibling moves
    const e4 = await addMove(app, cookie, repId, startFen, "e4");

    // Add c5 as main line at the position after e4
    const c5 = await addMove(app, cookie, repId, e4.resultFen, "c5", { isMainLine: true });

    // Add e5 as sideline at the same position after e4
    const e5 = await addMove(app, cookie, repId, e4.resultFen, "e5", { isMainLine: false });

    // Set e5 as main line
    const res = await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}/moves/${e5.id}`,
      headers: { cookie },
      payload: { isMainLine: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isMainLine).toBe(true);

    // Verify c5 is no longer main line
    const c5Row = sqlite
      .prepare("SELECT is_main_line FROM repertoire_moves WHERE id = ?")
      .get(c5.id) as { is_main_line: number };
    expect(c5Row.is_main_line).toBe(0);
  });

  it("updates sortOrder", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("mv-put-sort"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    const e4 = await addMove(app, cookie, repId, startFen, "e4");

    const res = await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}/moves/${e4.id}`,
      headers: { cookie },
      payload: { sortOrder: 5 },
    });
    expect(res.statusCode).toBe(200);

    // Verify in DB
    const row = sqlite
      .prepare("SELECT sort_order FROM repertoire_moves WHERE id = ?")
      .get(e4.id) as { sort_order: number };
    expect(row.sort_order).toBe(5);
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("mv-put-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("mv-put-other2"));
    const repId = await createRepertoireForTest(app, cookie1);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    const e4 = await addMove(app, cookie1, repId, startFen, "e4");

    const res = await app.inject({
      method: "PUT",
      url: `/api/repertoires/${repId}/moves/${e4.id}`,
      headers: { cookie: cookie2 },
      payload: { comment: "hacked" },
    });
    expect(res.statusCode).toBe(404);
  });
});
