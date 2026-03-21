import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import {
  syncCardsForRepertoire,
  createCardForMove,
  deleteCardsForMove,
  deleteAllCardsForRepertoire,
} from "../../src/training/card-sync.js";
import type { CreateRepertoireResponse } from "@chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -";
const AFTER_E4_C5 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -";

beforeAll(() => {
  ensureSchema();
});

describe("syncCardsForRepertoire", () => {
  let app: ReturnType<typeof buildApp>["app"];

  beforeEach(() => {
    ({ app } = buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates cards for own-side moves only (white repertoire)", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("sync-white"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "White Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Insert moves: 1.e4 (white's move from starting pos, w to move) and 1...c5 (black's move, b to move)
    sqlite.exec(`
      INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen)
      VALUES
        (${repId}, '${STARTING_FEN}', 'e4', 'e2e4', '${AFTER_E4}'),
        (${repId}, '${AFTER_E4}', 'c5', 'c7c5', '${AFTER_E4_C5}')
    `);

    syncCardsForRepertoire(repId);

    // Should have 1 card: e4 from starting position (white to move)
    // c5 is black's move, so no card for a white repertoire
    const cards = sqlite
      .prepare("SELECT * FROM repertoire_cards WHERE repertoire_id = ?")
      .all(repId) as Array<{ position_fen: string; move_san: string; side: string }>;

    expect(cards).toHaveLength(1);
    expect(cards[0].position_fen).toBe(STARTING_FEN);
    expect(cards[0].move_san).toBe("e4");
    expect(cards[0].side).toBe("white");
  });

  it("creates cards for own-side moves only (black repertoire)", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("sync-black"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Black Rep", color: "black" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Insert moves
    sqlite.exec(`
      INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen)
      VALUES
        (${repId}, '${STARTING_FEN}', 'e4', 'e2e4', '${AFTER_E4}'),
        (${repId}, '${AFTER_E4}', 'c5', 'c7c5', '${AFTER_E4_C5}')
    `);

    syncCardsForRepertoire(repId);

    // Should have 1 card: c5 from after e4 (black to move)
    const cards = sqlite
      .prepare("SELECT * FROM repertoire_cards WHERE repertoire_id = ?")
      .all(repId) as Array<{ position_fen: string; move_san: string; side: string }>;

    expect(cards).toHaveLength(1);
    expect(cards[0].position_fen).toBe(AFTER_E4);
    expect(cards[0].move_san).toBe("c5");
    expect(cards[0].side).toBe("black");
  });

  it("is idempotent — calling twice does not duplicate cards", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("sync-idempotent"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Idempotent Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    sqlite.exec(`
      INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen)
      VALUES (${repId}, '${STARTING_FEN}', 'e4', 'e2e4', '${AFTER_E4}')
    `);

    syncCardsForRepertoire(repId);
    syncCardsForRepertoire(repId);

    const count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it("removes orphaned cards when moves are deleted", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("sync-orphan"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Orphan Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    sqlite.exec(`
      INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen)
      VALUES (${repId}, '${STARTING_FEN}', 'e4', 'e2e4', '${AFTER_E4}')
    `);

    syncCardsForRepertoire(repId);

    // Verify card exists
    let count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(1);

    // Remove the move
    sqlite.exec(`DELETE FROM repertoire_moves WHERE repertoire_id = ${repId}`);

    // Sync again — should remove the orphaned card
    syncCardsForRepertoire(repId);

    count = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { cnt: number };
    expect(count.cnt).toBe(0);
  });

  it("does not modify existing cards scheduling state", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("sync-preserve"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Preserve Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    sqlite.exec(`
      INSERT INTO repertoire_moves (repertoire_id, position_fen, move_san, move_uci, result_fen)
      VALUES (${repId}, '${STARTING_FEN}', 'e4', 'e2e4', '${AFTER_E4}')
    `);

    syncCardsForRepertoire(repId);

    // Manually modify the card's stability to simulate a reviewed card
    sqlite.exec(
      `UPDATE repertoire_cards SET stability = 42.5, reps = 3 WHERE repertoire_id = ${repId}`,
    );

    // Sync again — should NOT reset the card
    syncCardsForRepertoire(repId);

    const card = sqlite
      .prepare("SELECT stability, reps FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { stability: number; reps: number };
    expect(card.stability).toBe(42.5);
    expect(card.reps).toBe(3);
  });
});

describe("createCardForMove", () => {
  it("creates a card with correct fields", () => {
    // Use a repertoire ID that exists — we need to seed one
    const repId = sqlite
      .prepare("INSERT INTO repertoires (user_id, name, color) VALUES (?, ?, ?) RETURNING id")
      .get(1, `test-rep-${Date.now()}`, "white") as { id: number } | undefined;

    // If no user with id=1 exists, seed one
    if (!repId) {
      sqlite.exec(
        `INSERT OR IGNORE INTO users (id, email, username, password_hash) VALUES (1, 'card-test@test.com', 'card_test_user', 'no-password')`,
      );
      const r = sqlite
        .prepare("INSERT INTO repertoires (user_id, name, color) VALUES (?, ?, ?)")
        .run(1, `test-rep-${Date.now()}`, "white");
      const id = Number(r.lastInsertRowid);

      createCardForMove(
        id,
        {
          positionFen: STARTING_FEN,
          moveSan: "e4",
          moveUci: "e2e4",
          resultFen: AFTER_E4,
        },
        "white",
      );

      const card = sqlite
        .prepare("SELECT * FROM repertoire_cards WHERE repertoire_id = ?")
        .get(id) as Record<string, unknown>;

      expect(card).toBeDefined();
      expect(card.position_fen).toBe(STARTING_FEN);
      expect(card.move_san).toBe("e4");
      expect(card.move_uci).toBe("e2e4");
      expect(card.result_fen).toBe(AFTER_E4);
      expect(card.side).toBe("white");
      expect(card.state).toBe(0); // New
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
      return;
    }

    createCardForMove(
      repId.id,
      {
        positionFen: STARTING_FEN,
        moveSan: "e4",
        moveUci: "e2e4",
        resultFen: AFTER_E4,
      },
      "white",
    );

    const card = sqlite
      .prepare("SELECT * FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId.id) as Record<string, unknown>;

    expect(card).toBeDefined();
    expect(card.position_fen).toBe(STARTING_FEN);
    expect(card.move_san).toBe("e4");
    expect(card.state).toBe(0);
  });

  it("does not duplicate on second call (INSERT OR IGNORE)", () => {
    sqlite.exec(
      `INSERT OR IGNORE INTO users (id, email, username, password_hash) VALUES (2, 'card-dup@test.com', 'card_dup_user', 'no-password')`,
    );
    const r = sqlite
      .prepare("INSERT INTO repertoires (user_id, name, color) VALUES (?, ?, ?)")
      .run(2, `dup-rep-${Date.now()}`, "white");
    const id = Number(r.lastInsertRowid);

    createCardForMove(
      id,
      { positionFen: STARTING_FEN, moveSan: "d4", moveUci: "d2d4", resultFen: AFTER_E4 },
      "white",
    );
    createCardForMove(
      id,
      { positionFen: STARTING_FEN, moveSan: "d4", moveUci: "d2d4", resultFen: AFTER_E4 },
      "white",
    );

    const count = sqlite
      .prepare(
        "SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ? AND move_san = 'd4'",
      )
      .get(id) as { cnt: number };
    expect(count.cnt).toBe(1);
  });
});

describe("deleteCardsForMove", () => {
  it("deletes card and its review logs", () => {
    sqlite.exec(
      `INSERT OR IGNORE INTO users (id, email, username, password_hash) VALUES (3, 'card-del@test.com', 'card_del_user', 'no-password')`,
    );
    const r = sqlite
      .prepare("INSERT INTO repertoires (user_id, name, color) VALUES (?, ?, ?)")
      .run(3, `del-rep-${Date.now()}`, "white");
    const id = Number(r.lastInsertRowid);

    createCardForMove(
      id,
      { positionFen: STARTING_FEN, moveSan: "Nf3", moveUci: "g1f3", resultFen: AFTER_E4 },
      "white",
    );

    // Get the card id
    const card = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ? AND move_san = 'Nf3'")
      .get(id) as { id: number };

    // Insert a review log
    sqlite.exec(`
      INSERT INTO review_logs (card_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days)
      VALUES (${card.id}, 3, 0, ${Math.floor(Date.now() / 1000)}, 1.0, 5.0, 0, 1)
    `);

    // Now delete
    deleteCardsForMove(id, STARTING_FEN, "Nf3");

    const cardCount = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(id) as { cnt: number };
    expect(cardCount.cnt).toBe(0);

    const logCount = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM review_logs WHERE card_id = ?")
      .get(card.id) as { cnt: number };
    expect(logCount.cnt).toBe(0);
  });

  it("no-ops when card does not exist", () => {
    // Should not throw
    deleteCardsForMove(99999, STARTING_FEN, "e4");
  });
});

describe("deleteAllCardsForRepertoire", () => {
  it("deletes all cards and review logs for a repertoire", () => {
    sqlite.exec(
      `INSERT OR IGNORE INTO users (id, email, username, password_hash) VALUES (4, 'card-delall@test.com', 'card_delall_user', 'no-password')`,
    );
    const r = sqlite
      .prepare("INSERT INTO repertoires (user_id, name, color) VALUES (?, ?, ?)")
      .run(4, `delall-rep-${Date.now()}`, "white");
    const id = Number(r.lastInsertRowid);

    createCardForMove(
      id,
      { positionFen: STARTING_FEN, moveSan: "e4", moveUci: "e2e4", resultFen: AFTER_E4 },
      "white",
    );
    createCardForMove(
      id,
      { positionFen: AFTER_E4_C5, moveSan: "Nf3", moveUci: "g1f3", resultFen: AFTER_E4 },
      "white",
    );

    // Add a review log
    const card = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ? LIMIT 1")
      .get(id) as { id: number };
    sqlite.exec(`
      INSERT INTO review_logs (card_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days)
      VALUES (${card.id}, 3, 0, ${Math.floor(Date.now() / 1000)}, 1.0, 5.0, 0, 1)
    `);

    deleteAllCardsForRepertoire(id);

    const cardCount = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ?")
      .get(id) as { cnt: number };
    expect(cardCount.cnt).toBe(0);

    const logCount = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM review_logs WHERE card_id = ?")
      .get(card.id) as { cnt: number };
    expect(logCount.cnt).toBe(0);
  });
});
