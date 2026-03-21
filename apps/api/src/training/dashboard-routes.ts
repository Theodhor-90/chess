import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type {
  TrainingDashboardResponse,
  RepertoireTrainingSummary,
  ReviewHistoryEntry,
  LearningVelocityEntry,
  DifficultPositionsResponse,
  ErrorResponse,
} from "@chess/shared";
import { requireAuth } from "../auth/plugin.js";
import { sqlite } from "../db/index.js";

// Row types for raw SQL results
interface RepertoireRow {
  id: number;
  name: string;
  color: string;
}

interface CardStateCountRow {
  repertoire_id: number;
  state: number;
  cnt: number;
}

interface DueTodayRow {
  repertoire_id: number;
  cnt: number;
}

interface MasteredCountRow {
  repertoire_id: number;
  cnt: number;
}

interface RetentionRow {
  repertoire_id: number;
  stability: number;
  last_review: number;
}

interface ReviewHistoryRow {
  review_date: string;
  cnt: number;
}

interface ReviewDateRow {
  review_date: string;
}

interface VelocityRow {
  review_date: string;
  cnt: number;
}

interface DifficultCardRow {
  id: number;
  repertoire_id: number;
  repertoire_name: string;
  position_fen: string;
  move_san: string;
  move_uci: string;
  lapses: number;
  stability: number;
  last_review: number | null;
}

function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function dashboardRoutes(app: FastifyInstance) {
  app.get<{ Reply: TrainingDashboardResponse | ErrorResponse }>(
    "/dashboard",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;
      const nowUnix = Math.floor(Date.now() / 1000);

      // 1. Get user's repertoires
      const repertoires = sqlite
        .prepare("SELECT id, name, color FROM repertoires WHERE user_id = ?")
        .all(userId) as RepertoireRow[];

      if (repertoires.length === 0) {
        return reply.code(200).send({
          totalDueToday: 0,
          totalCards: 0,
          overallRetention: null,
          currentStreak: 0,
          repertoires: [],
          reviewHistory: [],
          learningVelocity: [],
        });
      }

      const repIds = repertoires.map((r) => r.id);
      const placeholders = repIds.map(() => "?").join(",");

      // 2. Card state counts per repertoire (batch query)
      const stateCountRows = sqlite
        .prepare(
          `SELECT repertoire_id, state, COUNT(*) as cnt
           FROM repertoire_cards
           WHERE repertoire_id IN (${placeholders})
           GROUP BY repertoire_id, state`,
        )
        .all(...repIds) as CardStateCountRow[];

      // 3. Due today per repertoire: state=0 (New) OR due <= end of today UTC
      const todayDate = new Date();
      const endOfToday = new Date(
        Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate() + 1),
      );
      const endOfTodayUnix = Math.floor(endOfToday.getTime() / 1000);

      const dueTodayRows = sqlite
        .prepare(
          `SELECT repertoire_id, COUNT(*) as cnt
           FROM repertoire_cards
           WHERE repertoire_id IN (${placeholders})
             AND (state = 0 OR due <= ?)
           GROUP BY repertoire_id`,
        )
        .all(...repIds, endOfTodayUnix) as DueTodayRow[];

      // 4. Mastered count per repertoire: state=2 (Review) AND stability > 30
      const masteredRows = sqlite
        .prepare(
          `SELECT repertoire_id, COUNT(*) as cnt
           FROM repertoire_cards
           WHERE repertoire_id IN (${placeholders})
             AND state = 2 AND stability > 30
           GROUP BY repertoire_id`,
        )
        .all(...repIds) as MasteredCountRow[];

      // 5. Retention data: cards with state >= 1, stability > 0, last_review not null
      const retentionRows = sqlite
        .prepare(
          `SELECT repertoire_id, stability, last_review
           FROM repertoire_cards
           WHERE repertoire_id IN (${placeholders})
             AND state >= 1 AND stability > 0 AND last_review IS NOT NULL`,
        )
        .all(...repIds) as RetentionRow[];

      // Build lookup maps
      const stateCountMap = new Map<number, Map<number, number>>();
      for (const row of stateCountRows) {
        if (!stateCountMap.has(row.repertoire_id)) {
          stateCountMap.set(row.repertoire_id, new Map());
        }
        stateCountMap.get(row.repertoire_id)!.set(row.state, row.cnt);
      }

      const dueTodayMap = new Map<number, number>();
      for (const row of dueTodayRows) {
        dueTodayMap.set(row.repertoire_id, row.cnt);
      }

      const masteredMap = new Map<number, number>();
      for (const row of masteredRows) {
        masteredMap.set(row.repertoire_id, row.cnt);
      }

      const retentionByRep = new Map<number, RetentionRow[]>();
      for (const row of retentionRows) {
        if (!retentionByRep.has(row.repertoire_id)) {
          retentionByRep.set(row.repertoire_id, []);
        }
        retentionByRep.get(row.repertoire_id)!.push(row);
      }

      // 6. Build per-repertoire summaries
      const nowDays = nowUnix / 86400;
      let totalDueToday = 0;
      let totalCards = 0;
      let totalWeightedRetention = 0;
      let totalRetentionCards = 0;

      const repertoireSummaries: RepertoireTrainingSummary[] = repertoires.map((rep) => {
        const states = stateCountMap.get(rep.id) ?? new Map();
        const newCount = states.get(0) ?? 0;
        const learningCount = states.get(1) ?? 0;
        const reviewCount = states.get(2) ?? 0;
        const relearningCount = states.get(3) ?? 0;
        const repTotalCards = newCount + learningCount + reviewCount + relearningCount;
        const dueToday = dueTodayMap.get(rep.id) ?? 0;
        const masteredCount = masteredMap.get(rep.id) ?? 0;

        // Compute retention for this repertoire using FSRS formula
        const repRetentionCards = retentionByRep.get(rep.id) ?? [];
        let retention: number | null = null;
        if (repRetentionCards.length > 0) {
          let totalRet = 0;
          for (const card of repRetentionCards) {
            const lastReviewDays = card.last_review / 86400;
            const elapsedDays = Math.max(0, nowDays - lastReviewDays);
            const r = Math.pow(0.9, elapsedDays / card.stability);
            totalRet += r;
          }
          retention = totalRet / repRetentionCards.length;
          totalWeightedRetention += totalRet;
          totalRetentionCards += repRetentionCards.length;
        }

        totalDueToday += dueToday;
        totalCards += repTotalCards;

        return {
          id: rep.id,
          name: rep.name,
          color: rep.color as "white" | "black",
          totalCards: repTotalCards,
          dueToday,
          newCount,
          learningCount,
          reviewCount: reviewCount + relearningCount,
          masteredCount,
          retention,
        };
      });

      const overallRetention =
        totalRetentionCards > 0 ? totalWeightedRetention / totalRetentionCards : null;

      // 7. Review history (last 180 days)
      const cutoff180 = nowUnix - 180 * 86400;
      const reviewHistoryRows = sqlite
        .prepare(
          `SELECT date(reviewed_at, 'unixepoch') as review_date, COUNT(*) as cnt
           FROM review_logs
           WHERE card_id IN (
             SELECT id FROM repertoire_cards WHERE repertoire_id IN (${placeholders})
           )
           AND reviewed_at >= ?
           GROUP BY review_date
           ORDER BY review_date ASC`,
        )
        .all(...repIds, cutoff180) as ReviewHistoryRow[];

      const reviewHistory: ReviewHistoryEntry[] = reviewHistoryRows.map((row) => ({
        date: row.review_date,
        count: row.cnt,
      }));

      // 8. Current streak (consecutive days with reviews)
      const reviewDates = sqlite
        .prepare(
          `SELECT DISTINCT date(reviewed_at, 'unixepoch') as review_date
           FROM review_logs
           WHERE card_id IN (
             SELECT id FROM repertoire_cards WHERE repertoire_id IN (${placeholders})
           )
           ORDER BY review_date DESC`,
        )
        .all(...repIds) as ReviewDateRow[];

      let currentStreak = 0;
      if (reviewDates.length > 0) {
        const reviewDateSet = new Set(reviewDates.map((r) => r.review_date));
        const checkDate = new Date();
        let dateStr = formatDateUTC(checkDate);

        // If today doesn't have reviews, check starting from yesterday
        if (!reviewDateSet.has(dateStr)) {
          checkDate.setUTCDate(checkDate.getUTCDate() - 1);
          dateStr = formatDateUTC(checkDate);
        }

        while (reviewDateSet.has(dateStr)) {
          currentStreak++;
          checkDate.setUTCDate(checkDate.getUTCDate() - 1);
          dateStr = formatDateUTC(checkDate);
        }
      }

      // 9. Learning velocity (last 30 days)
      // Count distinct cards that had their first review (state=0 in review_logs)
      const cutoff30 = nowUnix - 30 * 86400;
      const velocityRows = sqlite
        .prepare(
          `SELECT date(reviewed_at, 'unixepoch') as review_date, COUNT(DISTINCT card_id) as cnt
           FROM review_logs
           WHERE card_id IN (
             SELECT id FROM repertoire_cards WHERE repertoire_id IN (${placeholders})
           )
           AND state = 0
           AND reviewed_at >= ?
           GROUP BY review_date
           ORDER BY review_date ASC`,
        )
        .all(...repIds, cutoff30) as VelocityRow[];

      const learningVelocity: LearningVelocityEntry[] = velocityRows.map((row) => ({
        date: row.review_date,
        newCardsLearned: row.cnt,
      }));

      return reply.code(200).send({
        totalDueToday,
        totalCards,
        overallRetention,
        currentStreak,
        repertoires: repertoireSummaries,
        reviewHistory,
        learningVelocity,
      });
    },
  );

  app.get<{ Reply: DifficultPositionsResponse | ErrorResponse }>(
    "/difficult",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.userId!;

      const rows = sqlite
        .prepare(
          `SELECT
             rc.id,
             rc.repertoire_id,
             r.name as repertoire_name,
             rc.position_fen,
             rc.move_san,
             rc.move_uci,
             rc.lapses,
             rc.stability,
             rc.last_review
           FROM repertoire_cards rc
           JOIN repertoires r ON r.id = rc.repertoire_id
           WHERE r.user_id = ? AND rc.lapses > 0
           ORDER BY rc.lapses DESC
           LIMIT 10`,
        )
        .all(userId) as DifficultCardRow[];

      const result: DifficultPositionsResponse = rows.map((row) => ({
        cardId: row.id,
        repertoireId: row.repertoire_id,
        repertoireName: row.repertoire_name,
        positionFen: row.position_fen,
        moveSan: row.move_san,
        moveUci: row.move_uci,
        lapses: row.lapses,
        stability: row.stability,
        lastReview: row.last_review,
      }));

      return reply.code(200).send(result);
    },
  );
}

export const dashboardRoutesPlugin = fp(dashboardRoutes, {
  name: "dashboard-routes",
  dependencies: ["authentication"],
  encapsulate: true,
});
