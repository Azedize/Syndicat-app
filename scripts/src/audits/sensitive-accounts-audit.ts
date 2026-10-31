/**
 * Audit (read only) of the accounts whose address is in a real mail domain
 * outside the generator and demo domains (2026-10-25): their origin, use and
 * dependencies, without printing names, phone numbers or secrets.
 *
 *   node --env-file=../.env --import=tsx src/audits/sensitive-accounts-audit.ts
 */
import { pool } from "@workspace/db";

const SEED_IDS = new Set(["user_super_admin"]); // ids written by scripts/src/seed.ts (demonstration)

async function main() {
  await (pool as any).begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx: any) => {
    const [{ d }] = await tx`SELECT current_database() AS d`;
    console.log(`Base : ${d} (lecture seule)`);
    const users = await tx`
      SELECT id, role, status, email_status, created_at, syndicate_id, split_part(email, '@', 2) AS domain, must_change_password
      FROM users
      WHERE email ILIKE '%@gmail.com' OR email = 'superadmin@mizan.ma'
      ORDER BY created_at`;
    const tables = (await tx`
      SELECT c.table_name, c.column_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public' AND c.column_name IN ('user_id','created_by','declared_by','seller_id','submitted_by','owner_id','reviewed_by','approved_by','grantor_id','requested_by_id','reported_by_id','author_id','sender_id','recipient_user_id')
        AND c.table_name NOT IN ('users')`) as { table_name: string; column_name: string }[];
    for (const u of users) {
      const deps: string[] = [];
      for (const t of tables) {
        const [{ n }] = await tx.unsafe(`SELECT count(*)::int AS n FROM "${t.table_name}" WHERE "${t.column_name}"::text = $1`, [u.id]);
        if (n) deps.push(`${t.table_name}.${t.column_name}=${n}`);
      }
      const [login] = await tx`SELECT max(created_at) AS last FROM audit_logs WHERE user_id = ${u.id} AND action IN ('LOGIN','login')`;
      const [refresh] = await tx`SELECT max(created_at) AS last, count(*)::int AS n FROM refresh_tokens WHERE user_id = ${u.id}`.catch(() => [{ last: null, n: 0 }]);
      const [mails] = await tx`SELECT count(*) FILTER (WHERE l.status = 'sent')::int AS sent, count(*)::int AS total FROM email_logs l JOIN users x ON lower(x.email) = lower(l.recipient) WHERE x.id = ${u.id}`;
      const [mship] = await tx`SELECT count(*)::int AS n FROM syndicate_memberships WHERE user_id = ${u.id}`;
      const [syn] = u.syndicate_id ? await tx`SELECT creation_key IS NOT NULL AS generated, status FROM syndicates WHERE id = ${u.syndicate_id}` : [null];
      const origin = SEED_IDS.has(u.id) ? "démonstration (seed.ts : user_super_admin)" : /^user_/.test(u.id) ? "démonstration (identifiant de seed)" : "inscription ou création applicative (identifiant aléatoire)";
      console.log(JSON.stringify({
        id: u.id, domain: u.domain, role: u.role, status: u.status, emailStatus: u.email_status, mustChangePassword: u.must_change_password,
        createdAt: u.created_at, origin,
        syndicate: u.syndicate_id ? `${u.syndicate_id} (${syn?.generated ? "générée" : "non générée"}, ${syn?.status})` : null,
        memberships: mship.n, lastLoginAudit: login?.last ?? null, refreshTokens: refresh?.n ?? 0, lastRefresh: refresh?.last ?? null,
        emails: `${mails.sent} envoyé(s) / ${mails.total}`, dependencies: deps,
      }));
    }
  });
  await pool.end();
}
main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
