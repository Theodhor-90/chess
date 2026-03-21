import {
  fsrs,
  createEmptyCard,
  type FSRS,
  type Card,
  type Grade,
  type RecordLogItem,
} from "ts-fsrs";

// Singleton FSRS instance with project defaults
const f: FSRS = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
});

/**
 * Database row shape for a repertoire card's FSRS scheduling fields.
 */
export interface CardDbRow {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
}

/**
 * Returns the default FSRS scheduling fields for a brand-new card.
 * `due` is set to `now` (unix timestamp in seconds).
 */
export function createNewCard(now?: Date): CardDbRow {
  const card = createEmptyCard(now ?? new Date());
  return cardToDb(card);
}

/**
 * Run FSRS scheduling for a review.
 * Takes a card (as DB row values) and a rating (1–4).
 * Returns the updated card DB values and the review log data.
 */
export function reviewCard(
  dbRow: CardDbRow,
  rating: Grade,
  now?: Date,
): { card: CardDbRow; log: ReviewLogDbRow } {
  const card = dbToCard(dbRow);
  const reviewDate = now ?? new Date();
  const result: RecordLogItem = f.next(card, reviewDate, rating);
  return {
    card: cardToDb(result.card),
    log: {
      rating: result.log.rating as number,
      state: result.log.state as number,
      due: Math.floor(result.log.due.getTime() / 1000),
      stability: result.log.stability,
      difficulty: result.log.difficulty,
      elapsedDays: result.log.elapsed_days,
      scheduledDays: result.log.scheduled_days,
      reviewedAt: Math.floor(reviewDate.getTime() / 1000),
    },
  };
}

export interface ReviewLogDbRow {
  rating: number;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reviewedAt: number;
}

/**
 * Convert a ts-fsrs Card object to database column values.
 * Converts Date fields to unix timestamps (seconds).
 */
export function cardToDb(card: Card): CardDbRow {
  return {
    due: Math.floor(card.due.getTime() / 1000),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    lastReview: card.last_review ? Math.floor(card.last_review.getTime() / 1000) : null,
  };
}

/**
 * Convert database row values to a ts-fsrs Card object.
 * Converts unix timestamps (seconds) back to Date objects.
 */
export function dbToCard(row: CardDbRow): Card {
  return {
    due: new Date(row.due * 1000),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.lastReview ? new Date(row.lastReview * 1000) : undefined,
  } as Card;
}
