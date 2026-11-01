import { db } from "@workspace/db";
import {
  appelsDeFondsTable,
  sinistresTable,
  documentsTable,
  meetingsTable,
  buildingsTable,
  productsTable,
  reviewsTable,
} from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { toCents } from "../../lib/treasury.js";

export async function computeScoreForSyndicate(
  syndicateId: string,
  month: number,
  year: number,
) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthStart = `${monthStr}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().split("T")[0];

  const buildings = await db
    .select({ id: buildingsTable.id })
    .from(buildingsTable)
    .where(eq(buildingsTable.syndicateId, syndicateId));
  const buildingIds = buildings
    .map((b) => b.id)
    .filter((id): id is string => id != null);
  if (!buildingIds.length) return null;

  // 1. Collection rate — % of appels paid (period matches month)
  const appelsAll = await db
    .select({
      status: appelsDeFondsTable.status,
      amount: appelsDeFondsTable.amount,
    })
    .from(appelsDeFondsTable)
    .where(
      and(
        inArray(appelsDeFondsTable.buildingId, buildingIds),
        sql`${appelsDeFondsTable.period} LIKE ${monthStr + "%"}`,
      ),
    );
  const totalAmt = appelsAll.reduce(
    (s, a) => s + parseFloat(a.amount ?? "0"),
    0,
  );
  const paidAmt = appelsAll
    .filter((a) => a.status === "paid")
    .reduce((s, a) => s + toCents(a.amount), 0) / 100;
  const collectionRate = totalAmt > 0 ? (paidAmt / totalAmt) * 100 : 100;

  // 2. Incident resolution rate — % sinistres resolved/closed
  const sinistresAll = await db
    .select({ status: sinistresTable.status })
    .from(sinistresTable)
    .where(inArray(sinistresTable.buildingId, buildingIds));
  const totalSin = sinistresAll.length;
  const resolvedSin = sinistresAll.filter((s) =>
    ["resolved", "closed"].includes(s.status ?? ""),
  ).length;
  const incidentResolutionRate =
    totalSin > 0 ? (resolvedSin / totalSin) * 100 : 100;

  // 3. Documentation score — docs uploaded in month vs target of 5
  const docsCount = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.syndicateId, syndicateId),
        sql`${documentsTable.createdAt} >= ${monthStart}`,
        sql`${documentsTable.createdAt} <= ${monthEnd}`,
      ),
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
        sql`${meetingsTable.status} IN ('completed', 'held')`,
      ),
    );
  const expectedMeetings = Math.ceil(month / 3); // 1 per quarter
  const meetingComplianceScore = Math.min(
    100,
    (meetingsHeld.length / expectedMeetings) * 100,
  );

  // 5. Member satisfaction — marketplace reviews are the only persisted
  // satisfaction signal currently linked to a syndicate. Do not substitute a
  // synthetic score when a syndicate has no reviews yet.
  const [satisfactionRow] = await db
    .select({
      averageRating: sql<string | null>`avg(${reviewsTable.rating})`,
      reviewCount: sql<number>`count(${reviewsTable.id})`,
    })
    .from(reviewsTable)
    .innerJoin(productsTable, eq(reviewsTable.productId, productsTable.id))
    .where(
      and(
        eq(productsTable.syndicateId, syndicateId),
        eq(productsTable.status, "approved"),
      ),
    );
  const reviewCount = Number(satisfactionRow?.reviewCount ?? 0);
  const memberSatisfaction =
    reviewCount > 0
      ? (Number(satisfactionRow?.averageRating ?? 0) / 5) * 100
      : null;

  // Normalize the weighted score over available persisted criteria. This
  // prevents missing review data from silently becoming a 50/100 score.
  const weightedCriteria = [
    { value: collectionRate, weight: 0.35 },
    { value: incidentResolutionRate, weight: 0.25 },
    { value: documentationScore, weight: 0.15 },
    { value: meetingComplianceScore, weight: 0.15 },
    ...(memberSatisfaction == null
      ? []
      : [{ value: memberSatisfaction, weight: 0.1 }]),
  ];
  const availableWeight = weightedCriteria.reduce(
    (sum, criterion) => sum + criterion.weight,
    0,
  );
  const totalScore =
    weightedCriteria.reduce(
      (sum, criterion) => sum + criterion.value * criterion.weight,
      0,
    ) / availableWeight;

  return {
    collectionRate: collectionRate.toFixed(2),
    incidentResolutionRate: incidentResolutionRate.toFixed(2),
    documentationScore: documentationScore.toFixed(2),
    meetingComplianceScore: meetingComplianceScore.toFixed(2),
    memberSatisfaction: (memberSatisfaction ?? 0).toFixed(2),
    totalScore: totalScore.toFixed(2),
  };
}
