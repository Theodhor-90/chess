import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type {
  CreateRepertoireResponse,
  AddRepertoireMoveResponse,
  RepertoireImportResponse,
  RepertoireExportResponse,
  RepertoireTree,
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

describe("POST /api/repertoires/:id/import", () => {
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
      url: "/api/repertoires/1/import",
      payload: { pgn: "1. e4 e5" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-404"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires/999999/import",
      headers: { cookie },
      payload: { pgn: "1. e4 e5" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Repertoire not found" });
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("pgn-imp-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("pgn-imp-other2"));
    const repId = await createRepertoireForTest(app, cookie1);

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie: cookie2 },
      payload: { pgn: "1. e4 e5" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("imports a simple main line", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-main"));
    const repId = await createRepertoireForTest(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn: "1. e4 e5 2. Nf3 Nc6" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireImportResponse;
    expect(body.imported).toBe(4);

    // Verify tree structure via GET
    const treeRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    const tree = (treeRes.json() as RepertoireTree).tree;
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].san).toBe("e4");
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].san).toBe("e5");
    expect(tree.children[0].children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].children[0].san).toBe("Nf3");
    expect(tree.children[0].children[0].children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].children[0].children[0].san).toBe("Nc6");
    // All main line
    expect(tree.children[0].isMainLine).toBe(true);
    expect(tree.children[0].children[0].isMainLine).toBe(true);
  });

  it("imports PGN with variations", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-var"));
    const repId = await createRepertoireForTest(app, cookie);

    // Main line: 1. e4 e5 2. Nf3
    // Variation after 1. e4: 1... c5 2. Nf3
    const pgn = "1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *";
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireImportResponse;
    // e4, e5, c5, Nf3 (after c5), Nf3 (after e5) — 5 moves
    // But Nf3 after e5 and Nf3 after c5 are at different positions, so both are distinct
    expect(body.imported).toBeGreaterThanOrEqual(4);

    // Verify tree: e4 has two children (e5 main line, c5 sideline)
    const treeRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    const tree = (treeRes.json() as RepertoireTree).tree;
    const e4 = tree.children[0];
    expect(e4.san).toBe("e4");
    expect(e4.children.length).toBeGreaterThanOrEqual(2);

    const mainChild = e4.children.find((c) => c.san === "e5");
    const sideChild = e4.children.find((c) => c.san === "c5");
    expect(mainChild).toBeDefined();
    expect(sideChild).toBeDefined();
    expect(mainChild!.isMainLine).toBe(true);
    expect(sideChild!.isMainLine).toBe(false);
  });

  it("imports PGN with comments on the preceding move", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-comment"));
    const repId = await createRepertoireForTest(app, cookie);

    const pgn = "1. e4 {Best by test} e5 {Solid reply}";
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn },
    });
    expect(res.statusCode).toBe(200);

    // Verify comments via tree — {Best by test} annotates e4, {Solid reply} annotates e5
    const treeRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    const tree = (treeRes.json() as RepertoireTree).tree;
    const e4 = tree.children[0];
    expect(e4.comment).toBe("Best by test");
    const e5 = e4.children[0];
    expect(e5.comment).toBe("Solid reply");
  });

  it("imports PGN with headers (strips them)", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-headers"));
    const repId = await createRepertoireForTest(app, cookie);

    const pgn = `[Event "Test"]
[Site ""]
[Date "2024.01.01"]
[Result "*"]

1. e4 e5 2. Nf3 *`;
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireImportResponse;
    expect(body.imported).toBe(3); // e4, e5, Nf3
  });

  it("ignores NAGs", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-nag"));
    const repId = await createRepertoireForTest(app, cookie);

    const pgn = "1. e4 $1 e5 $2 2. Nf3";
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireImportResponse;
    expect(body.imported).toBe(3);
  });

  it("returns 400 for completely invalid PGN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-bad"));
    const repId = await createRepertoireForTest(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn: "this is not a chess game at all" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid PGN" });
  });

  it("returns 400 for empty PGN", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-empty"));
    const repId = await createRepertoireForTest(app, cookie);

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn: "" },
    });
    // Empty string fails minLength: 1 schema validation
    expect(res.statusCode).toBe(400);
  });

  it("deduplicates moves on import", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-dedup"));
    const repId = await createRepertoireForTest(app, cookie);

    // First import
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn: "1. e4 e5 2. Nf3" },
    });

    // Second import with overlapping moves
    const res2 = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn: "1. e4 e5 2. Bc4" },
    });
    expect(res2.statusCode).toBe(200);

    // Total moves: e4, e5, Nf3, Bc4 = 4 unique moves
    const count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_moves WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(4);
  });

  it("imports nested variations", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-imp-nested"));
    const repId = await createRepertoireForTest(app, cookie);

    // Nested variation: 1. e4 e5 (1... c5 (1... d5)) 2. Nf3
    const pgn = "1. e4 e5 (1... c5 (1... d5)) 2. Nf3";
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireImportResponse;
    // e4, e5, c5, d5, Nf3 = 5 moves
    expect(body.imported).toBe(5);

    // Verify tree: e4 has three children (e5 main, c5 side, d5 side)
    const treeRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });
    const tree = (treeRes.json() as RepertoireTree).tree;
    const e4 = tree.children[0];
    expect(e4.san).toBe("e4");
    // e5, c5, d5 are all children at the same position (after e4)
    expect(e4.children.length).toBeGreaterThanOrEqual(3);
  });
});

describe("GET /api/repertoires/:id/export", () => {
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
      url: "/api/repertoires/1/export",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-exp-404"));
    const res = await app.inject({
      method: "GET",
      url: "/api/repertoires/999999/export",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Repertoire not found" });
  });

  it("returns 404 for another users repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("pgn-exp-other1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("pgn-exp-other2"));
    const repId = await createRepertoireForTest(app, cookie1);

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/export`,
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("exports empty repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-exp-empty"));
    const repId = await createRepertoireForTest(app, cookie, "Empty Rep");

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/export`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireExportResponse;
    expect(body.pgn).toContain('[Event "Repertoire: Empty Rep"]');
    expect(body.pgn).toContain('[Result "*"]');
    expect(body.pgn).toContain("*");
  });

  it("exports a simple main line", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-exp-main"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    const e4 = await addMove(app, cookie, repId, startFen, "e4");
    const e5 = await addMove(app, cookie, repId, e4.resultFen, "e5");
    await addMove(app, cookie, repId, e5.resultFen, "Nf3");

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/export`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireExportResponse;
    expect(body.pgn).toContain("1.");
    expect(body.pgn).toContain("e4");
    expect(body.pgn).toContain("e5");
    expect(body.pgn).toContain("Nf3");
    expect(body.pgn).toContain("*");
  });

  it("exports variations in parentheses", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-exp-var"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    const e4 = await addMove(app, cookie, repId, startFen, "e4");
    await addMove(app, cookie, repId, e4.resultFen, "e5"); // main line
    await addMove(app, cookie, repId, e4.resultFen, "c5", { isMainLine: false }); // sideline

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/export`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireExportResponse;
    // Should contain variation notation
    expect(body.pgn).toContain("(");
    expect(body.pgn).toContain(")");
    expect(body.pgn).toContain("e5");
    expect(body.pgn).toContain("c5");
  });

  it("exports comments in curly braces", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-exp-comment"));
    const repId = await createRepertoireForTest(app, cookie);
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    await addMove(app, cookie, repId, startFen, "e4", { comment: "Best by test" });

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/export`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireExportResponse;
    expect(body.pgn).toContain("{Best by test}");
  });

  it("includes repertoire name in Event header", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-exp-header"));
    const repId = await createRepertoireForTest(app, cookie, "My Sicilian Defense");
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    await addMove(app, cookie, repId, startFen, "e4");

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/export`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepertoireExportResponse;
    expect(body.pgn).toContain('[Event "Repertoire: My Sicilian Defense"]');
  });
});

describe("PGN round-trip", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("import -> export -> import produces the same tree structure", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-rt"));
    const repId1 = await createRepertoireForTest(app, cookie, "Round Trip 1");

    // Import a PGN with variation
    const originalPgn = "1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 3. Bb5";
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId1}/import`,
      headers: { cookie },
      payload: { pgn: originalPgn },
    });

    // Export
    const exportRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId1}/export`,
      headers: { cookie },
    });
    expect(exportRes.statusCode).toBe(200);
    const exportedPgn = (exportRes.json() as RepertoireExportResponse).pgn;

    // Import into a second repertoire
    const repId2 = await createRepertoireForTest(app, cookie, "Round Trip 2");
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId2}/import`,
      headers: { cookie },
      payload: { pgn: exportedPgn },
    });

    // Compare trees
    const tree1Res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId1}`,
      headers: { cookie },
    });
    const tree2Res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId2}`,
      headers: { cookie },
    });

    const tree1 = (tree1Res.json() as RepertoireTree).tree;
    const tree2 = (tree2Res.json() as RepertoireTree).tree;

    // Compare tree structure by counting total moves
    function countMoves(node: typeof tree1): number {
      let count = node.san ? 1 : 0;
      for (const child of node.children) {
        count += countMoves(child);
      }
      return count;
    }

    expect(countMoves(tree1)).toBe(countMoves(tree2));

    // Compare root children
    expect(tree1.children.length).toBe(tree2.children.length);
    expect(tree1.children[0]?.san).toBe(tree2.children[0]?.san);

    // Verify the variation structure survives the round-trip
    const e4_1 = tree1.children[0];
    const e4_2 = tree2.children[0];
    expect(e4_1.children.length).toBe(e4_2.children.length);

    // Both should have e5 (main) and c5 (sideline) as children
    const e5_1 = e4_1.children.find((c) => c.san === "e5");
    const e5_2 = e4_2.children.find((c) => c.san === "e5");
    const c5_1 = e4_1.children.find((c) => c.san === "c5");
    const c5_2 = e4_2.children.find((c) => c.san === "c5");
    expect(e5_1).toBeDefined();
    expect(e5_2).toBeDefined();
    expect(c5_1).toBeDefined();
    expect(c5_2).toBeDefined();
  });

  it("empty repertoire exports and re-imports cleanly", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("pgn-rt-empty"));
    const repId = await createRepertoireForTest(app, cookie, "Empty");

    // Export empty repertoire
    const exportRes = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/export`,
      headers: { cookie },
    });
    expect(exportRes.statusCode).toBe(200);
    const pgn = (exportRes.json() as RepertoireExportResponse).pgn;

    // Reimport — should result in 0 or fail gracefully (no moves to import)
    const importRes = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn },
    });
    // An empty repertoire export has just headers and "*", which has no moves
    // This should return 400 since no moves can be extracted from just "*"
    expect(importRes.statusCode).toBe(400);
  });
});
