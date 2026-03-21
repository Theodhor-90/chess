import { describe, it, expect } from "vitest";
import { createNewCard, reviewCard, cardToDb, dbToCard } from "../../src/training/fsrs.js";
import { Rating, State } from "ts-fsrs";

describe("createNewCard", () => {
  it("returns a card with New state and default scheduling fields", () => {
    const card = createNewCard();
    expect(card.state).toBe(State.New); // 0
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.elapsedDays).toBe(0);
    expect(card.scheduledDays).toBe(0);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.lastReview).toBeNull();
    expect(card.due).toEqual(expect.any(Number));
    // due should be a unix timestamp (seconds) — reasonable range: within last minute
    const nowSec = Math.floor(Date.now() / 1000);
    expect(card.due).toBeGreaterThanOrEqual(nowSec - 60);
    expect(card.due).toBeLessThanOrEqual(nowSec + 60);
  });

  it("accepts a custom date for due", () => {
    const date = new Date("2025-06-15T10:00:00Z");
    const card = createNewCard(date);
    expect(card.due).toBe(Math.floor(date.getTime() / 1000));
  });
});

describe("reviewCard", () => {
  it("updates card state after rating Good on a new card", () => {
    const now = new Date("2025-06-15T10:00:00Z");
    const card = createNewCard(now);
    const reviewTime = new Date("2025-06-15T10:05:00Z");

    const result = reviewCard(card, Rating.Good, reviewTime);

    // After first review with Good, card should move to Learning or Review
    expect(result.card.state).toBeGreaterThanOrEqual(State.Learning); // 1
    expect(result.card.reps).toBe(1);
    expect(result.card.lastReview).toBe(Math.floor(reviewTime.getTime() / 1000));
    expect(result.card.due).toBeGreaterThan(Math.floor(reviewTime.getTime() / 1000));

    // Review log should capture pre-review state
    expect(result.log.rating).toBe(Rating.Good);
    expect(result.log.state).toBe(State.New); // state *before* review
    expect(result.log.reviewedAt).toBe(Math.floor(reviewTime.getTime() / 1000));
  });

  it("Again rating increases lapses for a review card", () => {
    const now = new Date("2025-06-15T10:00:00Z");
    let card = createNewCard(now);

    // Review multiple times with Good to get into Review state
    let reviewTime = new Date("2025-06-15T10:05:00Z");
    const result1 = reviewCard(card, Rating.Good, reviewTime);
    card = result1.card;

    reviewTime = new Date(card.due * 1000 + 1000); // slightly after due
    const result2 = reviewCard(card, Rating.Good, reviewTime);
    card = result2.card;

    reviewTime = new Date(card.due * 1000 + 1000);
    const result3 = reviewCard(card, Rating.Good, reviewTime);
    card = result3.card;

    // Now review with Again
    reviewTime = new Date(card.due * 1000 + 1000);
    const lapsesBefore = card.lapses;
    const resultAgain = reviewCard(card, Rating.Again, reviewTime);

    // Lapses should increase (if card was in Review state)
    if (card.state === State.Review) {
      expect(resultAgain.card.lapses).toBe(lapsesBefore + 1);
    }
    expect(resultAgain.log.rating).toBe(Rating.Again);
  });
});

describe("cardToDb / dbToCard roundtrip", () => {
  it("preserves all fields through a roundtrip", () => {
    const now = new Date("2025-06-15T10:00:00Z");
    const original = createNewCard(now);

    // Review it to get non-default values
    const reviewTime = new Date("2025-06-15T12:00:00Z");
    const reviewed = reviewCard(original, Rating.Good, reviewTime);
    const dbRow = reviewed.card;

    // Convert back via dbToCard then cardToDb
    const fsrsCard = dbToCard(dbRow);
    const roundtripped = cardToDb(fsrsCard);

    expect(roundtripped.due).toBe(dbRow.due);
    expect(roundtripped.stability).toBeCloseTo(dbRow.stability, 5);
    expect(roundtripped.difficulty).toBeCloseTo(dbRow.difficulty, 5);
    expect(roundtripped.elapsedDays).toBe(dbRow.elapsedDays);
    expect(roundtripped.scheduledDays).toBe(dbRow.scheduledDays);
    expect(roundtripped.reps).toBe(dbRow.reps);
    expect(roundtripped.lapses).toBe(dbRow.lapses);
    expect(roundtripped.state).toBe(dbRow.state);
    expect(roundtripped.lastReview).toBe(dbRow.lastReview);
  });
});
