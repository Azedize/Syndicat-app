import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { JwtPayload } from "../middleware/auth.js";
import { memberIdsOf } from "./units.js";

/**
 * Who may open an uploaded file that is not a library document.
 *
 * Being in the same condominium is NOT enough: a file is readable by the
 * person who uploaded it, and otherwise according to the record that uses it.
 *   - shared by design with the whole condominium: syndicate logo, profile
 *     pictures, marketplace media, candidates' photos, published expense
 *     justifications (transparency)
 *   - chat attachment: people who can open the conversation
 *   - payment proofs, invoices, journal attachments: finance team
 *   - payslip: syndic, treasurer, the employee
 *   - debt-recovery letter: team, and the debtor it is addressed to
 *   - claim attachments: the team, and the reporter unless marked internal
 *   - any other operational record (proxies, works, incidents,
 *     parking, contracts…): the condominium team
 * A file used by no record is readable by its uploader only.
 */
const TEAM = new Set(["syndicate_admin", "president", "treasurer", "secretary", "committee_member"]);
const FINANCE = new Set(["syndicate_admin", "treasurer", "president", "committee_member"]);

type Ref = { kind: string; ref: string | null };

async function referencesOf(p: string): Promise<Ref[]> {
  const has = (col: string) => sql`position(${p} in COALESCE(${sql.raw(col)}, '')) > 0`;
  return (await db.execute(sql`
    SELECT 'shared' AS kind, NULL::text AS ref FROM syndicates WHERE logo_url = ${p}
    UNION ALL SELECT 'shared', NULL FROM users WHERE avatar = ${p}
    UNION ALL SELECT 'shared', NULL FROM products WHERE video_url = ${p} OR ${has("image_urls")}
    UNION ALL SELECT 'shared', NULL FROM candidates WHERE photo = ${p}
    UNION ALL SELECT 'shared', NULL FROM expense_justifications WHERE receipt_url = ${p}
    UNION ALL SELECT 'message', conversation_id FROM messages WHERE attachment_url = ${p}
    UNION ALL SELECT 'payslip', user_id FROM payslips WHERE file_url = ${p}
    UNION ALL SELECT 'debt_letter', member_id FROM debt_escalations WHERE letter_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM appel_payments WHERE proof_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM appels_de_fonds WHERE proof_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM expenses WHERE proof_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM ledger_entries WHERE proof_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM transactions WHERE proof_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM invoices WHERE proof_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM payment_proofs WHERE file_url = ${p}
    UNION ALL SELECT 'finance', NULL FROM charge_attachments WHERE url = ${p}
    UNION ALL SELECT 'finance', NULL FROM invoice_attachments WHERE url = ${p}
    UNION ALL SELECT 'finance', NULL FROM marketplace_promotions WHERE proof_url = ${p}
    UNION ALL SELECT 'team', NULL FROM election_proxies WHERE document_url = ${p}
    UNION ALL SELECT 'team', NULL FROM ag_proxies WHERE document_url = ${p}
    UNION ALL SELECT 'team', NULL FROM reclamations WHERE ${has("documents_joints")}
    UNION ALL SELECT CASE WHEN a.internal THEN 'team' ELSE 'claim' END, c.reporter_user_id
      FROM claim_attachments a JOIN claims c ON c.id = a.claim_id WHERE a.object_path = ${p}
    UNION ALL SELECT 'team', NULL FROM travaux WHERE report_url = ${p} OR invoice_url = ${p} OR ${has("photo_urls")}
    UNION ALL SELECT 'team', NULL FROM sinistres WHERE invoice_url = ${p} OR ${has("image_urls")}
    UNION ALL SELECT 'team', NULL FROM parking_violations WHERE photo_url = ${p}
    UNION ALL SELECT 'team', NULL FROM travaux_privatifs WHERE ${has("current_photo_urls")} OR ${has("proposed_photo_urls")} OR ${has("plan_urls")}
    UNION ALL SELECT 'team', NULL FROM contrats_prestataires WHERE document_url = ${p}
    UNION ALL SELECT 'team', NULL FROM prestataires WHERE document_url = ${p}
    UNION ALL SELECT 'team', NULL FROM workflows WHERE ${has("document")}
  `)) as unknown as Ref[];
}

async function canOpenConversation(user: JwtPayload, conversationId: string): Promise<boolean> {
  const [row] = (await db.execute(sql`
    SELECT 1 AS ok FROM conversations c
    WHERE c.id = ${conversationId} AND c.syndicate_id = ${user.syndicateId ?? ""}
      AND (
        c.conv_type IN ('announcement', 'building')
        OR c.participant1_id = ${user.userId} OR c.participant2_id = ${user.userId}
        -- participant_ids is a JSON array stored as text: match the quoted id
        OR (c.is_group AND position(${'"' + user.userId + '"'} in COALESCE(c.participant_ids, '')) > 0)
      )
  `)) as unknown as { ok: number }[];
  return !!row;
}

/**
 * `object` is the storage_objects row of the path. The caller has already
 * handled the uploader and the supervised platform access.
 */
export async function canReadSharedObject(user: JwtPayload, object: { objectPath: string; syndicateId: string | null }): Promise<boolean> {
  if (!user.syndicateId || object.syndicateId !== user.syndicateId) return false;
  const refs = await referencesOf(object.objectPath);
  for (const r of refs) {
    if (r.kind === "shared") return true;
    if (r.kind === "team" && TEAM.has(user.role)) return true;
    // Claim photo / document shared with the resident: the team and the reporter.
    if (r.kind === "claim" && (TEAM.has(user.role) || r.ref === user.userId)) return true;
    if (r.kind === "finance" && FINANCE.has(user.role)) return true;
    if (r.kind === "payslip" && (user.role === "syndicate_admin" || user.role === "treasurer" || r.ref === user.userId)) return true;
    if (r.kind === "debt_letter" && (TEAM.has(user.role) || (!!r.ref && (await memberIdsOf(user)).includes(r.ref)))) return true;
    if (r.kind === "message" && r.ref && (await canOpenConversation(user, r.ref))) return true;
  }
  return false;
}
