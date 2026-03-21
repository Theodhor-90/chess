import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type { CreateRepertoireResponse, AddRepertoireMoveResponse } from "@chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

beforeAll(() => {
  ensureSchema();
});

describe("Card sync via repertoire routes", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a card when adding an own-side move via POST /:id/moves", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("route-add-card"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Route Card", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Add e4 — own side move (white to move at starting position)
    const addRes = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });
    expect(addRes.statusCode).toBe(201);

    const cards = sqlite
      .prepare("SELECT * FROM repertoire_cards WHERE repertoire_id = ?")
      .all(repId) as Array<{ move_san: string; side: string }>;
    expect(cards).toHaveLength(1);
    expect(cards[0].move_san).toBe("e4");
    expect(cards[0].side).toBe("white");
  });

  it("does NOT create a card when adding an opponent-side move", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("route-opp-move"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Opp Move", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // First add e4 (own side)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    // Now add c5 — this is black's move, not own side for a white repertoire
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -";
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: afterE4, moveSan: "c5" },
    });

    const cards = sqlite
      .prepare("SELECT * FROM repertoire_cards WHERE repertoire_id = ?")
      .all(repId) as Array<{ move_san: string }>;
    // Only 1 card for e4, not for c5
    expect(cards).toHaveLength(1);
    expect(cards[0].move_san).toBe("e4");
  });

  it("deletes cards when deleting a move via DELETE /:id/moves/:moveId", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("route-del-card"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Del Card", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const addRes = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });
    const moveId = (addRes.json() as AddRepertoireMoveResponse).id;

    // Verify card exists
    let count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(1);

    // Delete the move
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}/moves/${moveId}`,
      headers: { cookie },
    });
    expect(delRes.statusCode).toBe(200);

    // Card should be gone
    count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  it("deletes all cards when deleting a repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("route-del-rep"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Del Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "d4" },
    });

    // Verify card exists
    let count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(1);

    // Delete the repertoire
    await app.inject({
      method: "DELETE",
      url: `/api/repertoires/${repId}`,
      headers: { cookie },
    });

    count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  it("syncs cards after PGN import", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("route-import-sync"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Import Sync", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Import a simple PGN with white moves
    const importRes = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/import`,
      headers: { cookie },
      payload: { pgn: "1. e4 e5 2. Nf3 Nc6" },
    });
    expect(importRes.statusCode).toBe(200);

    // For a white repertoire: own-side moves are from white-to-move positions
    // 1. e4 (from starting pos, w to move) -> card
    // 2. Nf3 (from after 1...e5, w to move) -> card
    // 1...e5 and 2...Nc6 are black moves, no cards
    const cards = sqlite
      .prepare("SELECT move_san FROM repertoire_cards WHERE repertoire_id = ? ORDER BY move_san")
      .all(repId) as Array<{ move_san: string }>;
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.move_san).sort()).toEqual(["Nf3", "e4"]);
  });
});
