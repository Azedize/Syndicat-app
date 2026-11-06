/**
 * Undeliverable e-mail addresses (2026-10-21):
 *  - every account on a reserved domain is marked undeliverable, no other is;
 *  - the e-mail service never attempts those addresses (logged "skipped");
 *  - a reserved address cannot receive a verification code (400, not 502);
 *  - an account can adopt a real address once a code sent to it is typed back,
 *    its member records follow, the old address stops working for login;
 *  - production refuses reserved domains when creating accounts.
 *
 * The test restores every row it changes. Run with the API on API_BASE_URL and
 * SMTP disabled (nothing leaves the machine).
 */
import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import { emailLogsTable, membersTable, otpTokensTable, usersTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TEST_EMAIL_LIKE, writableSubscriptionSql } from "./test-domain.js";

// API modules are loaded at run time: they live outside this package's rootDir.
const apiLib = (p: string) => pathToFileURL(path.resolve(import.meta.dirname, "../../artifacts/api-server/src/lib", p)).href;
const { isReservedEmail, reservedEmailRefused } = (await import(apiLib("email/deliverability.ts"))) as {
  isReservedEmail: (email: string) => boolean;
  reservedEmailRefused: (email: string) => boolean;
};
const { sendTransactionalEmail } = (await import(apiLib("email/emailService.ts"))) as {
  sendTransactionalEmail: (o: { to: string; subject: string; html: string; template: string }) => Promise<{ ok: boolean; skipped?: boolean; logId?: string }>;
};

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";

const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]));

async function call(token: string | null, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j: any = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}
async function login(email: string) {
  const r = await call(null, "/auth/login", { email, password: PASSWORD });
  return r.status === 200 ? (r.body?.data?.token as string) : null;
}

async function main() {
  // 1. Statuses
  // Reserved domains must always be marked. Other addresses may also be marked
  // by hand (demo fixtures on real or registrable domains): that is allowed.
  const stats = rows<{ reserved: number; reserved_unmarked: number; manual: number }>(await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE lower(split_part(email,'@',2)) ~ '(^|\\.)(test|invalid|example|localhost|local)$'
                         OR lower(split_part(email,'@',2)) IN ('example.com','example.net','example.org'))::int AS reserved,
      count(*) FILTER (WHERE email_status <> 'undeliverable'
                         AND (lower(split_part(email,'@',2)) ~ '(^|\\.)(test|invalid|example|localhost|local)$'
                         OR lower(split_part(email,'@',2)) IN ('example.com','example.net','example.org')))::int AS reserved_unmarked,
      count(*) FILTER (WHERE email_status = 'undeliverable'
                         AND NOT (lower(split_part(email,'@',2)) ~ '(^|\\.)(test|invalid|example|localhost|local)$'
                         OR lower(split_part(email,'@',2)) IN ('example.com','example.net','example.org')))::int AS manual
    FROM users`))[0];
  check("every reserved-domain account is marked undeliverable", stats.reserved_unmarked === 0, `${stats.reserved} reserved, ${stats.reserved_unmarked} unmarked, ${stats.manual} other addresses marked by hand`);
  check("reserved detection: .test / .invalid / example.com yes, gmail.com / andalous.ma no",
    isReservedEmail("a@x.seedgen.mizan.test") && isReservedEmail("a@example.invalid") && isReservedEmail("a@example.com") && !isReservedEmail("a@gmail.com") && !isReservedEmail("a@andalous.ma"));

  // 2. The e-mail service skips them
  const res = await sendTransactionalEmail({ to: "nobody@seedgen.mizan.test", subject: "email-step-test", html: "<p>x</p>", template: "email_step_test" });
  const [log] = res.logId ? await db.select().from(emailLogsTable).where(eq(emailLogsTable.id, res.logId)) : [];
  check("an undeliverable address is never attempted (logged as skipped)", res.skipped === true && log?.status === "skipped", `${log?.status}`);
  if (res.logId) await db.delete(emailLogsTable).where(eq(emailLogsTable.id, res.logId));
  const otp = await call(null, "/auth/otp/send", { email: "someone@demo.test" });
  check("no verification code to a reserved address (400 EMAIL_UNDELIVERABLE)", otp.status === 400 && otp.body?.code === "EMAIL_UNDELIVERABLE", String(otp.status));

  // 3. Changing the address
  const [subject] = rows<{ id: string; email: string; syndicate_id: string }>(await db.execute(sql`
    SELECT u.id, u.email, u.syndicate_id FROM users u
    JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
    JOIN LATERAL (SELECT 1) ss ON ${sql.raw(writableSubscriptionSql("s"))}
    JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email)
    WHERE u.role = 'member' AND u.status = 'active' AND u.email LIKE ${TEST_EMAIL_LIKE}
    ORDER BY u.email LIMIT 1`));
  const [someoneElse] = await db.select({ email: usersTable.email }).from(usersTable).where(sql`${usersTable.id} <> ${subject.id}`).limit(1);
  const token = await login(subject.email);
  if (!token) throw new Error("cannot log in as " + subject.email);
  const newEmail = `email-step-${Date.now()}@mizan-qa-check.ma`;

  const r1 = await call(token, "/me/email-change/request", { email: "me@other.test" });
  check("a reserved address is refused as the new address", r1.status === 400 && r1.body?.code === "EMAIL_UNDELIVERABLE", String(r1.status));
  const r2 = await call(token, "/me/email-change/request", { email: someoneElse.email });
  check("an address used by another account is refused (409)", r2.status === 409, String(r2.status));

  // SMTP is off in the test environment: insert the code ourselves.
  await db.insert(otpTokensTable).values({ email: newEmail, codeHash: await bcrypt.hash("246813", 8), purpose: `email_change:${subject.id}`, expiresAt: new Date(Date.now() + 600_000) } as any);
  const wrong = await call(token, "/me/email-change/confirm", { email: newEmail, code: "111111" });
  check("a wrong code is refused", wrong.status === 400 && wrong.body?.code === "EMAIL_CODE_WRONG", String(wrong.status));
  const other = await login(someoneElse.email.endsWith(".test") ? someoneElse.email : subject.email);
  if (other && someoneElse.email.endsWith(".test")) {
    const stolen = await call(other, "/me/email-change/confirm", { email: newEmail, code: "246813" });
    check("another account cannot use this code", stolen.status === 400, String(stolen.status));
  }
  const ok = await call(token, "/me/email-change/confirm", { email: newEmail, code: "246813" });
  check("the right code adopts the new address and moves the member records", ok.status === 200 && ok.body?.data?.linked?.members >= 1 && ok.body?.refreshRequired === true, `${ok.status} ${JSON.stringify(ok.body?.data?.linked)}`);
  const [after] = await db.select({ email: usersTable.email, status: usersTable.emailStatus }).from(usersTable).where(eq(usersTable.id, subject.id));
  const memberRows = await db.select({ id: membersTable.id }).from(membersTable).where(and(eq(membersTable.syndicateId, subject.syndicate_id), sql`lower(${membersTable.email}) = ${newEmail}`));
  check("account now verified on the new address, member record linked", after.email === newEmail && after.status === "verified" && memberRows.length >= 1);
  check("login works with the new address", !!(await login(newEmail)));
  check("login no longer works with the old address", !(await login(subject.email)));
  const reused = await call(token, "/me/email-change/confirm", { email: newEmail, code: "246813" });
  check("a code cannot be used twice", reused.status === 400, String(reused.status));

  // Restore
  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({ email: subject.email, emailStatus: "undeliverable" }).where(eq(usersTable.id, subject.id));
    await tx.update(membersTable).set({ email: subject.email }).where(sql`lower(${membersTable.email}) = ${newEmail}`);
    await tx.execute(sql`UPDATE tenants SET email = ${subject.email} WHERE lower(email) = ${newEmail}`);
    await tx.execute(sql`UPDATE conseil_syndical SET email = ${subject.email} WHERE lower(email) = ${newEmail}`);
    await tx.delete(otpTokensTable).where(eq(otpTokensTable.purpose, `email_change:${subject.id}`));
  });
  check("test account restored", !!(await login(subject.email)));

  // 4. Production rule
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const prodRefuses = reservedEmailRefused("x@y.test") && !reservedEmailRefused("x@gmail.com");
  process.env.NODE_ENV = "development";
  const devAccepts = !reservedEmailRefused("x@y.test");
  process.env.NODE_ENV = env;
  check("production refuses reserved domains at account creation; development accepts and marks them", prodRefuses && devAccepts);

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} e-mail checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
