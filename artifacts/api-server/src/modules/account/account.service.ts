// Account deletion: the login account and the data of the person are erased; what the
// condominium must keep (co-owner register, accounting, votes, signatures, audit) stays.
// The users row itself is anonymised, not deleted: votes, signatures and accounting
// entries reference it, and deleting it would cascade into them.
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { db } from "@workspace/db";
import { auditLogsTable, usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { BCRYPT_COST } from "../../middleware/auth.js";
import { sendTransactionalEmail } from "../../lib/email/emailService.js";
import { accountDeletedTemplate, emailLang } from "../../lib/email/templates.js";
import { logger } from "../../lib/logger.js";
import { LOCAL_UPLOADS_DIR } from "../../lib/file-store.js";

export const DELETED_NAME = "Compte supprimé";

export type DeleteRefusal = "BAD_CREDENTIALS" | "PLATFORM_ADMIN" | "LAST_ADMIN";
export type DeleteResult = { ok: true } | { ok: false; code: DeleteRefusal };

// Compared against when the account is unknown, so that both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync("mizan-account-deletion-equalizer", BCRYPT_COST);

/** Condominiums or companies that would be left without any administrator. */
async function leavesNoAdministrator(userId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    WITH mine AS (
      SELECT syndicate_id FROM users WHERE id = ${userId} AND role = 'syndicate_admin' AND syndicate_id IS NOT NULL
      UNION
      SELECT syndicate_id FROM syndicate_memberships WHERE user_id = ${userId} AND role = 'syndicate_admin' AND status = 'active'
    )
    SELECT 1 FROM mine m
     WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = m.syndicate_id AND u.role = 'syndicate_admin' AND u.status = 'active' AND u.id <> ${userId})
       AND NOT EXISTS (SELECT 1 FROM syndicate_memberships s JOIN users u ON u.id = s.user_id
                        WHERE s.syndicate_id = m.syndicate_id AND s.role = 'syndicate_admin' AND s.status = 'active' AND u.status = 'active' AND s.user_id <> ${userId})
    UNION ALL
    SELECT 1 FROM organization_members o
     WHERE o.user_id = ${userId} AND o.role = 'org_admin' AND o.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM organization_members x JOIN users u ON u.id = x.user_id
                        WHERE x.organization_id = o.organization_id AND x.role = 'org_admin' AND x.status = 'active' AND u.status = 'active' AND x.user_id <> ${userId})
    LIMIT 1`)) as unknown as unknown[];
  return rows.length > 0;
}

const UPLOADED_FILE = /\/objects\/uploads\/([A-Za-z0-9._-]+)/;

/** Object paths of uploaded files named in these values (URLs, or JSON arrays of URLs). */
function uploadedPaths(values: unknown[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string" || !v) continue;
    for (const part of v.startsWith("[") ? ((): unknown[] => { try { return JSON.parse(v); } catch { return []; } })() : [v]) {
      const m = typeof part === "string" ? part.match(UPLOADED_FILE) : null;
      if (m) out.add(`/objects/uploads/${m[1]}`);
    }
  }
  return [...out];
}

/** Erases the account in one transaction. Nothing changes if any step fails. */
async function anonymise(user: typeof usersTable.$inferSelect): Promise<void> {
  const id = user.id;
  const email = user.email.toLowerCase();
  const name = DELETED_NAME;
  const unusable = await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_COST);
  const files = await db.transaction(async (tx) => {
    // Files that go with what is erased below (listings kept for an order keep their media).
    const media = (await tx.execute(sql`
      SELECT attachment_url AS v FROM messages WHERE sender_id = ${id}
      UNION ALL SELECT image_urls FROM products p WHERE p.seller_id = ${id} AND p.status NOT IN ('sold', 'reserved') AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = p.id)
      UNION ALL SELECT video_url FROM products p WHERE p.seller_id = ${id} AND p.status NOT IN ('sold', 'reserved') AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = p.id)`)) as unknown as { v: unknown }[];
    const paths = uploadedPaths([user.avatar, ...media.map((r) => r.v)]);
    for (const p of paths) await tx.execute(sql`DELETE FROM storage_objects WHERE object_path = ${p}`);

    // Sessions and one-time codes.
    await tx.execute(sql`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ${id} AND revoked_at IS NULL`);
    await tx.execute(sql`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = ${id} AND used_at IS NULL`);
    await tx.execute(sql`DELETE FROM otp_tokens WHERE lower(email) = ${email}`);
    // Access to condominiums and companies.
    await tx.execute(sql`UPDATE syndicate_memberships SET status = 'inactive' WHERE user_id = ${id}`);
    await tx.execute(sql`UPDATE organization_members SET status = 'inactive' WHERE user_id = ${id}`);
    // Personal data with no legal reason to stay.
    await tx.execute(sql`DELETE FROM vehicles WHERE user_id = ${id}`);
    await tx.execute(sql`DELETE FROM visitor_parking_reservations WHERE requested_by_id = ${id}`);
    await tx.execute(sql`DELETE FROM product_favorites WHERE user_id = ${id}`);
    await tx.execute(sql`DELETE FROM cart_items WHERE user_id = ${id}`);
    await tx.execute(sql`DELETE FROM blocked_users WHERE blocker_id = ${id} OR blocked_id = ${id}`);
    await tx.execute(sql`DELETE FROM conversation_archives WHERE user_id = ${id}`);
    await tx.execute(sql`DELETE FROM alerts WHERE recipient_user_id = ${id}`);
    // Messages: emptied the way "delete for everyone" does; the thread stays for the other person.
    await tx.execute(sql`UPDATE messages SET text = '', sender_name = ${name}, deleted_at = now(), is_deleted_for_everyone = true,
      attachment_url = NULL, attachment_name = NULL, attachment_type = NULL WHERE sender_id = ${id}`);
    // Listings: removed unless an order refers to them (another person's purchase history).
    await tx.execute(sql`DELETE FROM products p WHERE p.seller_id = ${id} AND p.status NOT IN ('sold', 'reserved')
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.product_id = p.id)`);
    await tx.execute(sql`UPDATE products SET seller_name = ${name}, seller_email = NULL, seller_phone = NULL,
      status = CASE WHEN status IN ('sold', 'reserved') THEN status ELSE 'rejected' END WHERE seller_id = ${id}`);
    // Records of others or of the condominium: kept, without the name.
    await tx.execute(sql`UPDATE orders SET buyer_name = ${name} WHERE buyer_id = ${id}`);
    await tx.execute(sql`UPDATE orders SET seller_name = ${name} WHERE seller_id = ${id}`);
    await tx.execute(sql`UPDATE product_comments SET user_name = ${name} WHERE user_id = ${id}`);
    await tx.execute(sql`UPDATE publication_comments SET user_name = ${name}, author_name = ${name} WHERE user_id = ${id}`);
    await tx.execute(sql`UPDATE publications SET author_name = ${name} WHERE author_id = ${id}`);
    await tx.execute(sql`UPDATE ideas SET user_name = ${name} WHERE user_id = ${id}`);
    await tx.execute(sql`UPDATE election_questions SET asked_by_name = ${name} WHERE asked_by = ${id}`);
    await tx.execute(sql`UPDATE claims SET reporter_name = ${name} WHERE reporter_user_id = ${id}`);
    await tx.execute(sql`UPDATE support_tickets SET submitted_by_name = ${name} WHERE submitted_by_id = ${id}`);
    await tx.execute(sql`UPDATE travaux SET reported_by_name = ${name} WHERE reported_by_id = ${id}`);
    await tx.execute(sql`UPDATE parking_violations SET reported_by_name = ${name} WHERE reported_by_id = ${id}`);
    // E-mail history: the address and any stored body go.
    await tx.execute(sql`UPDATE email_logs SET recipient = ${`deleted-${id}@deleted.invalid`}, body_html = NULL WHERE lower(recipient) = ${email}`);
    // The account itself: no login is possible any more, the address is free again.
    await tx
      .update(usersTable)
      .set({
        name,
        email: `deleted-${id}@deleted.invalid`,
        phone: null,
        cin: null,
        profession: null,
        avatar: null,
        pushToken: null,
        passwordHash: unusable,
        mustChangePassword: false,
        emailStatus: "undeliverable",
        status: "inactive",
        updatedAt: new Date(),
      } as any)
      .where(eq(usersTable.id, id));
    await tx.insert(auditLogsTable).values({
      userId: id,
      userName: name,
      actorRole: user.role,
      syndicateId: user.syndicateId,
      isSupervision: false,
      action: "ACCOUNT_DELETED",
      entity: "user",
      entityId: id,
      details: "Compte supprimé à la demande de son titulaire (données personnelles anonymisées).",
    } as any);
    return paths;
  });
  // After the commit: a failed transaction must not have lost any file.
  await Promise.all(
    files.map((p) => {
      const name = p.match(UPLOADED_FILE)?.[1];
      return name ? fs.unlink(path.join(LOCAL_UPLOADS_DIR, name)).catch(() => {}) : undefined;
    }),
  );
}

/** Deletes the account once its password is confirmed. Same refusal for an unknown address. */
export async function deleteAccount(
  who: { userId: string } | { email: string },
  password: string,
): Promise<DeleteResult> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where("userId" in who ? eq(usersTable.id, who.userId) : eq(usersTable.email, who.email.trim().toLowerCase()));
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || user.status !== "active") return { ok: false, code: "BAD_CREDENTIALS" };
  // Only reached with the right password: these answers reveal nothing to a stranger.
  if (user.role === "super_admin") return { ok: false, code: "PLATFORM_ADMIN" };
  if (await leavesNoAdministrator(user.id)) return { ok: false, code: "LAST_ADMIN" };

  const { email, name: formerName, language, syndicateId } = user;
  await anonymise(user);
  logger.info({ userId: user.id }, "Account deleted at the request of its holder");

  // After the commit: the last message sent to this address.
  const lang = emailLang(language);
  const tpl = accountDeletedTemplate(formerName, lang);
  sendTransactionalEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text, lang, template: "account_deleted", syndicateId }).catch(() => {});
  return { ok: true };
}
