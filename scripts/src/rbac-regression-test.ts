/**
 * Cross-syndicate authorization regression suite.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run rbac-regression:test
 *
 * The suite talks to the running API over HTTP and uses the development
 * database only to discover fixture IDs and mint short-lived test JWTs.
 * It creates one temporary storage ownership row because seeded databases
 * may not contain a generic private upload, then removes that row in finally.
 */
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  budgetsTable,
  buildingsTable,
  conseilSyndicalTable,
  documentsTable,
  electionsTable,
  meetingsTable,
  storageObjectsTable,
  syndicatesTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:80/api").replace(
  /\/$/,
  "",
);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required to mint regression-test tokens");
}

type User = typeof usersTable.$inferSelect;
type Check = {
  name: string;
  pass: boolean;
  detail: string;
};

const checks: Check[] = [];

function record(name: string, pass: boolean, detail: string): void {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`);
}

function tokenFor(user: User, omitSyndicate = false): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      ...(omitSyndicate ? {} : { syndicateId: user.syndicateId ?? undefined }),
      name: user.name,
    },
    JWT_SECRET!,
    { expiresIn: "15m" },
  );
}

async function api(
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Authorization checks only need the HTTP status.
  }
  return { status: response.status, json };
}

function expectStatus(
  name: string,
  actual: number,
  expected: number | number[],
): void {
  const values = Array.isArray(expected) ? expected : [expected];
  record(
    name,
    values.includes(actual),
    `expected ${values.join(" or ")}, received ${actual}`,
  );
}

function requireFixture<T>(
  label: string,
  value: T | undefined,
): asserts value is T {
  if (!value) {
    throw new Error(`Fixture missing: ${label}`);
  }
}

async function main(): Promise<void> {
  const [users, syndicates] = await Promise.all([
    db.select().from(usersTable),
    db.select({ id: syndicatesTable.id }).from(syndicatesTable),
  ]);

  const superAdmin = users.find((user) => user.role === "super_admin");
  const adminA = users.find(
    (user) => user.role === "syndicate_admin" && !!user.syndicateId,
  );
  const adminB = users.find(
    (user) =>
      user.role === "syndicate_admin" &&
      !!user.syndicateId &&
      user.syndicateId !== adminA?.syndicateId,
  );
  requireFixture("super_admin", superAdmin);
  requireFixture("syndicate_admin in syndicate A", adminA);
  requireFixture("syndicate_admin in syndicate B", adminB);
  requireFixture(
    "two distinct syndicates",
    syndicates.find((s) => s.id === adminA.syndicateId) &&
      syndicates.find((s) => s.id === adminB.syndicateId),
  );

  const memberA =
    users.find(
      (user) =>
        user.role === "member" && user.syndicateId === adminA.syndicateId,
    ) ?? adminA;
  const memberB =
    users.find(
      (user) =>
        user.role === "member" && user.syndicateId === adminB.syndicateId,
    ) ?? adminB;

  const [
    electionA,
    electionB,
    meetingA,
    meetingB,
    buildingA,
    buildingB,
    documentA,
    documentB,
    mandateA,
  ] = await Promise.all([
    db
      .select({ id: electionsTable.id })
      .from(electionsTable)
      .where(eq(electionsTable.syndicateId, adminA.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: electionsTable.id })
      .from(electionsTable)
      .where(eq(electionsTable.syndicateId, adminB.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: meetingsTable.id })
      .from(meetingsTable)
      .where(eq(meetingsTable.syndicateId, adminA.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: meetingsTable.id })
      .from(meetingsTable)
      .where(eq(meetingsTable.syndicateId, adminB.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.syndicateId, adminA.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.syndicateId, adminB.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(eq(documentsTable.syndicateId, adminA.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(eq(documentsTable.syndicateId, adminB.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: conseilSyndicalTable.id })
      .from(conseilSyndicalTable)
      .where(eq(conseilSyndicalTable.syndicateId, adminA.syndicateId!))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  requireFixture("election in syndicate A", electionA);
  requireFixture("election in syndicate B", electionB);
  requireFixture("AG meeting in syndicate A", meetingA);
  requireFixture("AG meeting in syndicate B", meetingB);
  requireFixture("building in syndicate A", buildingA);
  requireFixture("building in syndicate B", buildingB);
  requireFixture("document in syndicate A", documentA);
  requireFixture("document in syndicate B", documentB);
  requireFixture("mandate in syndicate A", mandateA);

  const budgetA = await db
    .select({ id: budgetsTable.id })
    .from(budgetsTable)
    .where(eq(budgetsTable.buildingId, buildingA.id))
    .limit(1)
    .then((rows) => rows[0]);
  const budgetB = await db
    .select({ id: budgetsTable.id })
    .from(budgetsTable)
    .where(eq(budgetsTable.buildingId, buildingB.id))
    .limit(1)
    .then((rows) => rows[0]);
  requireFixture("budget in syndicate A", budgetA);
  requireFixture("budget in syndicate B", budgetB);

  const tokens = {
    adminA: tokenFor(adminA),
    adminB: tokenFor(adminB),
    memberA: tokenFor(memberA),
    memberB: tokenFor(memberB),
    superAdmin: tokenFor(superAdmin),
    unscopedAdmin: tokenFor(adminA, true),
  };

  const temporaryObjectPath = `/objects/rbac-regression/${crypto.randomUUID()}.png`;
  const [temporaryObject] = await db
    .insert(storageObjectsTable)
    .values({
      objectPath: temporaryObjectPath,
      ownerId: adminA.id,
      syndicateId: adminA.syndicateId,
      originalName: "rbac-regression.png",
      contentType: "image/png",
      size: 1,
    })
    .returning({ id: storageObjectsTable.id });

  try {
    // Authentication boundary.
    expectStatus(
      "unauthenticated elections",
      (await api("/elections")).status,
      401,
    );
    expectStatus(
      "unauthenticated AG list",
      (await api("/ag-meetings")).status,
      401,
    );
    expectStatus(
      "unauthenticated statistics",
      (await api("/statistics/hr")).status,
      401,
    );
    expectStatus(
      "unauthenticated organigramme",
      (await api("/organigramme")).status,
      401,
    );
    expectStatus(
      "unauthenticated budgets",
      (await api("/budgets")).status,
      401,
    );
    expectStatus(
      "unauthenticated document detail",
      (await api(`/documents/${documentA.id}`)).status,
      401,
    );
    expectStatus(
      "unauthenticated private object",
      (
        await api(
          `/storage/objects${temporaryObjectPath.slice("/objects".length)}`,
        )
      ).status,
      401,
    );

    // Missing JWT scope must fail closed across scoped list routes.
    expectStatus(
      "unscoped manager elections",
      (await api("/elections", { token: tokens.unscopedAdmin })).status,
      403,
    );
    expectStatus(
      "unscoped manager AG list",
      (await api("/ag-meetings", { token: tokens.unscopedAdmin })).status,
      403,
    );
    expectStatus(
      "unscoped manager statistics",
      (await api("/statistics/hr", { token: tokens.unscopedAdmin })).status,
      403,
    );
    expectStatus(
      "unscoped manager budgets",
      (await api("/budgets", { token: tokens.unscopedAdmin })).status,
      403,
    );
    expectStatus(
      "unscoped manager document",
      (await api(`/documents/${documentA.id}`, { token: tokens.unscopedAdmin }))
        .status,
      403,
    );

    // Cross-syndicate reads and mutations.
    expectStatus(
      "cross-syndicate election detail",
      (await api(`/elections/${electionA.id}`, { token: tokens.adminB }))
        .status,
      403,
    );
    expectStatus(
      "cross-syndicate election transition",
      (
        await api(`/elections/${electionA.id}/transition`, {
          method: "POST",
          token: tokens.adminB,
          body: { action: "cancel", reason: "RBAC regression test" },
        })
      ).status,
      403,
    );
    expectStatus(
      "cross-syndicate election proxy revocation",
      (
        await api(`/elections/${electionA.id}/delegate`, {
          method: "DELETE",
          token: tokens.adminB,
        })
      ).status,
      403,
    );
    expectStatus(
      "cross-syndicate mandate resignation",
      (
        await api(`/elections/mandates/${mandateA.id}/resign`, {
          method: "POST",
          token: tokens.memberB,
          body: { reason: "RBAC regression test" },
        })
      ).status,
      403,
    );
    expectStatus(
      "cross-syndicate AG detail",
      (await api(`/ag-meetings/${meetingA.id}`, { token: tokens.memberB }))
        .status,
      403,
    );
    expectStatus(
      "cross-syndicate budget detail",
      (await api(`/budgets/${budgetA.id}`, { token: tokens.adminB })).status,
      403,
    );
    expectStatus(
      "cross-syndicate document detail",
      (await api(`/documents/${documentA.id}`, { token: tokens.adminB }))
        .status,
      403,
    );
    expectStatus(
      "cross-syndicate private object",
      (
        await api(
          `/storage/objects${temporaryObjectPath.slice("/objects".length)}`,
          { token: tokens.adminB },
        )
      ).status,
      403,
    );

    // Targeted Super Admin reads require explicit supervision.
    expectStatus(
      "Super Admin statistics without supervision",
      (
        await api(`/statistics/hr?syndicateId=${adminA.syndicateId}`, {
          token: tokens.superAdmin,
        })
      ).status,
      403,
    );
    expectStatus(
      "Super Admin statistics with supervision",
      (
        await api(
          `/statistics/hr?syndicateId=${adminA.syndicateId}&supervision=true`,
          { token: tokens.superAdmin },
        )
      ).status,
      200,
    );
    expectStatus(
      "Super Admin organigramme without supervision",
      (
        await api(`/organigramme?syndicateId=${adminA.syndicateId}`, {
          token: tokens.superAdmin,
        })
      ).status,
      403,
    );
    expectStatus(
      "Super Admin organigramme with supervision",
      (
        await api(
          `/organigramme?syndicateId=${adminA.syndicateId}&supervision=true`,
          { token: tokens.superAdmin },
        )
      ).status,
      200,
    );
    expectStatus(
      "Super Admin AG filter without supervision",
      (
        await api(`/ag-meetings?syndicateId=${adminA.syndicateId}`, {
          token: tokens.superAdmin,
        })
      ).status,
      403,
    );
    expectStatus(
      "Super Admin AG filter with supervision",
      (
        await api(
          `/ag-meetings?syndicateId=${adminA.syndicateId}&supervision=true`,
          { token: tokens.superAdmin },
        )
      ).status,
      200,
    );

    // Positive same-syndicate access, plus private-object ownership behavior.
    expectStatus(
      "same-syndicate election detail",
      (await api(`/elections/${electionA.id}`, { token: tokens.adminA }))
        .status,
      200,
    );
    expectStatus(
      "same-syndicate AG detail",
      (await api(`/ag-meetings/${meetingA.id}`, { token: tokens.adminA }))
        .status,
      200,
    );
    expectStatus(
      "same-syndicate budget detail",
      (await api(`/budgets/${budgetA.id}`, { token: tokens.adminA })).status,
      200,
    );
    expectStatus(
      "same-syndicate document detail",
      (await api(`/documents/${documentA.id}`, { token: tokens.adminA }))
        .status,
      200,
    );
    const ownerObjectStatus = (
      await api(
        `/storage/objects${temporaryObjectPath.slice("/objects".length)}`,
        { token: tokens.adminA },
      )
    ).status;
    record(
      "same-syndicate private object owner",
      ownerObjectStatus !== 401 && ownerObjectStatus !== 403,
      `expected authorized request (200 or file-missing 404), received ${ownerObjectStatus}`,
    );
  } finally {
    if (temporaryObject?.id) {
      await db
        .delete(storageObjectsTable)
        .where(eq(storageObjectsTable.id, temporaryObject.id));
    }
  }

  const failed = checks.filter((check) => !check.pass);
  console.log(
    JSON.stringify(
      {
        total: checks.length,
        passed: checks.length - failed.length,
        failed: failed.length,
        checks,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("RBAC regression suite failed to start:", error);
  process.exitCode = 1;
});
