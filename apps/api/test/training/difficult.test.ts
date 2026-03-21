import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type { CreateRepertoireResponse, DifficultPositionsResponse } from "@chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

beforeAll(() => {
  ensureSchema();
});

describe("GET /api/training/difficult", () => {
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
      url: "/api/training/difficult",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns empty array for user with no repertoires", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("diff-empty"));
    const res = await app.inject({
      method: "GET",
      url: "/api/training/difficult",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as DifficultPositionsResponse;
    expect(body).toHaveLength(0);
  });

  it("returns empty array when no cards have lapses", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("diff-nolapse"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "No Lapse Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/training/difficult",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as DifficultPositionsResponse;
    expect(body).toHaveLength(0);
  });

  it("returns cards ordered by lapses descending with correct fields", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("diff-ordered"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Difficult Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Add two moves
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "d4" },
    });

    // Set lapses via direct SQL
    const cards = sqlite
      .prepare("SELECT id, move_san FROM repertoire_cards WHERE repertoire_id = ?")
      .all(repId) as Array<{ id: number; move_san: string }>;

    const e4Card = cards.find((c) => c.move_san === "e4")!;
    const d4Card = cards.find((c) => c.move_san === "d4")!;

    sqlite.exec(`UPDATE repertoire_cards SET lapses = 3, stability = 2.5 WHERE id = ${e4Card.id}`);
    sqlite.exec(`UPDATE repertoire_cards SET lapses = 7, stability = 1.2 WHERE id = ${d4Card.id}`);

    const res = await app.inject({
      method: "GET",
      url: "/api/training/difficult",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as DifficultPositionsResponse;

    expect(body).toHaveLength(2);
    // d4 has more lapses, so it should come first
    expect(body[0].moveSan).toBe("d4");
    expect(body[0].lapses).toBe(7);
    expect(body[0].stability).toBe(1.2);
    expect(body[0].repertoireId).toBe(repId);
    expect(body[0].repertoireName).toBe("Difficult Rep");
    expect(body[0].positionFen).toBe(STARTING_FEN);
    expect(body[0].moveUci).toBeTruthy();
    expect(typeof body[0].cardId).toBe("number");

    expect(body[1].moveSan).toBe("e4");
    expect(body[1].lapses).toBe(3);
  });

  it("returns at most 10 results", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("diff-limit"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Many Cards Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Add move to create a card, then manually insert 14 more cards with lapses
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    // Set lapses on the existing card
    sqlite.exec(`UPDATE repertoire_cards SET lapses = 1 WHERE repertoire_id = ${repId}`);

    // Manually insert 14 more cards with varying lapses
    for (let i = 0; i < 14; i++) {
      sqlite.exec(
        `INSERT INTO repertoire_cards (repertoire_id, position_fen, move_san, move_uci, result_fen, side, lapses, stability)
         VALUES (${repId}, 'fen${i}', 'move${i}', 'uci${i}', 'result${i}', 'white', ${i + 2}, 1.0)`,
      );
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/training/difficult",
      headers: { cookie },
    });
    const body = res.json() as DifficultPositionsResponse;
    expect(body).toHaveLength(10);
    // First result should have the highest lapses (15)
    expect(body[0].lapses).toBe(15);
  });

  it("does not leak data from other users", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("diff-iso1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("diff-iso2"));

    // User 1 creates a repertoire with a lapsed card
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie: cookie1 },
      payload: { name: "User1 Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie: cookie1 },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    sqlite.exec(`UPDATE repertoire_cards SET lapses = 5 WHERE repertoire_id = ${repId}`);

    // User 2 should see empty result
    const res = await app.inject({
      method: "GET",
      url: "/api/training/difficult",
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as DifficultPositionsResponse;
    expect(body).toHaveLength(0);
  });
});
