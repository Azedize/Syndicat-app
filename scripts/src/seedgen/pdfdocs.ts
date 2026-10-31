/**
 * Business documents of the test data set, as PdfSpec (rendered by
 * files.ts). Every figure printed comes from the records passed in: amounts,
 * dates, references, lots, tantièmes, votes. Nothing legal or fiscal is
 * added: no VAT, no penalty, no article of law, no "certified" mention.
 * Each page carries "DOCUMENT FICTIF — TEST".
 */
import type { PdfSpec } from "./files.js";

export interface Org {
  name: string;
  lines: string[];
}
/** What the templates need from a generated condominium. */
export interface SyndicCtx {
  name: string;
  city: { city: string };
  district: string;
  buildings: { id: string; name: string; address: string }[];
}

const FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d) : d;
  if (Number.isNaN(x.getTime())) return String(d);
  return `${x.getUTCDate()} ${FR_MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

export function fmtMoney(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  const [i, f] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${f} MAD`;
}
const num = (v: number | string) => fmtMoney(v).replace(" MAD", "");

export function syndicOrg(c: SyndicCtx): Org {
  const addr = c.buildings[0]?.address ?? c.district;
  return { name: c.name, lines: [`${addr}, ${c.city.city}`, `Syndic de la copropriété — ${c.buildings.length} immeuble(s)`] };
}

// ─── Supplier documents ───────────────────────────────────────────────────────

/** Supplier invoice or quote; total = sum of the lines given. */
export function supplierInvoice(
  c: SyndicCtx,
  supplier: string,
  number: string,
  date: Date | string,
  rows: [string, string, string | number, string | number][],
  opts: { kind?: "FACTURE" | "DEVIS"; dueDate?: Date | string | null; building?: string | null; note?: string } = {},
): PdfSpec {
  const kind = opts.kind ?? "FACTURE";
  const total = rows.reduce((s, r) => s + Number(r[3]), 0);
  return {
    kind,
    title: `${kind === "DEVIS" ? "Devis" : "Facture"} ${number}`,
    reference: number,
    date: `${kind === "DEVIS" ? "Établi" : "Émise"} le ${fmtDate(date)}`,
    issuer: { name: supplier, lines: ["Prestataire de services de la copropriété", `${c.city.city}`] },
    recipient: { label: kind === "DEVIS" ? "Destinataire" : "Facturé à", name: c.name, lines: [opts.building ?? c.buildings[0]?.name ?? "", syndicOrg(c).lines[0]] },
    keyValues: [
      ["Date", fmtDate(date)],
      ...(opts.dueDate ? ([["Échéance", fmtDate(opts.dueDate)]] as [string, string][]) : []),
      ["Montant total", fmtMoney(total)],
    ],
    sections: [
      {
        heading: "Détail",
        table: {
          columns: [{ label: "Désignation", width: 6 }, { label: "Qté", width: 1, align: "right" }, { label: "Prix unitaire", width: 2, align: "right" }, { label: "Montant", width: 2, align: "right" }],
          rows: rows.map(([l, q, u, t]) => [l, q, num(u), num(t)]),
          totals: [["Total", fmtMoney(total)]],
        },
      },
      ...(opts.note ? [{ paragraphs: [opts.note] }] : []),
    ],
    signature: `Pour ${supplier}`,
  };
}

/** Maintenance / service contract between the condominium and a supplier. */
export function contractDoc(c: SyndicCtx, k: { title: string; supplier: string; building: string; start: string; end: string | null; monthly: string | number | null; annual: string | number | null; autoRenew: boolean; status: string; terminatedAt?: string | Date | null; reference: string }): PdfSpec {
  const statusFr: Record<string, string> = { active: "En vigueur", expired: "Expiré", terminated: "Résilié" };
  return {
    kind: "CONTRAT",
    title: k.title,
    reference: k.reference,
    date: `Prise d'effet le ${fmtDate(k.start)}`,
    issuer: syndicOrg(c),
    recipient: { label: "Prestataire", name: k.supplier, lines: [`Immeuble concerné : ${k.building}`] },
    keyValues: [
      ["Début", fmtDate(k.start)],
      ["Fin", fmtDate(k.end)],
      ["Montant mensuel", k.monthly ? fmtMoney(k.monthly) : "—"],
      ["Montant annuel", k.annual ? fmtMoney(k.annual) : "—"],
      ["Reconduction", k.autoRenew ? "Oui" : "Non"],
      ["Statut", statusFr[k.status] ?? k.status],
    ],
    sections: [
      { heading: "Objet", paragraphs: [`Le présent contrat confie au prestataire « ${k.supplier} » la prestation « ${k.title} », pour l'immeuble ${k.building} de la copropriété ${c.name}.`] },
      { heading: "Conditions financières", keyValues: [["Facturation", k.monthly ? `${fmtMoney(k.monthly)} par mois` : "Selon devis"], ["Total annuel", k.annual ? fmtMoney(k.annual) : "—"]] },
      ...(k.terminatedAt ? [{ heading: "Fin du contrat", paragraphs: [`Contrat ${k.status === "terminated" ? "résilié" : "arrivé à échéance"} le ${fmtDate(k.terminatedAt)}.`] }] : []),
      { paragraphs: ["Document de démonstration : les clauses juridiques d'un contrat réel ne sont pas reproduites."] },
    ],
    signature: `Pour ${c.name}`,
  };
}

// ─── Governance ───────────────────────────────────────────────────────────────

export function rulesDoc(c: SyndicCtx, k: { reference: string; date: string; buildings: { name: string; address: string; lots: number; tantiemes: number }[] }): PdfSpec {
  const totalLots = k.buildings.reduce((s, b) => s + b.lots, 0);
  const totalT = k.buildings.reduce((s, b) => s + b.tantiemes, 0);
  return {
    kind: "RÈGLEMENT",
    title: `Règlement de copropriété — ${c.name}`,
    reference: k.reference,
    date: `Version du ${fmtDate(k.date)}`,
    issuer: syndicOrg(c),
    keyValues: [["Immeubles", String(k.buildings.length)], ["Lots", String(totalLots)], ["Total des tantièmes", String(totalT)]],
    sections: [
      { heading: "1. Désignation de l'ensemble immobilier", paragraphs: [`La copropriété ${c.name} (${c.district}, ${c.city.city}) comprend ${k.buildings.length} immeuble(s) et ${totalLots} lots.`] },
      {
        heading: "2. Répartition des quotes-parts",
        table: {
          columns: [{ label: "Immeuble", width: 4 }, { label: "Adresse", width: 5 }, { label: "Lots", width: 1, align: "right" }, { label: "Tantièmes", width: 2, align: "right" }],
          rows: k.buildings.map((b) => [b.name, b.address, String(b.lots), String(b.tantiemes)]),
          totals: [["Total", String(totalT)]],
        },
      },
      { heading: "3. Parties privatives et parties communes", paragraphs: ["Chaque lot comprend une partie privative et une quote-part des parties communes exprimée en tantièmes, figurant au tableau ci-dessus et au registre des lots."] },
      { heading: "4. Charges", paragraphs: ["Les charges communes sont réparties entre les lots au prorata des tantièmes, selon les budgets votés en assemblée générale et les appels de fonds émis par le syndic."] },
      { heading: "5. Usage et vie de la copropriété", bullets: ["Respect de la tranquillité des occupants.", "Accès aux parties communes et aux équipements dans le respect des consignes affichées.", "Signalement au syndic de tout incident affectant les parties communes."] },
      { paragraphs: ["Texte de démonstration : il ne reproduit ni un règlement réel ni des dispositions légales."] },
    ],
    signature: `Pour ${c.name}`,
  };
}

export function budgetDoc(c: SyndicCtx, k: { year: number; building: string; buildingId: string; status: string; votedAt: string | Date | null; total: string | number; charges: string | number; reserve: string | number; lines: { category: string; label: string; annual: string | number; q: (string | number)[] }[] }): PdfSpec {
  return {
    kind: "BUDGET",
    title: `Budget prévisionnel ${k.year} — ${k.building}`,
    reference: `BUD-${k.year}-${k.buildingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    date: k.votedAt ? `Voté le ${fmtDate(k.votedAt)}` : `Exercice ${k.year}`,
    issuer: syndicOrg(c),
    keyValues: [["Charges courantes", fmtMoney(k.charges)], ["Fonds de réserve", fmtMoney(k.reserve)], ["Total", fmtMoney(k.total)], ["Statut", k.status]],
    sections: [
      {
        heading: "Postes budgétaires",
        table: {
          columns: [{ label: "Poste", width: 5 }, { label: "T1", width: 2, align: "right" }, { label: "T2", width: 2, align: "right" }, { label: "T3", width: 2, align: "right" }, { label: "T4", width: 2, align: "right" }, { label: "Annuel", width: 2, align: "right" }],
          rows: k.lines.map((l) => [l.label || l.category, ...l.q.map((v) => num(v)), num(l.annual)]),
          totals: [["Total des postes", fmtMoney(k.lines.reduce((s, l) => s + Number(l.annual), 0))], ["Charges du budget", fmtMoney(k.charges)]],
        },
      },
      { paragraphs: ["Les appels de fonds trimestriels sont calculés à partir de ce budget, au prorata des tantièmes de chaque lot."] },
    ],
    signature: `Pour ${c.name}`,
  };
}

export function convocationDoc(c: SyndicCtx, m: { title: string; date: string; time: string | null; location: string | null; agenda: string | null; reference: string; sentAt: Date }): PdfSpec {
  const items = (m.agenda ?? "").split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
  return {
    kind: "CONVOCATION",
    title: m.title,
    reference: m.reference,
    date: `Envoyée le ${fmtDate(m.sentAt)}`,
    issuer: syndicOrg(c),
    recipient: { label: "Destinataires", name: "Mesdames et Messieurs les copropriétaires", lines: [c.name] },
    keyValues: [["Date", fmtDate(m.date)], ["Heure", m.time ?? "—"], ["Lieu", m.location ?? "—"]],
    sections: [
      { paragraphs: [`Vous êtes convoqué(e) à la réunion « ${m.title} » qui se tiendra le ${fmtDate(m.date)}${m.time ? ` à ${m.time}` : ""}${m.location ? `, ${m.location}` : ""}.`] },
      { heading: "Ordre du jour", bullets: items.length ? items : ["Ordre du jour communiqué séparément."] },
      { paragraphs: ["Un copropriétaire empêché peut donner procuration à un autre copropriétaire depuis l'application."] },
    ],
    signature: `Le syndic — ${c.name}`,
  };
}

export function minutesDoc(c: SyndicCtx, m: { title: string; date: string; time: string | null; location: string | null; reference: string; attendees: number; proxies: number; totalTantiemes: number; resolutions: { number: number; title: string; majority: string; for: number; against: number; abstain: number; result: string }[] }): PdfSpec {
  const majFr: Record<string, string> = { simple: "Simple", absolute: "Absolue", qualified: "Deux tiers", unanimite: "Unanimité" };
  const resFr: Record<string, string> = { adopted: "Adoptée", rejected: "Rejetée", pending: "En attente" };
  return {
    kind: "PROCÈS-VERBAL",
    title: `Procès-verbal — ${m.title}`,
    reference: m.reference,
    date: `Séance du ${fmtDate(m.date)}`,
    issuer: syndicOrg(c),
    keyValues: [["Date", `${fmtDate(m.date)}${m.time ? ` à ${m.time}` : ""}`], ["Lieu", m.location ?? "—"], ["Présents", String(m.attendees)], ["Procurations", String(m.proxies)], ["Tantièmes de la copropriété", String(m.totalTantiemes)]],
    sections: [
      { heading: "Ouverture", paragraphs: [`La séance est ouverte le ${fmtDate(m.date)}${m.time ? ` à ${m.time}` : ""}. ${m.attendees} participant(s) présent(s) et ${m.proxies} procuration(s) enregistrée(s).`] },
      m.resolutions.length
        ? {
            heading: "Résolutions",
            table: {
              columns: [{ label: "N°", width: 1 }, { label: "Résolution", width: 5 }, { label: "Majorité", width: 2 }, { label: "Pour", width: 2, align: "right" }, { label: "Contre", width: 2, align: "right" }, { label: "Abst.", width: 2, align: "right" }, { label: "Résultat", width: 2 }],
              rows: m.resolutions.map((r) => [String(r.number), r.title, majFr[r.majority] ?? r.majority, String(r.for), String(r.against), String(r.abstain), resFr[r.result] ?? r.result]),
            },
          }
        : { heading: "Résolutions", paragraphs: ["Aucune résolution soumise au vote lors de cette séance."] },
      { paragraphs: ["Les voix sont exprimées en tantièmes. Le résultat de chaque résolution est celui enregistré dans l'application."] },
    ],
    signature: `Le président de séance — ${c.name}`,
  };
}

// ─── Owners' finance ──────────────────────────────────────────────────────────

export function callNoticeDoc(c: SyndicCtx, k: { reference: string; period: string; building: string; lot: string; tantiemes: number; debtors: string[]; amount: string | number; paid: string | number; dueDate: string | null; issueDate: string | null; status: string; budgetYear: number | null; bank: string | null; iban: string | null }): PdfSpec {
  const remaining = Math.max(0, Number(k.amount) - Number(k.paid));
  const statusFr: Record<string, string> = { paid: "Payé", partially_paid: "Partiellement payé", overdue: "En retard", pending: "À payer", pending_validation: "Paiement en validation", rejected: "Paiement refusé" };
  return {
    kind: "APPEL DE FONDS",
    title: `Avis d'appel de fonds ${k.period} — Lot ${k.lot}`,
    reference: k.reference,
    date: k.issueDate ? `Émis le ${fmtDate(k.issueDate)}` : undefined,
    issuer: syndicOrg(c),
    recipient: { label: "Copropriétaire(s)", name: k.debtors[0] ?? "—", lines: [...k.debtors.slice(1), `${k.building} — Lot ${k.lot}`, `${k.tantiemes} tantièmes`] },
    keyValues: [["Période", k.period], ["Échéance", fmtDate(k.dueDate)], ["Montant appelé", fmtMoney(k.amount)], ["Déjà réglé", fmtMoney(k.paid)], ["Reste dû", fmtMoney(remaining)], ["Situation", statusFr[k.status] ?? k.status]],
    sections: [
      {
        heading: "Détail",
        table: {
          columns: [{ label: "Libellé", width: 6 }, { label: "Base", width: 3, align: "right" }, { label: "Montant", width: 3, align: "right" }],
          rows: [[`Charges courantes ${k.period}${k.budgetYear ? ` (budget ${k.budgetYear})` : ""}`, `${k.tantiemes} tantièmes`, num(k.amount)]],
          totals: [["Montant appelé", fmtMoney(k.amount)], ["Reste dû", fmtMoney(remaining)]],
        },
      },
      { heading: "Règlement", keyValues: [["Banque", k.bank ?? "—"], ["RIB", k.iban ?? "—"], ["Référence à rappeler", k.reference]] },
      { paragraphs: ["Le paiement peut être déclaré dans l'application avec un justificatif ; il est pris en compte après validation par le trésorier."] },
    ],
  };
}

export function receiptDoc(c: SyndicCtx, k: { receipt: string; payer: string; amount: string | number; method: string; reference: string | null; validatedAt: string | Date | null; period: string; lot: string; building: string; callAmount: string | number; remaining: string | number; journal: string | null }): PdfSpec {
  const methodFr: Record<string, string> = { virement: "Virement", cheque: "Chèque", especes: "Espèces" };
  return {
    kind: "REÇU",
    title: `Reçu de paiement ${k.receipt}`,
    reference: k.receipt,
    date: k.validatedAt ? `Validé le ${fmtDate(k.validatedAt)}` : undefined,
    issuer: syndicOrg(c),
    recipient: { label: "Reçu de", name: k.payer, lines: [`${k.building} — Lot ${k.lot}`] },
    keyValues: [["Montant reçu", fmtMoney(k.amount)], ["Mode", methodFr[k.method] ?? k.method], ["Référence", k.reference ?? "—"], ["Écriture comptable", k.journal ?? "—"]],
    sections: [
      {
        heading: "Imputation",
        table: {
          columns: [{ label: "Appel de fonds", width: 5 }, { label: "Montant appelé", width: 3, align: "right" }, { label: "Ce paiement", width: 3, align: "right" }, { label: "Reste dû", width: 3, align: "right" }],
          rows: [[`Charges ${k.period} — Lot ${k.lot}`, num(k.callAmount), num(k.amount), num(k.remaining)]],
        },
      },
      { paragraphs: [`Le syndic de ${c.name} reconnaît avoir reçu la somme de ${fmtMoney(k.amount)} au titre de l'appel de fonds ${k.period} du lot ${k.lot}.`] },
    ],
    signature: `Le trésorier — ${c.name}`,
  };
}

/** Transfer order a co-owner attaches to a declared payment (written by the payer, not by a bank). */
export function transferOrderDoc(c: SyndicCtx, k: { payer: string; amount: string | number; date: string | Date; reference: string; period: string; lot: string; iban: string | null }): PdfSpec {
  return {
    kind: "ORDRE DE VIREMENT",
    title: `Ordre de virement — ${k.period}, lot ${k.lot}`,
    reference: k.reference,
    date: `Daté du ${fmtDate(k.date)}`,
    issuer: { name: k.payer, lines: ["Copropriétaire", c.name] },
    recipient: { label: "Bénéficiaire", name: c.name, lines: [k.iban ? `RIB ${k.iban}` : ""] },
    keyValues: [["Montant", fmtMoney(k.amount)], ["Motif", `Charges ${k.period} — lot ${k.lot}`], ["Référence", k.reference]],
    sections: [{ paragraphs: ["Justificatif joint à la déclaration de paiement ; la somme n'est créditée qu'après validation par le trésorier."] }],
  };
}

// ─── Works and incidents ──────────────────────────────────────────────────────

export function interventionReportDoc(c: SyndicCtx, k: { reference: string; title: string; description: string | null; building: string; lot: string | null; supplier: string | null; type: string; priority: string; reportedAt: string | Date; start: string | null; end: string | null; amount: string | number | null; status: string }): PdfSpec {
  const typeFr: Record<string, string> = { entretien: "Entretien courant", reparation: "Réparation", amelioration: "Amélioration", gros_travaux: "Gros travaux", urgence: "Urgence" };
  return {
    kind: "RAPPORT",
    title: `Rapport d'intervention — ${k.title}`,
    reference: k.reference,
    date: k.end ? `Intervention terminée le ${fmtDate(k.end)}` : undefined,
    issuer: k.supplier ? { name: k.supplier, lines: ["Prestataire intervenant", c.name] } : syndicOrg(c),
    recipient: { label: "Copropriété", name: c.name, lines: [k.building, k.lot ? `Lot ${k.lot}` : "Parties communes"] },
    keyValues: [["Type", typeFr[k.type] ?? k.type], ["Signalé le", fmtDate(k.reportedAt)], ["Début", fmtDate(k.start)], ["Fin", fmtDate(k.end)], ["Montant", k.amount ? fmtMoney(k.amount) : "—"]],
    sections: [
      { heading: "Demande", paragraphs: [k.description || k.title] },
      { heading: "Travaux réalisés", bullets: ["Constat sur place et sécurisation de la zone.", `Exécution de l'intervention « ${k.title} ».`, "Contrôle du bon fonctionnement et nettoyage du chantier."] },
      { heading: "Pièces jointes", paragraphs: ["Photos de l'intervention et facture du prestataire jointes au bon de travaux."] },
    ],
    signature: k.supplier ? `Pour ${k.supplier}` : `Pour ${c.name}`,
  };
}

// ─── Other library documents ──────────────────────────────────────────────────

const LIB_TEXT: Record<string, { kind: string; paragraphs: string[] }> = {
  avis: { kind: "AVIS", paragraphs: ["Le syndic informe les résidents de l'organisation des travaux et interventions prévus dans les parties communes.", "Merci de respecter les consignes affichées dans les halls et de signaler tout incident depuis l'application."] },
  assurance: { kind: "ATTESTATION", paragraphs: ["Le syndic atteste qu'un contrat d'assurance multirisque couvre les parties communes de l'immeuble pour la période indiquée.", "Les références du contrat sont disponibles auprès du syndic."] },
  technique: { kind: "DIAGNOSTIC", paragraphs: ["Constat visuel réalisé dans le cadre du suivi technique du lot.", "Aucune mesure ni conclusion d'un organisme agréé n'est reproduite dans ce document de démonstration."] },
  administratif: { kind: "COURRIER", paragraphs: ["Courrier interne relatif à la gestion administrative de la copropriété.", "Ce document est réservé à l'équipe de gestion."] },
  juridique: { kind: "NOTE", paragraphs: ["Note d'information à l'attention du conseil syndical.", "Elle ne constitue pas un avis juridique et ne cite aucune disposition légale."] },
  maintenance: { kind: "CARNET", paragraphs: ["Suivi des opérations d'entretien courant des équipements communs (ascenseurs, éclairage, réseaux).", "Le détail des interventions figure dans le module Travaux."] },
};

export function libraryDocument(c: SyndicCtx, category: string, title: string, date: Date, lot: string | null, subject: string | null): PdfSpec {
  const t = LIB_TEXT[category] ?? { kind: "DOCUMENT", paragraphs: ["Document de la copropriété."] };
  return {
    kind: t.kind,
    title,
    reference: `${t.kind.slice(0, 3)}-${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`,
    date: fmtDate(date),
    issuer: syndicOrg(c),
    ...(lot || subject ? { recipient: { label: "Concerne", name: subject ?? `Lot ${lot}`, lines: [c.name] } } : {}),
    sections: [{ paragraphs: t.paragraphs }],
    signature: `Le syndic — ${c.name}`,
  };
}
