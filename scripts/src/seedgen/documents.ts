/**
 * Documents phase (after payments): real PDF / PNG files produced FROM the
 * records already saved for a condominium, stored where the API reads them,
 * registered in storage_objects and linked to their business object:
 *
 *   rules            documents (reglement, residents, entity syndicate)
 *   budgets          documents (financier, owners, entity building)
 *   meetings         convocation (avis) + minutes for completed ones (proces_verbal)
 *   calls for funds  one notice per lot for the latest issued period (unit, lot)
 *   receipts         latest validated payment of each payer (personal, ledger entry)
 *   contracts        contrats_prestataires.document_url + documents (council)
 *   suppliers        prestataires.document_url (initial quote)
 *   invoices         invoices.proof_url (with their items)
 *   works            travaux report / invoice / photos once work is done
 *   incidents        sinistres.image_urls, repair quote for repaired ones
 *   marketplace      products.image_urls
 *   declared payments appel_payments.proof_url (transfer order) when pending
 *
 * Read with the same transaction as the writes, so the content matches the
 * database exactly.
 */
import { Batch, flush, type Row, type Tx } from "./db.js";
import { makePng, renderPdf, writeUpload, type PdfSpec, type StoredFile } from "./files.js";
import * as P from "./pdfdocs.js";
import type { Rng } from "./rng.js";

export interface DocHost {
  rng: Rng;
  now: Date;
  order: string[];
  counts: Map<string, number>;
}
export interface DocCtx extends P.SyndicCtx {
  sid: string;
  admin: { id: string };
  team: { id: string }[];
  files: string[];
}

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Count of files produced per kind (reported by the CLI). */
export const fileStats = new Map<string, number>();
const bump = (k: string) => fileStats.set(k, (fileStats.get(k) ?? 0) + 1);

async function updateMany(tx: Tx, table: string, rows: Row[], cols: Record<string, string>) {
  if (!rows.length) return;
  const set = Object.keys(cols)
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = x."${c}"`)
    .join(", ");
  const types = Object.entries(cols)
    .map(([c, t]) => `"${c}" ${t}`)
    .join(", ");
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000);
    await tx.unsafe(`UPDATE "${table}" t SET ${set} FROM jsonb_to_recordset($1::jsonb) AS x(${types}) WHERE t.id = x.id`, [JSON.stringify(chunk)]);
  }
}

export async function documentsPhase(g: DocHost, tx: Tx, c: DocCtx) {
  const r = g.rng;
  const b = new Batch();
  const today = g.now.toISOString().slice(0, 10);
  const [syn] = await tx`SELECT name, bank_name, bank_iban FROM syndicates WHERE id = ${c.sid}`;
  const team = c.team[1] ?? c.admin; // treasurer when present

  const save = async (kind: string, title: string, ownerId: string, content: PdfSpec | "png"): Promise<StoredFile> => {
    const id = r.uuid();
    const f = content === "png" ? await writeUpload(id, makePng(r.int(1, 2 ** 31)), ".png", `${slug(title) || "photo"}.png`) : await writeUpload(id, await renderPdf(content), ".pdf", `${slug(title) || "document"}.pdf`);
    c.files.push(f.objectPath);
    bump(kind);
    b.add("storage_objects", { object_path: f.objectPath, owner_id: ownerId, syndicate_id: c.sid, original_name: f.fileName, content_type: f.mime, size: f.size });
    return f;
  };
  const doc = (f: StoredFile, d: { title: string; category: string; visibility: string; createdBy: string; at: Date | string; lotId?: string | null; subjectUserId?: string | null; entityType?: string | null; entityId?: string | null; description?: string | null }) => {
    const at = typeof d.at === "string" ? new Date(`${d.at.slice(0, 10)}T10:00:00Z`) : d.at;
    b.add("documents", {
      id: r.uuid(), title: d.title, category: d.category, status: "published", syndicate_id: c.sid, size: String(f.size), created_by: d.createdBy, file_url: f.objectPath, version: 1,
      published_at: at, is_deleted: false, language: "fr", subject_user_id: d.subjectUserId ?? null, source: "upload", visibility: d.visibility, description: d.description ?? null,
      entity_type: d.entityType ?? null, entity_id: d.entityId ?? null, lot_id: d.lotId ?? null, file_name: f.fileName, mime_type: f.mime, size_bytes: f.size, checksum: f.checksum, created_at: at,
    });
  };

  // ── Rules of the condominium ──
  const bstats = (await tx`
    SELECT b.id, b.name, b.address, COUNT(l.id)::int AS lots, COALESCE(SUM(l.tantiemes), 0)::int AS tantiemes, MIN(b.created_at) AS created
    FROM buildings b LEFT JOIN lots l ON l.building_id = b.id AND l.archived_at IS NULL
    WHERE b.syndicate_id = ${c.sid} GROUP BY b.id, b.name, b.address ORDER BY b.name`) as any[];
  const rulesDate = new Date(Math.min(...bstats.map((x) => new Date(x.created).getTime()), g.now.getTime()));
  {
    const f = await save("règlement", `Règlement de copropriété ${c.name}`, c.admin.id, P.rulesDoc(c, { reference: `RC-${c.sid.replace(/-/g, "").slice(0, 8).toUpperCase()}`, date: rulesDate.toISOString(), buildings: bstats }));
    doc(f, { title: `Règlement de copropriété — ${c.name}`, category: "reglement", visibility: "residents", createdBy: c.admin.id, at: rulesDate, entityType: "syndicate", entityId: c.sid });
  }

  // ── Budgets ──
  const budgets = (await tx`
    SELECT bu.id, bu.year, bu.status, bu.voted_at, bu.total_amount, bu.charges_amount, bu.fonds_reserve, bu.created_at, b.id AS building_id, b.name AS building
    FROM budgets bu JOIN buildings b ON b.id = bu.building_id WHERE b.syndicate_id = ${c.sid} ORDER BY bu.year`) as any[];
  const blines = (await tx`SELECT budget_id, category, label, amount_annual, amount_q1, amount_q2, amount_q3, amount_q4 FROM budget_lines WHERE budget_id IN ${tx(budgets.map((x) => x.id).concat(["-"]))} ORDER BY category`) as any[];
  const statusFr: Record<string, string> = { draft: "Brouillon", approved: "Approuvé", voted: "Voté", active: "En vigueur", closed: "Clôturé" };
  for (const bu of budgets) {
    const lines = blines.filter((l) => l.budget_id === bu.id).map((l) => ({ category: l.category, label: l.label, annual: l.amount_annual, q: [l.amount_q1, l.amount_q2, l.amount_q3, l.amount_q4] }));
    const f = await save("budget", `Budget ${bu.year} ${bu.building}`, c.admin.id, P.budgetDoc(c, { year: bu.year, building: bu.building, buildingId: bu.building_id, status: statusFr[bu.status] ?? bu.status, votedAt: bu.voted_at, total: bu.total_amount, charges: bu.charges_amount, reserve: bu.fonds_reserve, lines }));
    doc(f, { title: `Budget prévisionnel ${bu.year} — ${bu.building}`, category: "financier", visibility: "owners", createdBy: c.admin.id, at: bu.voted_at ?? bu.created_at, entityType: "building", entityId: bu.building_id });
  }

  // ── Meetings: convocation, then minutes once held ──
  const totalT = bstats.reduce((s, x) => s + x.tantiemes, 0);
  const meetings = (await tx`
    SELECT m.id, m.title, m.date, m.time, m.location, m.agenda, m.status, m.type,
      (SELECT COUNT(*)::int FROM meeting_attendees a WHERE a.meeting_id = m.id) AS attendees,
      (SELECT COUNT(*)::int FROM ag_proxies p WHERE p.meeting_id = m.id AND p.status = 'accepted') AS proxies
    FROM meetings m WHERE m.syndicate_id = ${c.sid} AND m.status <> 'cancelled' ORDER BY m.date`) as any[];
  const resolutions = (await tx`SELECT meeting_id, number, title, required_majority, tantiemes_for, tantiemes_against, tantiemes_abstain, result FROM ag_resolutions WHERE meeting_id IN ${tx(meetings.map((m) => m.id).concat(["-"]))} ORDER BY number`) as any[];
  for (const [i, m] of meetings.entries()) {
    const sentAt = new Date(`${m.date}T09:00:00Z`);
    sentAt.setUTCDate(sentAt.getUTCDate() - 15);
    if (sentAt > g.now) continue; // not sent yet
    const ref = `CONV-${m.date.slice(0, 4)}-${String(i + 1).padStart(3, "0")}`;
    const conv = await save("convocation", `Convocation ${m.title} ${m.date}`, c.admin.id, P.convocationDoc(c, { title: m.title, date: m.date, time: m.time, location: m.location, agenda: m.agenda, reference: ref, sentAt }));
    doc(conv, { title: `Convocation — ${m.title} (${m.date})`, category: "avis", visibility: "owners", createdBy: c.admin.id, at: sentAt, entityType: "meeting", entityId: m.id });
    if (m.status === "completed") {
      const held = new Date(`${m.date}T18:00:00Z`);
      held.setUTCDate(held.getUTCDate() + 3);
      const res = resolutions.filter((x) => x.meeting_id === m.id).map((x) => ({ number: x.number, title: x.title, majority: x.required_majority, for: x.tantiemes_for, against: x.tantiemes_against, abstain: x.tantiemes_abstain, result: x.result }));
      const pv = await save("procès-verbal", `PV ${m.title} ${m.date}`, c.admin.id, P.minutesDoc(c, { title: m.title, date: m.date, time: m.time, location: m.location, reference: `PV-${m.date.slice(0, 4)}-${String(i + 1).padStart(3, "0")}`, attendees: m.attendees, proxies: m.proxies, totalTantiemes: totalT, resolutions: res }));
      doc(pv, { title: `Procès-verbal — ${m.title} (${new Date(`${m.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })})`, category: "proces_verbal", visibility: "owners", createdBy: c.admin.id, at: held > g.now ? g.now : held, entityType: "meeting", entityId: m.id });
    }
  }

  // ── Call-for-funds notice per lot (latest issued period) ──
  const calls = (await tx`
    SELECT DISTINCT ON (a.lot_id) a.id, a.lot_id, a.period, a.amount, a.amount_paid, a.due_date, a.issue_date, a.status, a.debtor_member_ids,
      l.number AS lot, l.tantiemes, b.name AS building, bu.year AS budget_year
    FROM appels_de_fonds a JOIN lots l ON l.id = a.lot_id JOIN buildings b ON b.id = a.building_id LEFT JOIN budgets bu ON bu.id = a.budget_id
    WHERE b.syndicate_id = ${c.sid} AND a.status <> 'cancelled' AND a.issue_date <= ${today}
    ORDER BY a.lot_id, a.issue_date DESC, a.created_at DESC`) as any[];
  const memberIds = [...new Set(calls.flatMap((a) => a.debtor_member_ids ?? []))];
  const members = new Map(((await tx`SELECT id, name FROM members WHERE id IN ${tx(memberIds.concat(["-"]))}`) as any[]).map((m) => [m.id, m.name]));
  for (const a of calls) {
    const ref = `AF-${a.period}-${a.lot}`;
    const f = await save("appel de fonds", `Appel de fonds ${a.period} lot ${a.lot}`, c.admin.id, P.callNoticeDoc(c, { reference: ref, period: a.period, building: a.building, lot: a.lot, tantiemes: a.tantiemes, debtors: (a.debtor_member_ids ?? []).map((id: string) => members.get(id)).filter(Boolean), amount: a.amount, paid: a.amount_paid, dueDate: a.due_date, issueDate: a.issue_date, status: a.status, budgetYear: a.budget_year, bank: syn.bank_name, iban: syn.bank_iban }));
    doc(f, { title: `Avis d'appel de fonds ${a.period} — Lot ${a.lot}`, category: "financier", visibility: "unit", createdBy: c.admin.id, at: a.issue_date, lotId: a.lot_id, entityType: "appel_de_fonds", entityId: a.id });
  }

  // ── Receipt of each payer's latest validated payment ──
  const receipts = (await tx`
    SELECT DISTINCT ON (p.declared_by) p.id, p.declared_by, p.amount, p.method, p.reference, p.reviewed_at, p.receipt_number, p.ledger_entry_id,
      u.name AS payer, a.period, a.amount AS call_amount, a.amount - a.amount_paid AS remaining, l.number AS lot, b.name AS building, le.entry_number
    FROM appel_payments p JOIN users u ON u.id = p.declared_by JOIN appels_de_fonds a ON a.id = p.appel_id JOIN lots l ON l.id = a.lot_id JOIN buildings b ON b.id = a.building_id
    LEFT JOIN ledger_entries le ON le.id = p.ledger_entry_id
    WHERE p.syndicate_id = ${c.sid} AND p.status = 'validated' AND p.receipt_number IS NOT NULL
    ORDER BY p.declared_by, p.reviewed_at DESC`) as any[];
  for (const p of receipts) {
    const f = await save("reçu", `Recu ${p.receipt_number}`, team.id, P.receiptDoc(c, { receipt: p.receipt_number, payer: p.payer, amount: p.amount, method: p.method, reference: p.reference, validatedAt: p.reviewed_at, period: p.period, lot: p.lot, building: p.building, callAmount: p.call_amount, remaining: p.remaining, journal: p.entry_number }));
    doc(f, { title: `Reçu ${p.receipt_number} — ${p.period}, lot ${p.lot}`, category: "financier", visibility: "personal", subjectUserId: p.declared_by, createdBy: team.id, at: p.reviewed_at, entityType: p.ledger_entry_id ? "ledger_entry" : null, entityId: p.ledger_entry_id });
  }

  // ── Transfer orders attached to payments awaiting validation ──
  const pending = (await tx`
    SELECT p.id, p.amount, p.created_at, p.reference, u.id AS user_id, u.name AS payer, a.period, l.number AS lot
    FROM appel_payments p JOIN users u ON u.id = p.declared_by JOIN appels_de_fonds a ON a.id = p.appel_id JOIN lots l ON l.id = a.lot_id
    WHERE p.syndicate_id = ${c.sid} AND p.status = 'pending' AND p.method = 'virement'`) as any[];
  const payUpd: Row[] = [];
  for (const p of pending) {
    const ref = p.reference ?? `VIR-${p.id.slice(0, 8).toUpperCase()}`;
    const f = await save("justificatif de paiement", `Ordre de virement ${p.period} ${p.lot}`, p.user_id, P.transferOrderDoc(c, { payer: p.payer, amount: p.amount, date: p.created_at, reference: ref, period: p.period, lot: p.lot, iban: syn.bank_iban }));
    payUpd.push({ id: p.id, proof_url: f.objectPath });
  }

  // ── Suppliers, contracts, invoices ──
  const prest = (await tx`SELECT id, name, created_at FROM prestataires WHERE syndicate_id = ${c.sid}`) as any[];
  const prestUpd: Row[] = [];
  for (const p of prest) {
    const f = await save("devis prestataire", `Devis initial ${p.name}`, c.admin.id, P.supplierInvoice(c, p.name, `DEV-${p.id.slice(0, 6).toUpperCase()}`, p.created_at, [["Prestation annuelle selon cahier des charges", "1", "0", "0"]], { kind: "DEVIS", note: "Devis de référence joint à la fiche du prestataire ; les montants des contrats figurent dans chaque contrat." }));
    prestUpd.push({ id: p.id, document_url: f.objectPath });
  }
  const contracts = (await tx`
    SELECT k.id, k.title, k.start_date, k.end_date, k.monthly_amount, k.annual_amount, k.auto_renew, k.status, k.terminated_at, k.created_at, p.name AS supplier, b.name AS building
    FROM contrats_prestataires k JOIN prestataires p ON p.id = k.prestataire_id JOIN buildings b ON b.id = k.building_id WHERE b.syndicate_id = ${c.sid}`) as any[];
  const contractUpd: Row[] = [];
  for (const [i, k] of contracts.entries()) {
    const ref = `CTR-${String(k.start_date).slice(0, 4)}-${String(i + 1).padStart(3, "0")}`;
    const f = await save("contrat", k.title, c.admin.id, P.contractDoc(c, { title: k.title, supplier: k.supplier, building: k.building, start: k.start_date, end: k.end_date, monthly: k.monthly_amount, annual: k.annual_amount, autoRenew: !!k.auto_renew, status: k.status, terminatedAt: k.terminated_at, reference: ref }));
    contractUpd.push({ id: k.id, document_url: f.objectPath });
    doc(f, { title: k.title, category: "contrat", visibility: "council", createdBy: c.admin.id, at: k.start_date, entityType: "contrat", entityId: k.id });
  }
  const invoices = (await tx`SELECT id, reference, type, recipient, date, due_date, amount FROM invoices WHERE syndicate_id = ${c.sid}`) as any[];
  const items = (await tx`SELECT invoice_id, label, quantity, unit_price FROM invoice_items WHERE invoice_id IN ${tx(invoices.map((x) => x.id).concat(["-"]))}`) as any[];
  const invUpd: Row[] = [];
  for (const inv of invoices) {
    const its = items.filter((x) => x.invoice_id === inv.id);
    const rows: [string, string, string, string][] = its.length
      ? its.map((x) => [x.label, String(Number(x.quantity)), x.unit_price, (Number(x.quantity) * Number(x.unit_price)).toFixed(2)])
      : [["Prestation", "1", inv.amount, inv.amount]];
    const f = await save(inv.type === "devis" ? "devis" : "facture fournisseur", `${inv.type === "devis" ? "Devis" : "Facture"} ${inv.reference}`, team.id, P.supplierInvoice(c, inv.recipient, inv.reference, inv.date, rows, { kind: inv.type === "devis" ? "DEVIS" : "FACTURE", dueDate: inv.due_date }));
    invUpd.push({ id: inv.id, proof_url: f.objectPath });
  }

  // ── Works: report, invoice and photos once done; a photo of the problem otherwise ──
  const works = (await tx`
    SELECT w.id, w.title, w.description, w.type, w.priority, w.status, w.start_date, w.end_date, w.completed_at, w.created_at, w.estimated_amount, w.actual_amount, w.invoice_amount,
      b.name AS building, l.number AS lot, p.name AS supplier
    FROM travaux w JOIN buildings b ON b.id = w.building_id LEFT JOIN lots l ON l.id = w.lot_id LEFT JOIN prestataires p ON p.id = w.prestataire_id WHERE b.syndicate_id = ${c.sid}`) as any[];
  const workUpd: Row[] = [];
  for (const [i, w] of works.entries()) {
    const photos: string[] = [];
    if (w.status === "pending_validation" || w.status === "completed") {
      const amount = w.actual_amount ?? w.invoice_amount ?? w.estimated_amount;
      const ref = `BT-${String(w.created_at.toISOString?.() ?? w.created_at).slice(0, 4)}-${String(i + 1).padStart(4, "0")}`;
      const report = await save("rapport d'intervention", `Rapport ${w.title}`, c.admin.id, P.interventionReportDoc(c, { reference: ref, title: w.title, description: w.description, building: w.building, lot: w.lot, supplier: w.supplier, type: w.type, priority: w.priority, reportedAt: w.created_at, start: w.start_date, end: w.end_date ?? (w.completed_at ? String(w.completed_at.toISOString?.() ?? w.completed_at).slice(0, 10) : null), amount, status: w.status }));
      const invNo = `F-${ref.slice(3)}`;
      const invoice = await save("facture fournisseur", `Facture ${invNo}`, c.admin.id, P.supplierInvoice(c, w.supplier ?? c.name, invNo, w.end_date ?? w.created_at, [[w.title, "1", amount ?? "0", amount ?? "0"]], { building: w.building }));
      for (let k = 0; k < 2; k++) photos.push((await save("photo", `Photo ${w.title} ${k + 1}`, c.admin.id, "png")).objectPath);
      workUpd.push({ id: w.id, report_url: report.objectPath, invoice_url: invoice.objectPath, invoice_amount: amount ?? null, photo_urls: JSON.stringify(photos) });
      doc(report, { title: `Rapport d'intervention — ${w.title}`, category: "technique", visibility: "council", createdBy: c.admin.id, at: w.end_date ?? w.created_at, entityType: "travaux", entityId: w.id });
    } else if (w.status !== "cancelled" && r.chance(0.6)) {
      photos.push((await save("photo", `Photo ${w.title}`, c.admin.id, "png")).objectPath);
      workUpd.push({ id: w.id, report_url: null, invoice_url: null, invoice_amount: w.invoice_amount ?? null, photo_urls: JSON.stringify(photos) });
    }
  }

  // ── Insurance claims (sinistres) ──
  const sins = (await tx`
    SELECT s.id, s.type, s.status, s.estimated_amount, s.date, s.claim_number, b.name AS building, s.reported_by_id
    FROM sinistres s JOIN buildings b ON b.id = s.building_id WHERE b.syndicate_id = ${c.sid}`) as any[];
  const sinUpd: Row[] = [];
  for (const s of sins) {
    const imgs: string[] = [];
    for (let k = 0; k < r.int(1, 2); k++) imgs.push((await save("photo", `Sinistre ${s.claim_number ?? s.id} ${k + 1}`, s.reported_by_id ?? c.admin.id, "png")).objectPath);
    let quote: string | null = null;
    if ((s.status === "repair" || s.status === "closed") && s.estimated_amount) {
      quote = (await save("devis", `Devis reparation ${s.claim_number}`, c.admin.id, P.supplierInvoice(c, `Entreprise de réparation (${c.city.city})`, `DEV-${s.claim_number ?? s.id.slice(0, 6)}`, s.date, [[`Remise en état suite au sinistre ${s.claim_number ?? ""} — ${s.building}`, "1", s.estimated_amount, s.estimated_amount]], { kind: "DEVIS", building: s.building }))).objectPath;
    }
    sinUpd.push({ id: s.id, image_urls: JSON.stringify(imgs), invoice_url: quote });
  }

  // ── Marketplace pictures ──
  const products = (await tx`SELECT id, name, seller_id FROM products WHERE syndicate_id = ${c.sid}`) as any[];
  const prodUpd: Row[] = [];
  for (const p of products) {
    const imgs: string[] = [];
    for (let k = 0; k < r.int(1, 3); k++) imgs.push((await save("photo", `${p.name} ${k + 1}`, p.seller_id ?? c.admin.id, "png")).objectPath);
    prodUpd.push({ id: p.id, image_urls: JSON.stringify(imgs) });
  }

  // storage_objects + documents first, then the links on the business rows
  await flush(tx, b, g.order, g.counts);
  await updateMany(tx, "appel_payments", payUpd, { id: "text", proof_url: "text" });
  await updateMany(tx, "prestataires", prestUpd, { id: "text", document_url: "text" });
  await updateMany(tx, "contrats_prestataires", contractUpd, { id: "text", document_url: "text" });
  await updateMany(tx, "invoices", invUpd, { id: "text", proof_url: "text" });
  await updateMany(tx, "travaux", workUpd, { id: "text", report_url: "text", invoice_url: "text", invoice_amount: "numeric", photo_urls: "text" });
  await updateMany(tx, "sinistres", sinUpd, { id: "text", image_urls: "text", invoice_url: "text" });
  await updateMany(tx, "products", prodUpd, { id: "text", image_urls: "text" });
}
