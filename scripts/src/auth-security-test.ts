/**
 * Authentication & session security regression suite.
 *
 * Usage (API must be running):
 *   API_BASE_URL=http://localhost:5000/api pnpm --filter @workspace/scripts run auth-security:test
 *
 * Creates two throw-away users directly in the database (no email is sent),
 * exercises login / refresh rotation / reuse detection / logout / forced
 * password change / password reset / suspension / JWT tampering, and deletes
 * everything it created in `finally`.
 *
 * Note: /api/auth is rate-limited (20 requests / 15 min / IP); the suite uses
 * about 15 auth calls, so avoid running it repeatedly within 15 minutes.
 */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  auditLogsTable,
  otpTokensTable,
  passwordResetTokensTable,
  refreshTokensTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const ATLAS = "syn_residence_atlas";
const RUN = Date.now();
const NORMAL_EMAIL = `auth-test-${RUN}@example.invalid`;
const INVITED_EMAIL = `auth-invited-${RUN}@example.invalid`;
const PASSWORD = "Correct-Horse-9";
const TEMP_PASSWORD = "Temp-Password-1";
const NEW_PASSWORD = "Brand-New-Pass-7";
// Reserved-looking test number; the suite never triggers a real SMS to it.
const ONBOARDING_PHONE_LOCAL = "0699" + String(RUN).slice(-6);
const ONBOARDING_PHONE_E164 = "+212" + ONBOARDING_PHONE_LOCAL.slice(1);

const results: { name: string; pass: boolean; detail: string }[] = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`);
}
function expectStatus(name: string, actual: number, expected: number) {
  record(name, actual === expected, `expected ${expected}, received ${actual}`);
}
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const tempHash = await bcrypt.hash(TEMP_PASSWORD, 10);
  const [normal] = await db
    .insert(usersTable)
    .values({ name: "Auth Test", email: NORMAL_EMAIL, passwordHash: hash, role: "member", status: "active", syndicateId: ATLAS })
    .returning();
  const [invited] = await db
    .insert(usersTable)
    .values({
      name: "Invited Test",
      email: INVITED_EMAIL,
      passwordHash: tempHash,
      mustChangePassword: true,
      role: "treasurer",
      status: "active",
      syndicateId: ATLAS,
    })
    .returning();
  const [founder] = await db
    .insert(usersTable)
    .values({ name: "Founder Test", email: `auth-founder-${RUN}@example.invalid`, passwordHash: hash, role: "syndicate_admin", status: "active" })
    .returning();
  let createdSyndicateId: string | null = null;

  try {
    // ── Login ────────────────────────────────────────────────────────────
    expectStatus("wrong password rejected", (await call("/auth/login", { method: "POST", body: { email: NORMAL_EMAIL, password: "nope-nope" } })).status, 401);
    expectStatus("unknown email rejected with same status", (await call("/auth/login", { method: "POST", body: { email: `ghost-${RUN}@example.invalid`, password: "nope-nope" } })).status, 401);
    const login = await call("/auth/login", { method: "POST", body: { email: NORMAL_EMAIL.toUpperCase(), password: PASSWORD } });
    expectStatus("valid login (case-insensitive email)", login.status, 200);
    const access = login.json?.data?.token as string;
    const refresh1 = login.json?.data?.refreshToken as string;
    record("login response never exposes the password hash", login.json?.data?.user?.passwordHash === undefined, "passwordHash absent");

    const [stored] = await db.select().from(refreshTokensTable).where(eq(refreshTokensTable.userId, normal.id));
    record(
      "refresh token stored as SHA-256 digest, not in clear",
      stored?.token === sha256(refresh1) && stored?.token !== refresh1,
      `stored=${stored?.token?.slice(0, 12)}…`,
    );

    // ── Access token validation ──────────────────────────────────────────
    expectStatus("authenticated request allowed", (await call("/auth/me", { token: access })).status, 200);
    expectStatus("missing token rejected", (await call("/auth/me")).status, 401);

    // ── Download tickets (no session token in URLs) ──────────────────────
    const ticketRes = await call("/auth/file-ticket", { method: "POST", token: access });
    expectStatus("download ticket issued to an authenticated user", ticketRes.status, 200);
    const ticket = ticketRes.json?.data?.ticket as string;
    expectStatus("ticket accepted in ?token= on GET", (await call(`/auth/me?token=${encodeURIComponent(ticket)}`)).status, 200);
    expectStatus("session token refused in ?token=", (await call(`/auth/me?token=${encodeURIComponent(access)}`)).status, 401);
    expectStatus("ticket refused as a bearer token", (await call("/auth/me", { token: ticket })).status, 401);
    expectStatus("ticket refused for non-GET requests", (await call(`/auth/file-ticket?token=${encodeURIComponent(ticket)}`, { method: "POST" })).status, 401);
    const [h, p] = access.split(".");
    const noneToken = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.`;
    expectStatus("alg=none token rejected", (await call("/auth/me", { token: noneToken })).status, 401);
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "super_admin" })).toString("base64url");
    expectStatus("tampered payload rejected", (await call("/auth/me", { token: `${h}.${forgedPayload}.${access.split(".")[2]}` })).status, 401);
    const expired = jwt.sign({ userId: normal.id, email: normal.email, role: "member", name: "x", syndicateId: ATLAS }, JWT_SECRET!, { expiresIn: -10 });
    expectStatus("expired token rejected", (await call("/auth/me", { token: expired })).status, 401);
    const hs512 = jwt.sign({ userId: normal.id, email: normal.email, role: "member", name: "x", syndicateId: ATLAS }, JWT_SECRET!, { algorithm: "HS512" });
    expectStatus("token signed with a non-pinned algorithm rejected", (await call("/auth/me", { token: hs512 })).status, 401);

    // ── Refresh rotation & reuse detection ───────────────────────────────
    const r1 = await call("/auth/refresh", { method: "POST", body: { refreshToken: refresh1 } });
    expectStatus("refresh rotates the token", r1.status, 200);
    const refresh2 = r1.json?.data?.refreshToken as string;
    const race = await call("/auth/refresh", { method: "POST", body: { refreshToken: refresh1 } });
    expectStatus("old token refused inside grace window", race.status, 401);
    const stillValid = await call("/auth/refresh", { method: "POST", body: { refreshToken: refresh2 } });
    expectStatus("grace-window replay does not kill the live session", stillValid.status, 200);
    const refresh3 = stillValid.json?.data?.refreshToken as string;
    await sleep(11_000);
    const reuse = await call("/auth/refresh", { method: "POST", body: { refreshToken: refresh1 } });
    expectStatus("replay of a rotated token after grace window refused", reuse.status, 401);
    const afterReuse = await call("/auth/refresh", { method: "POST", body: { refreshToken: refresh3 } });
    expectStatus("reuse detection revoked every session of the user", afterReuse.status, 401);

    // ── Logout ───────────────────────────────────────────────────────────
    const login2 = await call("/auth/login", { method: "POST", body: { email: NORMAL_EMAIL, password: PASSWORD } });
    const refreshL = login2.json?.data?.refreshToken as string;
    expectStatus("logout succeeds", (await call("/auth/logout", { method: "POST", body: { refreshToken: refreshL } })).status, 200);
    expectStatus("refresh after logout refused", (await call("/auth/refresh", { method: "POST", body: { refreshToken: refreshL } })).status, 401);

    // ── Suspended account ────────────────────────────────────────────────
    const login3 = await call("/auth/login", { method: "POST", body: { email: NORMAL_EMAIL, password: PASSWORD } });
    await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, normal.id));
    expectStatus("suspended account cannot refresh", (await call("/auth/refresh", { method: "POST", body: { refreshToken: login3.json?.data?.refreshToken } })).status, 401);
    expectStatus("suspended account cannot log in", (await call("/auth/login", { method: "POST", body: { email: NORMAL_EMAIL, password: PASSWORD } })).status, 403);
    await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, normal.id));

    // ── Forced password change (temporary credentials) ───────────────────
    const inv = await call("/auth/login", { method: "POST", body: { email: INVITED_EMAIL, password: TEMP_PASSWORD } });
    expectStatus("invited user can log in with temporary password", inv.status, 200);
    const invToken = inv.json?.data?.token as string;
    record("login exposes mustChangePassword to the client", inv.json?.data?.user?.mustChangePassword === true, `mustChangePassword=${inv.json?.data?.user?.mustChangePassword}`);
    const blocked = await call("/budgets", { token: invToken });
    record("restricted session blocked from business endpoints", blocked.status === 403 && blocked.json?.code === "PASSWORD_CHANGE_REQUIRED", `status=${blocked.status} code=${blocked.json?.code}`);
    expectStatus("restricted session may read /auth/me", (await call("/auth/me", { token: invToken })).status, 200);
    expectStatus("same password refused as new password", (await call("/auth/change-password", { method: "POST", token: invToken, body: { currentPassword: TEMP_PASSWORD, newPassword: TEMP_PASSWORD } })).status, 400);
    expectStatus("password change succeeds", (await call("/auth/change-password", { method: "POST", token: invToken, body: { currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD } })).status, 200);
    expectStatus("previous refresh token revoked after password change", (await call("/auth/refresh", { method: "POST", body: { refreshToken: inv.json?.data?.refreshToken } })).status, 401);
    const inv2 = await call("/auth/login", { method: "POST", body: { email: INVITED_EMAIL, password: NEW_PASSWORD } });
    expectStatus("login with the new password", inv2.status, 200);
    expectStatus("unrestricted after change", (await call("/budgets", { token: inv2.json?.data?.token })).status, 200);

    // ── Password reset token (stored hashed, single use) ─────────────────
    const raw = randomBytes(32).toString("hex");
    await db.insert(passwordResetTokensTable).values({ userId: normal.id, token: sha256(raw), expiresAt: new Date(Date.now() + 600_000) });
    expectStatus("reset with the raw token from the email", (await call("/auth/reset-password", { method: "POST", body: { token: raw, newPassword: NEW_PASSWORD } })).status, 200);
    expectStatus("reset token is single-use", (await call("/auth/reset-password", { method: "POST", body: { token: raw, newPassword: "Another-Pass-3" } })).status, 400);
    expectStatus("the stored digest itself is not a valid reset token", (await call("/auth/reset-password", { method: "POST", body: { token: sha256(raw), newPassword: "Another-Pass-3" } })).status, 400);

    // ── Self-onboarding bound to a server-side SMS verification ──────────
    const intl = await call("/auth/sms/send", { method: "POST", body: { phone: "+447700900123" } });
    expectStatus("SMS to non-Moroccan numbers refused", intl.status, 400);

    const founderToken = jwt.sign(
      { userId: founder.id, email: founder.email, role: "syndicate_admin", name: founder.name },
      JWT_SECRET!,
      { expiresIn: "15m" },
    );
    const syndicateBody = { name: `Résidence Test ${RUN}`, sector: "copropriete", phone: ONBOARDING_PHONE_LOCAL };
    const unverified = await call("/syndicates", { method: "POST", token: founderToken, body: syndicateBody });
    record(
      "onboarding refused without a server-verified phone",
      unverified.status === 403 && unverified.json?.code === "PHONE_VERIFICATION_REQUIRED",
      `status=${unverified.status} code=${unverified.json?.code}`,
    );
    await db.insert(otpTokensTable).values({
      email: ONBOARDING_PHONE_E164,
      purpose: "phone_verification",
      codeHash: sha256("482913"),
      expiresAt: new Date(Date.now() + 300_000),
    });
    expectStatus("wrong SMS code refused", (await call("/auth/sms/verify", { method: "POST", body: { phone: ONBOARDING_PHONE_LOCAL, code: "000000" } })).status, 400);
    expectStatus("correct SMS code verified (persisted OTP)", (await call("/auth/sms/verify", { method: "POST", body: { phone: ONBOARDING_PHONE_LOCAL, code: "482913" } })).status, 200);
    expectStatus("consumed SMS code cannot be replayed", (await call("/auth/sms/verify", { method: "POST", body: { phone: ONBOARDING_PHONE_LOCAL, code: "482913" } })).status, 400);
    const onboarded = await call("/syndicates", { method: "POST", token: founderToken, body: syndicateBody });
    expectStatus("onboarding succeeds after phone verification", onboarded.status, 201);
    createdSyndicateId = onboarded.json?.data?.id ?? null;
    if (createdSyndicateId) {
      const [trial] = await db
        .select()
        .from(syndicateSubscriptionsTable)
        .where(eq(syndicateSubscriptionsTable.syndicateId, createdSyndicateId));
      record("new syndicate gets its trial in the same transaction", trial?.status === "trial" && !!trial?.trialEndDate, `status=${trial?.status}`);
    }
  } finally {
    await db.delete(otpTokensTable).where(eq(otpTokensTable.email, ONBOARDING_PHONE_E164));
    if (createdSyndicateId) {
      await db.delete(syndicateSubscriptionsTable).where(eq(syndicateSubscriptionsTable.syndicateId, createdSyndicateId));
      await db.delete(auditLogsTable).where(eq(auditLogsTable.entityId, createdSyndicateId));
      await db.delete(syndicatesTable).where(eq(syndicatesTable.id, createdSyndicateId));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, [normal.id, invited.id, founder.id]));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Auth security suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
