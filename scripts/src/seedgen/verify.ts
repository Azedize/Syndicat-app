/**
 * Integrity checks on the whole database (not only generated rows):
 * foreign keys (every constraint of the catalog), relations the schema keeps
 * without a foreign key, financial consistency with the project's own rules,
 * tenant isolation and impossible dates. A check passes when it finds 0 rows.
 */
import { pool } from "@workspace/db";
import type { TableInfo } from "./introspect.js";

export interface CheckResult {
  group: string;
  name: string;
  found: number;
  ok: boolean;
}

/**
 * Values the app and the API recognise (schema comments, zod enums, screen
 * mappings). Checked on generated rows only: the demo data predates the
 * generator and is reported, not rewritten.
 */
const GENERATED = {
  syndicate: `x.syndicate_id IN (SELECT id FROM syndicates WHERE creation_key LIKE 'seedgen:%')`,
  building: `x.building_id IN (SELECT b.id FROM buildings b JOIN syndicates s ON s.id = b.syndicate_id WHERE s.creation_key LIKE 'seedgen:%')`,
  meeting: `x.meeting_id IN (SELECT m.id FROM meetings m JOIN syndicates s ON s.id = m.syndicate_id WHERE s.creation_key LIKE 'seedgen:%')`,
};
const ALLOWED_VALUES: Array<[string, string, string[], keyof typeof GENERATED | undefined]> = [
  ["announcements", "priority", ["info", "important", "urgent"], undefined],
  ["ag_proxies", "status", ["pending", "accepted", "revoked"], undefined],
  ["elections", "election_type", ["president", "board", "financial_committee", "maintenance_committee", "building_representative", "special"], undefined],
  ["elections", "voting_method", ["simple_majority", "absolute_majority"], undefined],
  ["travaux_privatifs", "work_type", ["ac_unit", "balcony", "windows", "facade", "structural", "plumbing", "electrical", "other"], undefined],
  ["billing_invoices", "status", ["open", "paid", "void", "uncollectible"], undefined],
  ["bons_livraison", "type", ["sortie", "entree"], undefined],
  ["bons_livraison", "status", ["draft", "sent", "delivered", "cancelled"], undefined],
  ["support_tickets", "category", ["paiement", "maintenance", "juridique", "administratif", "general"], undefined],
  ["products", "status", ["pending_review", "approved", "rejected", "reserved", "sold", "sold_out"], undefined],
  ["ideas", "status", ["submitted", "under_review", "approved", "rejected", "implemented"], undefined],
  ["actes_administratifs", "type", ["convocation", "decision", "pv", "proces_verbal_ag", "resolution", "mandat", "attestation", "courrier_officiel"], undefined],
  ["actes_administratifs", "statut", ["brouillon", "valide", "diffuse", "archive"], undefined],
  ["sinistres", "type", ["degat_eau", "incendie", "vol", "ascenseur", "dommage_commun", "autre"], "building"],
  ["sinistres", "status", ["declared", "in_progress", "expert", "repair", "closed"], "building"],
  ["ag_resolutions", "required_majority", ["simple", "absolute", "qualified", "unanimite"], "meeting"],
  ["ag_resolutions", "result", ["pending", "adopted", "rejected"], "meeting"],
  ["parking_violations", "status", ["open", "resolved", "dismissed"], "building"],
  ["election_proxies", "status", ["active", "used", "revoked"], undefined],
  ["documents", "visibility", ["syndic", "council", "owners", "residents", "unit", "personal"], undefined],
];

const BUSINESS: Array<[string, string, string]> = [
  // ── Finance ──
  ["Finance", "Payé d'un appel = somme de ses paiements validés", `
    SELECT a.id FROM appels_de_fonds a LEFT JOIN appel_payments p ON p.appel_id = a.id AND p.status = 'validated'
    WHERE a.status <> 'cancelled' AND EXISTS (SELECT 1 FROM appel_payments x WHERE x.appel_id = a.id)
    GROUP BY a.id, a.amount_paid HAVING a.amount_paid <> COALESCE(SUM(p.amount), 0)`],
  ["Finance", "Statut payé ⇔ payé = montant", `SELECT id FROM appels_de_fonds WHERE (status = 'paid') <> (amount_paid >= amount AND amount > 0) AND status NOT IN ('cancelled','pending_validation')`],
  ["Finance", "Statut partiellement payé ⇔ 0 < payé < montant", `SELECT id FROM appels_de_fonds WHERE status = 'partially_paid' AND NOT (amount_paid > 0 AND amount_paid < amount)`],
  ["Finance", "En retard uniquement si l'échéance est passée et rien n'est payé", `SELECT id FROM appels_de_fonds WHERE status = 'overdue' AND (due_date >= to_char(now() AT TIME ZONE 'Africa/Casablanca', 'YYYY-MM-DD') OR amount_paid > 0)`],
  ["Finance", "Paiement en validation ⇒ un paiement déclaré en attente", `SELECT a.id FROM appels_de_fonds a WHERE a.status = 'pending_validation' AND NOT EXISTS (SELECT 1 FROM appel_payments p WHERE p.appel_id = a.id AND p.status = 'pending')`],
  ["Finance", "Paiement validé ⇒ écriture du journal (même montant) et reçu", `
    SELECT p.id FROM appel_payments p LEFT JOIN ledger_entries l ON l.id = p.ledger_entry_id
    WHERE p.status = 'validated' AND (l.id IS NULL OR l.amount <> p.amount OR l.source_type <> 'appel_payment' OR l.source_id <> p.id OR p.receipt_number IS NULL)`],
  ["Finance", "Paiement non validé ⇒ ni écriture ni reçu", `SELECT id FROM appel_payments WHERE status IN ('pending','rejected') AND (ledger_entry_id IS NOT NULL OR receipt_number IS NOT NULL)`],
  ["Finance", "Écriture d'un paiement d'appel ⇒ paiement existant", `SELECT l.id FROM ledger_entries l WHERE l.source_type = 'appel_payment' AND NOT EXISTS (SELECT 1 FROM appel_payments p WHERE p.id = l.source_id)`],
  ["Finance", "Dépense payée ⇒ écriture de sortie du même montant", `
    SELECT e.id FROM expenses e LEFT JOIN ledger_entries l ON l.id = e.ledger_entry_id
    WHERE e.status = 'paid' AND (l.id IS NULL OR l.amount <> e.amount OR l.direction <> 'out')`],
  ["Finance", "Dépense non payée ⇒ pas d'écriture", `SELECT id FROM expenses WHERE status <> 'paid' AND ledger_entry_id IS NOT NULL`],
  ["Finance", "Numéros de reçu uniques par copropriété", `SELECT syndicate_id, receipt_number FROM appel_payments WHERE receipt_number IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1`],
  ["Finance", "Séquences de numérotation au-delà des numéros utilisés (JRN)", `
    SELECT l.syndicate_id FROM ledger_entries l
    WHERE l.entry_number ~ '^JRN-[0-9]{4}-[0-9]+$' AND NOT EXISTS (
      SELECT 1 FROM document_sequences s WHERE s.syndicate_id = l.syndicate_id AND s.prefix = 'JRN'
        AND s.year = split_part(l.entry_number, '-', 2)::int AND s.current_value >= split_part(l.entry_number, '-', 3)::int)`],
  ["Finance", "Lignes de répartition = total de la répartition", `
    SELECT a.id FROM allocations a LEFT JOIN allocation_lines l ON l.allocation_id = a.id
    GROUP BY a.id, a.total_amount HAVING a.total_amount <> COALESCE(SUM(l.amount), 0)`],
  ["Finance", "Montant émis des obligations = total de la répartition", `
    SELECT a.id FROM allocations a JOIN appels_de_fonds c ON c.allocation_id = a.id WHERE a.status <> 'draft'
    GROUP BY a.id, a.total_amount HAVING a.total_amount <> SUM(c.original_amount)`],
  ["Finance", "Lignes budgétaires = montant des charges du budget", `
    SELECT b.id FROM budgets b JOIN budget_lines l ON l.budget_id = b.id WHERE b.charges_amount IS NOT NULL
    GROUP BY b.id, b.charges_amount HAVING b.charges_amount <> SUM(l.amount_annual)`],
  // ── Isolation between condominiums ──
  ["Isolation", "Paiement et appel dans la même copropriété", `
    SELECT p.id FROM appel_payments p JOIN appels_de_fonds a ON a.id = p.appel_id JOIN buildings b ON b.id = a.building_id WHERE b.syndicate_id <> p.syndicate_id`],
  ["Isolation", "Lot de l'appel dans l'immeuble de l'appel", `SELECT a.id FROM appels_de_fonds a JOIN lots l ON l.id = a.lot_id WHERE l.building_id <> a.building_id`],
  ["Isolation", "Propriété : lot et copropriétaire de la même copropriété", `
    SELECT o.id FROM lot_ownerships o JOIN lots l ON l.id = o.lot_id JOIN buildings b ON b.id = l.building_id JOIN members m ON m.id = o.member_id
    WHERE b.syndicate_id <> o.syndicate_id OR m.syndicate_id <> o.syndicate_id`],
  ["Isolation", "Locataire : lot, immeuble et copropriété cohérents", `
    SELECT t.id FROM tenants t JOIN lots l ON l.id = t.lot_id JOIN buildings b ON b.id = l.building_id WHERE b.id <> t.building_id OR b.syndicate_id <> t.syndicate_id`],
  ["Isolation", "Document de lot : lot de la même copropriété", `SELECT d.id FROM documents d JOIN lots l ON l.id = d.lot_id JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id <> d.syndicate_id`],
  ["Isolation", "Réclamation : immeuble de la même copropriété", `SELECT c.id FROM claims c JOIN buildings b ON b.id = c.building_id WHERE b.syndicate_id <> c.syndicate_id`],
  ["Isolation", "Notification : destinataire rattaché à la copropriété", `
    SELECT a.id FROM alerts a JOIN users u ON u.id = a.recipient_user_id
    WHERE a.syndicate_id IS NOT NULL AND u.role <> 'super_admin' AND u.syndicate_id IS DISTINCT FROM a.syndicate_id
      AND NOT EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = a.syndicate_id AND m.status = 'active')`],
  ["Isolation", "Copropriétaire avec compte : utilisateur de la même copropriété", `
    SELECT m.id FROM members m JOIN users u ON lower(u.email) = lower(m.email) WHERE u.role = 'member' AND u.syndicate_id <> m.syndicate_id`],
  ["Isolation", "Écriture : compte de trésorerie de la même copropriété", `SELECT l.id FROM ledger_entries l JOIN treasury_accounts t ON t.id = l.account_id WHERE t.syndicate_id <> l.syndicate_id`],
  // ── Dates and states ──
  ["Dates", "Fin de propriété après le début", `SELECT id FROM lot_ownerships WHERE end_date IS NOT NULL AND end_date < start_date`],
  ["Dates", "Échéance d'un appel après son émission", `SELECT id FROM appels_de_fonds WHERE issue_date IS NOT NULL AND due_date < issue_date`],
  ["Dates", "Aucun paiement validé dans le futur", `SELECT id FROM appel_payments WHERE reviewed_at > now() + interval '1 day'`],
  ["Dates", "Réclamation résolue/clôturée ⇒ résolution et date", `SELECT id FROM claims WHERE status IN ('resolved','closed') AND (resolution IS NULL OR resolved_at IS NULL)`],
  ["Dates", "Bail : fin après début", `SELECT id FROM tenants WHERE lease_end IS NOT NULL AND lease_start IS NOT NULL AND lease_end < lease_start`],
  ["États", "Lot loué ⇒ un bail enregistré", `SELECT l.id FROM lots l WHERE l.status = 'rented' AND l.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.lot_id = l.id)`],
  ["États", "Une seule propriété ouverte par lot et copropriétaire", `SELECT lot_id, member_id FROM lot_ownerships WHERE end_date IS NULL GROUP BY 1, 2 HAVING COUNT(*) > 1`],
  ["États", "Quotes-parts ouvertes d'un lot ≤ 100 %", `SELECT lot_id FROM lot_ownerships WHERE end_date IS NULL GROUP BY lot_id HAVING SUM(share_percent) > 100`],
  ["États", "Vote : un reçu par électeur et par élection", `SELECT election_id, voter_id FROM vote_receipts GROUP BY 1, 2 HAVING COUNT(*) > 1`],
  ["États", "Bulletins = reçus de vote (scrutin secret)", `SELECT e.id FROM elections e WHERE (SELECT COUNT(*) FROM votes v WHERE v.election_id = e.id) <> (SELECT COUNT(*) FROM vote_receipts r WHERE r.election_id = e.id)`],
  ["États", "Électeurs uniquement de la copropriété de l'élection", `SELECT r.id FROM vote_receipts r JOIN elections e ON e.id = r.election_id JOIN users u ON u.id = r.voter_id WHERE u.syndicate_id <> e.syndicate_id`],
  ["États", "Fichier d'un document présent dans le stockage", `SELECT d.id FROM documents d WHERE d.source = 'upload' AND d.file_url LIKE '/objects/%' AND NOT EXISTS (SELECT 1 FROM storage_objects s WHERE s.object_path = d.file_url)`],
  ["États", "Contrat terminé ⇒ fin au plus tard à la résiliation", `SELECT id FROM contrats_prestataires WHERE status IN ('expired','terminated') AND terminated_at IS NOT NULL AND end_date::date > terminated_at::date`],
  ["États", "Majorité simple : adoptée ⇔ pour > contre", `SELECT id FROM ag_resolutions WHERE required_majority = 'simple' AND result IN ('adopted','rejected') AND (result = 'adopted') <> (tantiemes_for > tantiemes_against)`],
  ["États", "Procuration utilisée ⇒ reçu de vote du mandant porté par le mandataire", `
    SELECT p.id FROM election_proxies p WHERE p.status = 'used'
      AND NOT EXISTS (SELECT 1 FROM vote_receipts r WHERE r.election_id = p.election_id AND r.voter_id = p.grantor_id AND r.cast_by_proxy_id = p.grantee_id)`],
  ["États", "Au plus 2 pouvoirs actifs par mandataire et par élection", `SELECT election_id, grantee_id FROM election_proxies WHERE status = 'active' GROUP BY 1, 2 HAVING COUNT(*) > 2`],
  ["États", "Pouvoir actif ⇒ le mandant n'a pas encore voté", `
    SELECT p.id FROM election_proxies p WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM vote_receipts r WHERE r.election_id = p.election_id AND r.voter_id = p.grantor_id)`],
  ["Isolation", "Procuration : mandant et mandataire de la copropriété de l'élection", `
    SELECT p.id FROM election_proxies p JOIN elections e ON e.id = p.election_id JOIN users g ON g.id = p.grantor_id JOIN users h ON h.id = p.grantee_id
    WHERE g.syndicate_id IS DISTINCT FROM e.syndicate_id OR h.syndicate_id IS DISTINCT FROM e.syndicate_id`],
  ["Isolation", "Lu et compris : utilisateur rattaché à la copropriété de l'annonce", `
    SELECT k.id FROM announcement_acknowledgements k JOIN announcements a ON a.id = k.announcement_id JOIN users u ON u.id = k.user_id
    WHERE u.role <> 'super_admin' AND u.syndicate_id IS DISTINCT FROM a.syndicate_id
      AND NOT EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = a.syndicate_id AND m.status = 'active')`],
  ["Isolation", "Clé de répartition : lots de l'immeuble de la clé", `
    SELECT s.id FROM allocation_key_shares s JOIN allocation_key_versions v ON v.id = s.version_id JOIN allocation_keys k ON k.id = v.key_id JOIN lots l ON l.id = s.lot_id
    WHERE l.building_id <> k.building_id`],
  ["Isolation", "Infraction : déclarant de la copropriété de l'immeuble", `
    SELECT x.id FROM parking_violations x JOIN buildings b ON b.id = x.building_id JOIN users u ON u.id = x.reported_by_id
    WHERE u.role <> 'super_admin' AND u.syndicate_id IS DISTINCT FROM b.syndicate_id
      AND NOT EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = b.syndicate_id AND m.status = 'active')`],
  ["Finance", "Ajustement : montant de l'appel = dernier montant ajusté", `
    SELECT a.id FROM appels_de_fonds a
    JOIN LATERAL (SELECT new_amount FROM appel_adjustments j WHERE j.appel_id = a.id ORDER BY j.created_at DESC, j.id DESC LIMIT 1) j ON true
    WHERE a.status <> 'cancelled' AND a.amount <> j.new_amount`],
  ["Dates", "Lu et compris après la publication de l'annonce", `SELECT k.id FROM announcement_acknowledgements k JOIN announcements a ON a.id = k.announcement_id WHERE k.acknowledged_at < a.created_at`],
  ["Dates", "Infraction traitée ⇒ traitée après le signalement", `SELECT id FROM parking_violations WHERE status IN ('resolved','dismissed') AND (resolved_at IS NULL OR resolved_at < reported_at)`],
  ["Documents", "Document « lot » ⇒ lot renseigné, document « personnel » ⇒ personne renseignée", `SELECT id FROM documents WHERE (visibility = 'unit' AND lot_id IS NULL) OR (visibility = 'personal' AND subject_user_id IS NULL)`],
  ["Documents", "Travaux terminés ou à valider ⇒ rapport, facture et photos (données générées)", `SELECT x.id FROM travaux x WHERE ${GENERATED.building} AND x.status IN ('pending_validation','completed') AND (x.report_url IS NULL OR x.invoice_url IS NULL OR x.photo_urls IS NULL OR x.photo_urls = '[]')`],
  ["Documents", "Facture fournisseur ⇒ justificatif PDF (données générées)", `SELECT x.id FROM invoices x WHERE ${GENERATED.syndicate} AND x.proof_url IS NULL`],
  ["Documents", "Contrat ⇒ document du contrat (données générées)", `SELECT x.id FROM contrats_prestataires x WHERE ${GENERATED.building} AND x.document_url IS NULL`],
  ...ALLOWED_VALUES.map(
    ([t, col, values, by]): [string, string, string] => [
      "Valeurs",
      `${t}.${col} parmi les valeurs de l'application (données générées)`,
      `SELECT x.id FROM "${t}" x WHERE ${GENERATED[by ?? "syndicate"]} AND x."${col}" IS NOT NULL AND x."${col}" NOT IN (${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`,
    ],
  ),
];

export async function verifyDatabase(tables: TableInfo[]): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  // every foreign key of the catalog: orphan rows
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      const cond = fk.columns.map((c, i) => `p."${fk.refColumns[i]}" = c."${c}"`).join(" AND ");
      const notNull = fk.columns.map((c) => `c."${c}" IS NOT NULL`).join(" AND ");
      const [{ n }] = (await pool.unsafe(`SELECT COUNT(*)::int AS n FROM "${t.name}" c WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM "${fk.refTable}" p WHERE ${cond})`)) as unknown as { n: number }[];
      out.push({ group: "Clés étrangères", name: `${t.name}.${fk.columns.join("+")} → ${fk.refTable}`, found: n, ok: n === 0 });
    }
  }
  for (const [group, name, q] of BUSINESS) {
    const rows = (await pool.unsafe(`SELECT COUNT(*)::int AS n FROM (${q}) x`)) as unknown as { n: number }[];
    out.push({ group, name, found: rows[0].n, ok: rows[0].n === 0 });
  }
  return out;
}
