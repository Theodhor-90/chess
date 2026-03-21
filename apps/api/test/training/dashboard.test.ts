import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/server.js";
import { sqlite } from "../../src/db/index.js";
import { ensureSchema, uniqueEmail, registerAndLogin } from "../helpers.js";
import type {
  CreateRepertoireResponse,
  AddRepertoireMoveResponse,
  TrainingDashboardResponse,
} from "@chess/shared";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

beforeAll(() => {
  ensureSchema();
});

describe("GET /api/training/dashboard", () => {
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
      url: "/api/training/dashboard",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns empty dashboard for user with no repertoires", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-empty"));
    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TrainingDashboardResponse;
    expect(body.totalDueToday).toBe(0);
    expect(body.totalCards).toBe(0);
    expect(body.overallRetention).toBeNull();
    expect(body.currentStreak).toBe(0);
    expect(body.repertoires).toHaveLength(0);
    expect(body.reviewHistory).toHaveLength(0);
    expect(body.learningVelocity).toHaveLength(0);
  });

  it("returns correct aggregated stats across multiple repertoires", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-multi"));

    // Create two repertoires
    const createRes1 = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Sicilian", color: "white" },
    });
    const repId1 = (createRes1.json() as CreateRepertoireResponse).id;

    const createRes2 = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "French", color: "black" },
    });
    const repId2 = (createRes2.json() as CreateRepertoireResponse).id;

    // Add move to rep1 (e4 is white's move in white repertoire → creates card)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId1}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    // Add opponent move for rep2 (e4 is opponent's move in black repertoire → no card)
    const addE4Res2 = await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId2}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });
    const afterE4 = (addE4Res2.json() as AddRepertoireMoveResponse).resultFen;

    // Add black's move in rep2 (e6 is user's move in black repertoire → creates card)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId2}/moves`,
      headers: { cookie },
      payload: { positionFen: afterE4, moveSan: "e6" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TrainingDashboardResponse;

    expect(body.repertoires).toHaveLength(2);
    // Total cards: 1 from rep1 (e4) + 1 from rep2 (e6) = 2
    expect(body.totalCards).toBe(2);
    // All cards are new and due
    expect(body.totalDueToday).toBe(2);

    const rep1Summary = body.repertoires.find((r) => r.id === repId1);
    expect(rep1Summary).toBeDefined();
    expect(rep1Summary!.name).toBe("Sicilian");
    expect(rep1Summary!.color).toBe("white");
    expect(rep1Summary!.totalCards).toBe(1);
    expect(rep1Summary!.dueToday).toBe(1);
    expect(rep1Summary!.newCount).toBe(1);

    const rep2Summary = body.repertoires.find((r) => r.id === repId2);
    expect(rep2Summary).toBeDefined();
    expect(rep2Summary!.name).toBe("French");
    expect(rep2Summary!.color).toBe("black");
    expect(rep2Summary!.totalCards).toBe(1);
    expect(rep2Summary!.dueToday).toBe(1);
    expect(rep2Summary!.newCount).toBe(1);
  });

  it("returns mastered count correctly", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-mastered"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Mastered Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    // Set the card to mastered state: state=2 (Review), stability=50 (> 30)
    const nowUnix = Math.floor(Date.now() / 1000);
    sqlite.exec(
      `UPDATE repertoire_cards SET state = 2, stability = 50, last_review = ${nowUnix}
       WHERE repertoire_id = ${repId}`,
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    const body = res.json() as TrainingDashboardResponse;
    const repSummary = body.repertoires.find((r) => r.id === repId);
    expect(repSummary).toBeDefined();
    expect(repSummary!.masteredCount).toBe(1);
  });

  it("review history returns entries from last 180 days", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-history"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "History Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    const cardRow = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { id: number };

    // Review the card to create a review log
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: cardRow.id, rating: 3 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    const body = res.json() as TrainingDashboardResponse;

    expect(body.reviewHistory.length).toBeGreaterThanOrEqual(1);
    const todayEntry = body.reviewHistory[body.reviewHistory.length - 1];
    expect(todayEntry.count).toBeGreaterThanOrEqual(1);
    expect(todayEntry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("streak tracks consecutive days with reviews across repertoires", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-streak"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Streak Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    const cardRow = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { id: number };

    // Review today
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: cardRow.id, rating: 3 },
    });

    // Insert a review log for yesterday manually
    const yesterdayUnix = Math.floor(Date.now() / 1000) - 86400;
    sqlite
      .prepare(
        "INSERT INTO review_logs (card_id, rating, state, due, stability, difficulty, elapsed_days, scheduled_days, reviewed_at) VALUES (?, 3, 0, ?, 1.0, 5.0, 0, 1, ?)",
      )
      .run(cardRow.id, yesterdayUnix, yesterdayUnix);

    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    const body = res.json() as TrainingDashboardResponse;
    expect(body.currentStreak).toBe(2);
  });

  it("learning velocity tracks new cards learned per day", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-velocity"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Velocity Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    const cardRow = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { id: number };

    // Review the new card (state=0 when reviewed → counts as new card learned)
    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: cardRow.id, rating: 3 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    const body = res.json() as TrainingDashboardResponse;

    expect(body.learningVelocity.length).toBeGreaterThanOrEqual(1);
    const todayVelocity = body.learningVelocity[body.learningVelocity.length - 1];
    expect(todayVelocity.newCardsLearned).toBeGreaterThanOrEqual(1);
  });

  it("does not leak data from other users", async () => {
    const { cookie: cookie1 } = await registerAndLogin(app, uniqueEmail("dash-iso1"));
    const { cookie: cookie2 } = await registerAndLogin(app, uniqueEmail("dash-iso2"));

    // User 1 creates a repertoire with moves
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

    // User 2 should see empty dashboard
    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie: cookie2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as TrainingDashboardResponse;
    expect(body.repertoires).toHaveLength(0);
    expect(body.totalCards).toBe(0);
    expect(body.totalDueToday).toBe(0);
  });

  it("overall retention is null when no cards have been reviewed", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-no-ret"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "No Retention Rep", color: "white" },
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
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    const body = res.json() as TrainingDashboardResponse;
    expect(body.overallRetention).toBeNull();
    const repSummary = body.repertoires.find((r) => r.id === repId);
    expect(repSummary!.retention).toBeNull();
  });

  it("overall retention is computed after reviews", async () => {
    const { cookie } = await registerAndLogin(app, uniqueEmail("dash-ret-ok"));

    const createRes = await app.inject({
      method: "POST",
      url: "/api/repertoires",
      headers: { cookie },
      payload: { name: "Retention OK Rep", color: "white" },
    });
    const repId = (createRes.json() as CreateRepertoireResponse).id;

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/moves`,
      headers: { cookie },
      payload: { positionFen: STARTING_FEN, moveSan: "e4" },
    });

    const cardRow = sqlite
      .prepare("SELECT id FROM repertoire_cards WHERE repertoire_id = ?")
      .get(repId) as { id: number };

    await app.inject({
      method: "POST",
      url: `/api/repertoires/${repId}/train/review`,
      headers: { cookie },
      payload: { cardId: cardRow.id, rating: 3 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/training/dashboard",
      headers: { cookie },
    });
    const body = res.json() as TrainingDashboardResponse;

    expect(body.overallRetention).not.toBeNull();
    expect(typeof body.overallRetention).toBe("number");
    expect(body.overallRetention!).toBeGreaterThan(0);
    expect(body.overallRetention!).toBeLessThanOrEqual(1);
  });
});
