import { sqlite } from "../db/index.js";

interface CardStateRow {
  state: number;
  cnt: number;
}

interface CardRetentionRow {
  stability: number;
  last_review: number;
}

interface ReviewDateRow {
  review_date: string;
}

export interface TrainingStats {
  totalCards: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
  dueToday: number;
  dueTomorrow: number;
  averageRetention: number | null;
  streak: number;
  totalReviews: number;
}

/**
 * Compute training statistics for a repertoire.
 *
 * - State counts: grouped COUNT by card state (0=New, 1=Learning, 2=Review, 3=Relearning).
 * - Due counts: cards with due <= end of today / end of tomorrow (unix timestamps).
 * - Average retention: FSRS retrievability formula R = 0.9^(t/S) averaged across
 *   all non-new cards with stability > 0. t = elapsed days since last_review.
 * - Streak: consecutive days (backwards from today) with at least one review_logs entry.
 * - Total reviews: total count of review_logs entries for this repertoire's cards.
 */
export function getTrainingStats(repertoireId: number): TrainingStats {
  const nowUnix = Math.floor(Date.now() / 1000);

  // --- State counts ---
  const stateCounts = sqlite
    .prepare(
      "SELECT state, COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ? GROUP BY state",
    )
    .all(repertoireId) as CardStateRow[];

  let totalCards = 0;
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let relearningCount = 0;

  for (const row of stateCounts) {
    totalCards += row.cnt;
    switch (row.state) {
      case 0:
        newCount = row.cnt;
        break;
      case 1:
        learningCount = row.cnt;
        break;
      case 2:
        reviewCount = row.cnt;
        break;
      case 3:
        relearningCount = row.cnt;
        break;
    }
  }

  // --- Due counts ---
  // End of today: midnight tonight (start of tomorrow) in UTC
  const todayDate = new Date();
  const endOfToday = new Date(
    Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate() + 1),
  );
  const endOfTodayUnix = Math.floor(endOfToday.getTime() / 1000);

  // End of tomorrow: midnight the day after tomorrow in UTC
  const endOfTomorrow = new Date(
    Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate() + 2),
  );
  const endOfTomorrowUnix = Math.floor(endOfTomorrow.getTime() / 1000);

  const dueTodayRow = sqlite
    .prepare(
      "SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ? AND (state = 0 OR due <= ?)",
    )
    .get(repertoireId, endOfTodayUnix) as { cnt: number };
  const dueToday = dueTodayRow.cnt;

  const dueTomorrowRow = sqlite
    .prepare(
      "SELECT COUNT(*) as cnt FROM repertoire_cards WHERE repertoire_id = ? AND (state = 0 OR due <= ?)",
    )
    .get(repertoireId, endOfTomorrowUnix) as { cnt: number };
  const dueTomorrow = dueTomorrowRow.cnt;

  // --- Average retention ---
  // R = 0.9^(t/S) where t = elapsed days since last review, S = stability.
  // Only include cards with state >= 1 (non-New) and stability > 0.
  const retentionCards = sqlite
    .prepare(
      "SELECT stability, last_review FROM repertoire_cards WHERE repertoire_id = ? AND state >= 1 AND stability > 0 AND last_review IS NOT NULL",
    )
    .all(repertoireId) as CardRetentionRow[];

  let averageRetention: number | null = null;
  if (retentionCards.length > 0) {
    let totalRetention = 0;
    const nowDays = nowUnix / 86400;
    for (const card of retentionCards) {
      const lastReviewDays = card.last_review / 86400;
      const elapsedDays = Math.max(0, nowDays - lastReviewDays);
      const retention = Math.pow(0.9, elapsedDays / card.stability);
      totalRetention += retention;
    }
    averageRetention = totalRetention / retentionCards.length;
  }

  // --- Streak ---
  // Query distinct dates from review_logs for this repertoire's cards,
  // ordered descending. Then count consecutive days from today backwards.
  const reviewDates = sqlite
    .prepare(
      `SELECT DISTINCT date(reviewed_at, 'unixepoch') as review_date
       FROM review_logs
       WHERE card_id IN (SELECT id FROM repertoire_cards WHERE repertoire_id = ?)
       ORDER BY review_date DESC`,
    )
    .all(repertoireId) as ReviewDateRow[];

  let streak = 0;
  if (reviewDates.length > 0) {
    // Build set of review date strings for O(1) lookup
    const reviewDateSet = new Set(reviewDates.map((r) => r.review_date));

    // Start from today and count consecutive days backwards
    const checkDate = new Date();
    // Format today as YYYY-MM-DD in UTC
    let dateStr = formatDateUTC(checkDate);

    // If today doesn't have reviews, check yesterday first (user might not have reviewed yet today)
    if (!reviewDateSet.has(dateStr)) {
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      dateStr = formatDateUTC(checkDate);
    }

    while (reviewDateSet.has(dateStr)) {
      streak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
      dateStr = formatDateUTC(checkDate);
    }
  }

  // --- Total reviews ---
  const totalReviewsRow = sqlite
    .prepare(
      "SELECT COUNT(*) as cnt FROM review_logs WHERE card_id IN (SELECT id FROM repertoire_cards WHERE repertoire_id = ?)",
    )
    .get(repertoireId) as { cnt: number };
  const totalReviews = totalReviewsRow.cnt;

  return {
    totalCards,
    newCount,
    learningCount,
    reviewCount,
    relearningCount,
    dueToday,
    dueTomorrow,
    averageRetention,
    streak,
    totalReviews,
  };
}

/**
 * Format a Date as YYYY-MM-DD in UTC.
 */
function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
