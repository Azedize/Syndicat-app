import { Router } from "express";
import { db } from "@workspace/db";
import { nationalRankingsTable, syndicatesTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { computeScoreForSyndicate } from "./rankings.service.js";
/**
 * P12 — National Ranking System
 * - Scoring engine: collection rate, incident resolution, documentation, meeting compliance, satisfaction
 * - POST /rankings/compute — admin triggers monthly computation
 * - GET /rankings — leaderboard (paginated, filterable by year/month/region)
 * - GET /rankings/my-syndicate — current syndicate's trend
 */

const router = Router();

// ─── Scoring helpers ──────────────────────────────────────────────────────────

// POST /rankings/compute — compute and persist rankings for a month
// This is a platform-wide write: a syndicate administrator must never be able
// to trigger reads/upserts/rank changes for every other syndicate.
router.post(
  "/rankings/compute",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const now = new Date();
      const month = parseInt((req.body.month ?? now.getMonth() + 1).toString());
      const year = parseInt((req.body.year ?? now.getFullYear()).toString());

      const syndicates = await db
        .select({ id: syndicatesTable.id, region: syndicatesTable.city })
        .from(syndicatesTable);

      const results: Array<{ syndicateId: string; totalScore: string }> = [];

      for (const syndicate of syndicates) {
        try {
          const scores = await computeScoreForSyndicate(
            syndicate.id,
            month,
            year,
          );
          if (!scores) continue;

          // Upsert
          await db
            .insert(nationalRankingsTable)
            .values({
              syndicateId: syndicate.id,
              month,
              year,
              region: syndicate.region ?? "",
              ...scores,
            })
            .onConflictDoUpdate({
              target: [
                nationalRankingsTable.syndicateId,
                nationalRankingsTable.month,
                nationalRankingsTable.year,
              ],
              set: scores,
            });

          results.push({
            syndicateId: syndicate.id,
            totalScore: scores.totalScore,
          });
        } catch (_) {
          // Skip failed syndicates silently
        }
      }

      // Assign global ranks by score desc
      results.sort(
        (a, b) => parseFloat(b.totalScore) - parseFloat(a.totalScore),
      );
      for (let i = 0; i < results.length; i++) {
        await db
          .update(nationalRankingsTable)
          .set({ rank: i + 1 })
          .where(
            and(
              eq(nationalRankingsTable.syndicateId, results[i].syndicateId),
              eq(nationalRankingsTable.month, month),
              eq(nationalRankingsTable.year, year),
            ),
          );
      }

      res.json({
        message: `Classement calculé pour ${month}/${year}`,
        computed: results.length,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// GET /rankings — leaderboard
router.get("/rankings", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt((req.query.month ?? now.getMonth() + 1) as string);
    const year = parseInt((req.query.year ?? now.getFullYear()) as string);
    const region = req.query.region as string | undefined;
    const limit = Math.min(100, parseInt((req.query.limit as string) ?? "50"));
    const offset = parseInt((req.query.offset as string) ?? "0");

    const conditions: any[] = [
      eq(nationalRankingsTable.month, month),
      eq(nationalRankingsTable.year, year),
    ];
    if (region) conditions.push(eq(nationalRankingsTable.region, region));

    const rows = await db
      .select({
        ranking: nationalRankingsTable,
        syndicateName: syndicatesTable.name,
        syndicateCity: syndicatesTable.city,
      })
      .from(nationalRankingsTable)
      .leftJoin(
        syndicatesTable,
        eq(nationalRankingsTable.syndicateId, syndicatesTable.id),
      )
      .where(and(...conditions))
      .orderBy(nationalRankingsTable.rank)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(nationalRankingsTable)
      .where(and(...conditions));

    res.json({
      data: rows.map((r) => ({
        ...r.ranking,
        syndicateName: r.syndicateName,
        city: r.syndicateCity,
      })),
      total,
      month,
      year,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /rankings/my-syndicate — trend for current syndicate (last 12 months)
router.get("/rankings/my-syndicate", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    // A missing scope is an authorization failure, not an empty trend. Returning
    // an empty success here hides malformed/stale tokens and makes the caller
    // unable to distinguish "no rankings yet" from "no syndicate context".
    if (!user.syndicateId) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }

    const rows = await db
      .select()
      .from(nationalRankingsTable)
      .where(eq(nationalRankingsTable.syndicateId, user.syndicateId))
      .orderBy(
        desc(nationalRankingsTable.year),
        desc(nationalRankingsTable.month),
      )
      .limit(12);

    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
