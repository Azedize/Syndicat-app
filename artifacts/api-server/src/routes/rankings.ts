/**
 * P12 — National Ranking System
 * - Scoring engine: collection rate, incident resolution, documentation, meeting compliance, satisfaction
 * - POST /rankings/compute — admin triggers monthly computation
 * - GET /rankings — leaderboard (paginated, filterable by year/month/region)
 * - GET /rankings/my-syndicate — current syndicate's trend
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  nationalRankingsTable,
  syndicatesTable,
  appelsDeFondsTable,
  sinistresTable,
  documentsTable,
  meetingsTable,
  buildingsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// ─── Scoring helpers ──────────────────────────────────────────────────────────

async function computeScoreForSyndicate(syndicateId: string, month: number, year: number) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthStart = `${monthStr}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().split("T")[0];

  const buildings = await db
    .select({ id: buildingsTable.id })
    .from(buildingsTable)
    .where(eq(buildingsTable.syndicateId, syndicateId));
  const buildingIds = buildings.map((b) => b.id).filter((id): id is string => id != null);
  if (!buildingIds.length) return null;

  // 1. Collection rate — % of appels paid (period matches month)
  const appelsAll = await db
    .select({ status: appelsDeFondsTable.status, amount: appelsDeFondsTable.amount })
    .from(appelsDeFondsTable)
    .where(
      and(
        inArray(appelsDeFondsTable.buildingId, buildingIds),
        sql`${appelsDeFondsTable.period} LIKE ${monthStr + "%"}`
      )
    );
  const totalAmt = appelsAll.reduce((s, a) => s + parseFloat(a.amount ?? "0"), 0);
  const paidAmt = appelsAll.filter((a) => a.status === "paid").reduce((s, a) => s + parseFloat(a.amount ?? "0"), 0);
  const collectionRate = totalAmt > 0 ? (paidAmt / totalAmt) * 100 : 100;

  // 2. Incident resolution rate — % sinistres resolved/closed
  const sinistresAll = await db
    .select({ status: sinistresTable.status })
    .from(sinistresTable)
    .where(inArray(sinistresTable.buildingId, buildingIds));
  const totalSin = sinistresAll.length;
  const resolvedSin = sinistresAll.filter((s) => ["resolved", "closed"].includes(s.status ?? "")).length;
  const incidentResolutionRate = totalSin > 0 ? (resolvedSin / totalSin) * 100 : 100;

  // 3. Documentation score — docs uploaded in month vs target of 5
  const docsCount = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.syndicateId, syndicateId),
        sql`${documentsTable.createdAt} >= ${monthStart}`,
        sql`${documentsTable.createdAt} <= ${monthEnd}`
      )
    );
  const documentationScore = Math.min(100, (docsCount.length / 5) * 100);

  // 4. Meeting compliance — AGs held in this year so far vs expected (1 per quarter)
  const meetingsHeld = await db
    .select({ id: meetingsTable.id })
    .from(meetingsTable)
    .where(
      and(
        eq(meetingsTable.syndicateId, syndicateId),
        sql`EXTRACT(YEAR FROM ${meetingsTable.createdAt}) = ${year}`,
        sql`${meetingsTable.status} IN ('completed', 'held')`
      )
    );
  const expectedMeetings = Math.ceil(month / 3); // 1 per quarter
  const meetingComplianceScore = Math.min(100, (meetingsHeld.length / expectedMeetings) * 100);

  // 5. Member satisfaction — placeholder (50/100) until reviews link to syndicates
  const memberSatisfaction = 50;

  // Weighted score
  const totalScore =
    collectionRate * 0.35 +
    incidentResolutionRate * 0.25 +
    documentationScore * 0.15 +
    meetingComplianceScore * 0.15 +
    memberSatisfaction * 0.10;

  return {
    collectionRate: collectionRate.toFixed(2),
    incidentResolutionRate: incidentResolutionRate.toFixed(2),
    documentationScore: documentationScore.toFixed(2),
    meetingComplianceScore: meetingComplianceScore.toFixed(2),
    memberSatisfaction: memberSatisfaction.toFixed(2),
    totalScore: totalScore.toFixed(2),
  };
}

// POST /rankings/compute — compute and persist rankings for a month
router.post("/rankings/compute", requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt((req.body.month ?? now.getMonth() + 1).toString());
    const year = parseInt((req.body.year ?? now.getFullYear()).toString());

    const syndicates = await db.select({ id: syndicatesTable.id, region: syndicatesTable.city }).from(syndicatesTable);

    const results: Array<{ syndicateId: string; totalScore: string }> = [];

    for (const syndicate of syndicates) {
      try {
        const scores = await computeScoreForSyndicate(syndicate.id, month, year);
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
            target: [nationalRankingsTable.syndicateId, nationalRankingsTable.month, nationalRankingsTable.year],
            set: scores,
          });

        results.push({ syndicateId: syndicate.id, totalScore: scores.totalScore });
      } catch (_) {
        // Skip failed syndicates silently
      }
    }

    // Assign global ranks by score desc
    results.sort((a, b) => parseFloat(b.totalScore) - parseFloat(a.totalScore));
    for (let i = 0; i < results.length; i++) {
      await db
        .update(nationalRankingsTable)
        .set({ rank: i + 1 })
        .where(
          and(
            eq(nationalRankingsTable.syndicateId, results[i].syndicateId),
            eq(nationalRankingsTable.month, month),
            eq(nationalRankingsTable.year, year)
          )
        );
    }

    res.json({ message: `Classement calculé pour ${month}/${year}`, computed: results.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /rankings — leaderboard
router.get("/rankings", requireAuth, async (req, res) => {
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
      .leftJoin(syndicatesTable, eq(nationalRankingsTable.syndicateId, syndicatesTable.id))
      .where(and(...conditions))
      .orderBy(nationalRankingsTable.rank)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(nationalRankingsTable)
      .where(and(...conditions));

    res.json({
      data: rows.map((r) => ({ ...r.ranking, syndicateName: r.syndicateName, city: r.syndicateCity })),
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
    if (!user.syndicateId) return void res.json({ data: [] });

    const rows = await db
      .select()
      .from(nationalRankingsTable)
      .where(eq(nationalRankingsTable.syndicateId, user.syndicateId))
      .orderBy(desc(nationalRankingsTable.year), desc(nationalRankingsTable.month))
      .limit(12);

    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
