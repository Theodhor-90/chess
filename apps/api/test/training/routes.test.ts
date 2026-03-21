import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type {
  AddRepertoireMoveResponse,
  CreateRepertoireResponse,
  TrainingNextResponse,
  TrainingReviewResponse,
} from "@chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

beforeAll(() => {
  ensureSchema();
});

describe("GET /api/repertoires/:id/train/next", () => {
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
      url: "/api/repertoires/1/train/next",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("train-next-404"));
    const res = await app.inject({
      method: "GET",
      url: "/api/repertoires/99999/train/next",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for another user's repertoire", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("train-owner1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("train-owner2"));

    // User 1 creates a repertoire
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie: cookie1 },
      payload: { name: "Private Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // User 2 tries to access it
    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/train/next`,
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns null line with zero counts for empty repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("train-empty"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Empty Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/train/next`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TrainingNextResponse;
    expect(body.line).toBeNull();
    expect(body.dueCount).toBe(0);
    expect(body.newCount).toBe(0);
  });

  it("returns a training line with due cards for a repertoire with moves", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("train-line"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Sicilian", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Add move: 1.e4 (white's move, creates card)
    const addE4Res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });
    const afterE4 = (addE4Res.json() as AddRepertoireMoveResponse).resultFen;

    // Add move: 1...c5 (opponent's move, no card)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: afterE4, moveSan: "c5" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/train/next`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TrainingNextResponse;

    // Should have a line
    expect(body.line).not.toBeNull();
    expect(body.dueCount).toBeGreaterThanOrEqual(1);
    expect(body.newCount).toBeGreaterThanOrEqual(1);

    // Line should start with the starting position
    expect(body.line![0].fen).toBe(STARTING_FEN);
    expect(body.line![0].san).toBeNull();
    expect(body.line![0].isUserMove).toBe(false);

    // Line should contain at least one user move that is due
    const userMoves = body.line!.filter((m) => m.isUserMove);
    expect(userMoves.length).toBeGreaterThanOrEqual(1);

    const dueMoves = body.line!.filter((m) => m.isDue);
    expect(dueMoves.length).toBeGreaterThanOrEqual(1);

    // The e4 move should be marked as user move with a card
    const e4Move = body.line!.find((m) => m.san === "e4");
    expect(e4Move).toBeDefined();
    expect(e4Move!.isUserMove).toBe(true);
    expect(e4Move!.cardId).toEqual(expect.any(Number));
    expect(e4Move!.isDue).toBe(true);

    // The c5 move should NOT be marked as user move
    const c5Move = body.line!.find((m) => m.san === "c5");
    if (c5Move) {
      expect(c5Move.isUserMove).toBe(false);
      expect(c5Move.cardId).toBeNull();
    }
  });

  it("returns null line when all cards have been reviewed and are not yet due", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("train-no-due"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Reviewed Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Add a move to create a card
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    // Manually set the card to not due: state=2 (Review), due far in the future
    const farFuture = Math.floor(Date.now() / 1000) + 86400 * 365;
    sqlite.exec(
      `UPDATE repertoire_cards SET state = 2, due = ${farFuture} WHERE repertoire_id = ${repId}`,
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/train/next`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TrainingNextResponse;
    expect(body.line).toBeNull();
    expect(body.dueCount).toBe(0);
    expect(body.newCount).toBe(0);
  });

  it("prefers lines with more due cards", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("train-prefer"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Branch Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Build a tree:
    // Starting pos -> e4 (white's move, card)
    //   after e4 -> c5 (opponent move, no card)
    //     after c5 -> Nf3 (white's move, card) [line A: 2 due cards via e4]
    //   after e4 -> e5 (opponent move, no card)
    //     after e5 -> (no further white move) [line B: 1 due card via e4]
    //
    // Starting pos -> d4 (white's move, card) [line C: 1 due card]
    //
    // Line A (e4 -> c5 -> Nf3) has 2 due cards in its subtree, should be preferred

    // Add e4
    const addE4Res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });
    const afterE4 = (addE4Res.json() as AddRepertoireMoveResponse).resultFen;

    // Add c5 (opponent move after e4)
    const addC5Res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: afterE4, moveSan: "c5" },
    });
    const afterE4C5 = (addC5Res.json() as AddRepertoireMoveResponse).resultFen;

    // Add Nf3 (white's move after c5)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: afterE4C5, moveSan: "Nf3" },
    });

    // Also add d4 as an alternative at the starting position
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "d4" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/repertoires/${repId}/train/next`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TrainingNextResponse;

    expect(body.line).not.toBeNull();

    // The line should contain e4 (which leads to the branch with 2 due cards),
    // not d4 (which has only 1 due card)
    const moveSans = body.line!.map((m) => m.san).filter(Boolean);
    expect(moveSans).toContain("e4");
    expect(moveSans).toContain("Nf3");
  });
});

describe("POST /api/repertoires/:id/train/review", () => {
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
      url: "/api/repertoires/1/train/review",
      payload: { cardId: 1, rating: 3 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("review-404"));
    const res = await app.inject({
      method: "POST",
      url: "/api/repertoires/99999/train/review",
      headers: { cookie },
      payload: { cardId: 1, rating: 3 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for non-existent card", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("review-no-card"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Review Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: 99999, rating: 3 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when card belongs to a different repertoire", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("review-wrong-rep"));

    // Create two repertoires
    const createRes1 = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Rep1", color: "white" },
    });
    const repId1 = (createRes1.json() as CreateRepertoireResponse).id;

    const createRes2 = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Rep2", color: "white" },
    });
    const repId2 = (createRes2.json() as CreateRepertoireResponse).id;

    // Add a move to rep1 (creates a card)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId1}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    // Get the card ID from rep1
    const card = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId1) as { id: number };

    // Try to review the card via rep2
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId2}/train/review`,
      headers: { cookie },
      payload: { cardId: card.id, rating: 3 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("successfully reviews a card and returns updated scheduling", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("review-ok"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Review OK Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    // Add a move (creates a card)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    // Get the card
    const cardRow = sqlite
      .prepare("SELECT id, state, reps FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { id: number; state: number; reps: number };

    expect(cardRow.state).toBe(0); // New
    expect(cardRow.reps).toBe(0);

    // Review with rating 3 (Good)
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: cardRow.id, rating: 3 },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as TrainingReviewResponse;

    // Card should be updated
    expect(body.card.id).toBe(cardRow.id);
    expect(body.card.reps).toBe(1);
    expect(body.card.state).toBeGreaterThanOrEqual(1); // No longer New
    expect(body.nextDue).toEqual(expect.any(Number));
    expect(body.interval).toEqual(expect.any(Number));

    // Verify the DB was updated
    const updatedCard = sqlite
      .prepare("SELECT reps, state FROM repertoire_cards WHERE id = ?")
      .get(cardRow.id) as { reps: number; state: number };
    expect(updatedCard.reps).toBe(1);
    expect(updatedCard.state).toBeGreaterThanOrEqual(1);

    // Verify a review log was created
    const logCount = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM review_logs WHERE card_id = ?")
      .get(cardRow.id) as { cnt: number };
    expect(logCount.cnt).toBe(1);
  });

  it("review with Again rating on a new card", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("review-again"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Again Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "d4" },
    });

    const cardRow = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { id: number };

    // Review with Again (1)
    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: cardRow.id, rating: 1 },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as TrainingReviewResponse;
    expect(body.card.reps).toBe(1);
    // After Again on a new card, it should be in Learning state
    expect(body.card.state).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid rating", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("review-bad-rating"));
    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Bad Rating", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    const res = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: 1, rating: 5 },
    });
    expect(res.statusCode).toBe(400);
  });
});
