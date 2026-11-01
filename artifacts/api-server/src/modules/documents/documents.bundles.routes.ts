// documents: bundles endpoints (mounted by documents.routes.ts, in order).
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { moneySum, toCents } from "../../lib/treasury.js";
import { findForeignReference, resolveDocumentSubject } from "../../lib/scope.js";
import { db } from "@workspace/db";
import {
  documentsTable,
  buildingsTable,
  lotsTable,
  membersTable,
  appelsDeFondsTable,
  invoicesTable,
  budgetsTable,
  electionsTable,
  meetingsTable,
  tenantsTable,
  sinistresTable,
  travauxTable,
  prestatairesTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { generateAndUploadDocument, type DocumentTemplate, type DocumentLanguage } from "../../lib/documentPdf.js";
import { createAlert } from "../../lib/notify.js";
import { computeRetentionUntil } from "../../lib/retention.js";
import { localToday } from "../../lib/charge-time.js";
import {
  buildVerifyUrl,
  generateSequentialDocumentNumber,
  getSyndicateInfo,
  getPropertyInfo,
  getOfficeHolders,
  getMeetingData,
  getLotMemberData,
  getAttestationPaiementData,
} from "./documents.service.js";

const router = Router();

// ─── GET /documents/entities ──────────────────────────────────────────────────
// Returns selectable entity lists for smart document generation.
// The mobile wizard calls this to populate entity pickers (meeting selector,
// lot selector, invoice selector, etc.) so users never re-type data that exists in DB.
//
//   ?type = meetings | lots | members | elections | invoices | appels | budgets

router.get("/documents/entities", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const syndicateId = user.syndicateId;
    const type = String(req.query.type ?? "meetings");

    if (!syndicateId) {
      if (user.role !== "super_admin") {
        res.status(403).json({ error: "Accès refusé : syndicateId manquant" });
        return;
      }
      res.json({ data: [] });
      return;
    }

    type EntityItem = { id: string; label: string; sublabel: string };
    let data: EntityItem[] = [];

    switch (type) {
      case "meetings": {
        const rows = await db
          .select({
            id: meetingsTable.id,
            title: meetingsTable.title,
            date: meetingsTable.date,
            type: meetingsTable.type,
            location: meetingsTable.location,
          })
          .from(meetingsTable)
          .where(eq(meetingsTable.syndicateId, syndicateId))
          .orderBy(desc(meetingsTable.date))
          .limit(50);
        data = rows.map((r) => ({
          id: r.id,
          label: r.title,
          sublabel: [r.date, r.type, r.location].filter(Boolean).join("  •  "),
        }));
        break;
      }
      case "lots": {
        const rows = await db
          .select({
            id: lotsTable.id,
            number: lotsTable.number,
            floor: lotsTable.floor,
            buildingName: buildingsTable.name,
            ownerName: membersTable.name,
          })
          .from(lotsTable)
          .leftJoin(buildingsTable, eq(lotsTable.buildingId, buildingsTable.id))
          .leftJoin(membersTable, eq(lotsTable.ownerId, membersTable.id))
          .where(eq(buildingsTable.syndicateId, syndicateId))
          .orderBy(lotsTable.number)
          .limit(200);
        data = rows.map((r) => ({
          id: r.id,
          label: `Lot ${r.number ?? "—"}${r.floor != null ? ` — Étage ${r.floor}` : ""}`,
          sublabel: [r.buildingName, r.ownerName].filter(Boolean).join("  •  "),
        }));
        break;
      }
      case "members": {
        const rows = await db
          .select({
            id: membersTable.id,
            name: membersTable.name,
            email: membersTable.email,
            phone: membersTable.phone,
          })
          .from(membersTable)
          .where(eq(membersTable.syndicateId, syndicateId))
          .orderBy(membersTable.name)
          .limit(200);
        data = rows.map((r) => ({
          id: r.id,
          label: r.name,
          sublabel: [r.email, r.phone].filter(Boolean).join("  •  "),
        }));
        break;
      }
      case "elections": {
        const rows = await db
          .select({
            id: electionsTable.id,
            title: electionsTable.title,
            status: electionsTable.status,
            startDate: electionsTable.startDate,
            electionType: electionsTable.electionType,
          })
          .from(electionsTable)
          .where(eq(electionsTable.syndicateId, syndicateId))
          .orderBy(desc(electionsTable.startDate))
          .limit(50);
        data = rows.map((r) => ({
          id: r.id,
          label: r.title,
          sublabel: [r.startDate, r.electionType, r.status]
            .filter(Boolean)
            .join("  •  "),
        }));
        break;
      }
      case "invoices": {
        const rows = await db
          .select({
            id: invoicesTable.id,
            reference: invoicesTable.reference,
            recipient: invoicesTable.recipient,
            amount: invoicesTable.amount,
            status: invoicesTable.status,
            dueDate: invoicesTable.dueDate,
          })
          .from(invoicesTable)
          .where(eq(invoicesTable.syndicateId, syndicateId))
          .orderBy(desc(invoicesTable.createdAt))
          .limit(100);
        data = rows.map((r) => ({
          id: r.id,
          label: [r.reference, r.recipient].filter(Boolean).join(" — "),
          sublabel: [
            `${Number(r.amount ?? 0).toLocaleString("fr-MA")} MAD`,
            r.status,
            r.dueDate,
          ]
            .filter(Boolean)
            .join("  •  "),
        }));
        break;
      }
      case "appels": {
        // appelsDeFondsTable has no syndicateId; scope via buildingId → buildingsTable
        const rows = await db
          .select({
            id: appelsDeFondsTable.id,
            period: appelsDeFondsTable.period,
            amount: appelsDeFondsTable.amount,
            status: appelsDeFondsTable.status,
            type: appelsDeFondsTable.type,
            ownerName: membersTable.name,
            lotNumber: lotsTable.number,
          })
          .from(appelsDeFondsTable)
          .innerJoin(
            buildingsTable,
            eq(appelsDeFondsTable.buildingId, buildingsTable.id),
          )
          .leftJoin(
            membersTable,
            eq(appelsDeFondsTable.ownerId, membersTable.id),
          )
          .leftJoin(lotsTable, eq(appelsDeFondsTable.lotId, lotsTable.id))
          .where(eq(buildingsTable.syndicateId, syndicateId))
          .orderBy(desc(appelsDeFondsTable.createdAt))
          .limit(200);
        data = rows.map((r) => ({
          id: r.id,
          label: `${r.period ?? "—"} — ${Number(r.amount ?? 0).toLocaleString("fr-MA")} MAD`,
          sublabel: [
            r.ownerName,
            r.lotNumber ? `Lot ${r.lotNumber}` : "",
            r.status,
          ]
            .filter(Boolean)
            .join("  •  "),
        }));
        break;
      }
      case "budgets": {
        const rows = await db
          .select({
            id: budgetsTable.id,
            year: budgetsTable.year,
            totalAmount: budgetsTable.totalAmount,
            status: budgetsTable.status,
            buildingName: buildingsTable.name,
          })
          .from(budgetsTable)
          .leftJoin(
            buildingsTable,
            eq(budgetsTable.buildingId, buildingsTable.id),
          )
          .where(eq(buildingsTable.syndicateId, syndicateId))
          .orderBy(desc(budgetsTable.year))
          .limit(50);
        data = rows.map((r) => ({
          id: r.id,
          label: `Budget ${r.year} — ${r.buildingName ?? "—"}`,
          sublabel: [
            `${Number(r.totalAmount ?? 0).toLocaleString("fr-MA")} MAD`,
            r.status,
          ]
            .filter(Boolean)
            .join("  •  "),
        }));
        break;
      }
      case "tenants": {
        const rows = await db
          .select({
            id: tenantsTable.id,
            name: tenantsTable.name,
            phone: tenantsTable.phone,
            email: tenantsTable.email,
            leaseStart: tenantsTable.leaseStart,
            leaseEnd: tenantsTable.leaseEnd,
            monthlyRent: tenantsTable.monthlyRent,
            status: tenantsTable.status,
            lotNumber: lotsTable.number,
            buildingName: buildingsTable.name,
          })
          .from(tenantsTable)
          .leftJoin(lotsTable, eq(tenantsTable.lotId, lotsTable.id))
          .leftJoin(
            buildingsTable,
            eq(tenantsTable.buildingId, buildingsTable.id),
          )
          .where(eq(tenantsTable.syndicateId, syndicateId))
          .orderBy(tenantsTable.name)
          .limit(200);
        data = rows.map((r) => ({
          id: r.id,
          label: r.name,
          sublabel: [
            r.lotNumber ? `Lot ${r.lotNumber}` : null,
            r.buildingName,
            r.monthlyRent
              ? `${Number(r.monthlyRent).toLocaleString("fr-MA")} MAD/mois`
              : null,
            r.status,
          ]
            .filter(Boolean)
            .join("  •  "),
        }));
        break;
      }
      case "sinistres": {
        const rows = await db
          .select({
            id: sinistresTable.id,
            type: sinistresTable.type,
            description: sinistresTable.description,
            date: sinistresTable.date,
            status: sinistresTable.status,
            urgency: sinistresTable.urgency,
            claimNumber: sinistresTable.claimNumber,
            buildingName: buildingsTable.name,
          })
          .from(sinistresTable)
          .innerJoin(
            buildingsTable,
            eq(sinistresTable.buildingId, buildingsTable.id),
          )
          .where(eq(buildingsTable.syndicateId, syndicateId))
          .orderBy(desc(sinistresTable.createdAt))
          .limit(100);
        data = rows.map((r) => ({
          id: r.id,
          label: `${r.type} — ${r.buildingName ?? "—"}`,
          sublabel: [
            r.date,
            r.status,
            r.urgency !== "normal" ? `⚡ ${r.urgency}` : null,
            r.claimNumber,
          ]
            .filter(Boolean)
            .join("  •  "),
        }));
        break;
      }
      case "travaux": {
        const rows = await db
          .select({
            id: travauxTable.id,
            title: travauxTable.title,
            type: travauxTable.type,
            status: travauxTable.status,
            priority: travauxTable.priority,
            startDate: travauxTable.startDate,
            estimatedAmount: travauxTable.estimatedAmount,
            buildingName: buildingsTable.name,
            prestataireName: prestatairesTable.name,
          })
          .from(travauxTable)
          .innerJoin(
            buildingsTable,
            eq(travauxTable.buildingId, buildingsTable.id),
          )
          .leftJoin(
            prestatairesTable,
            eq(travauxTable.prestataireId, prestatairesTable.id),
          )
          .where(eq(buildingsTable.syndicateId, syndicateId))
          .orderBy(desc(travauxTable.createdAt))
          .limit(100);
        data = rows.map((r) => ({
          id: r.id,
          label: r.title,
          sublabel: [
            r.type,
            r.status,
            r.prestataireName,
            r.estimatedAmount
              ? `${Number(r.estimatedAmount).toLocaleString("fr-MA")} MAD`
              : null,
            r.startDate,
          ]
            .filter(Boolean)
            .join("  •  "),
        }));
        break;
      }
      default:
        data = [];
    }

    res.json({ data });
  } catch (err) {
    req.log.error(err);
    res
      .status(500)
      .json({ error: "Erreur lors de la récupération des entités" });
  }
});

// ─── GET /documents/available-templates — Role-aware catalog with families ───────
// Returns templates filtered by user role, organized by document family.
// tenant  → residence cert + complaint only
// member  → all attestations + sale bundle
// admin   → everything + recovery / AG bundles

router.get("/documents/available-templates", requireAuth, async (req, res) => {
  const role = req.user!.role;

  type TplEntry = {
    id: string;
    name: string;
    family: string;
    familyLabel: string;
    icon: string;
    color: string;
    category: string;
    description: string;
    allowedRoles: string[];
    isBundle: boolean;
    requiresBalance: boolean;
    autoFilled: string[];
  };

  const ALL: TplEntry[] = [
    // ── FAMILLE 1: CERTIFICATS ──────────────────────────────────────────────────
    {
      id: "attestation_residence",
      name: "Attestation de résidence",
      family: "certificates",
      familyLabel: "Certificats",
      icon: "home",
      color: "#0891b2",
      category: "attestation",
      description:
        "Prouve la résidence dans la copropriété. Utile pour inscriptions scolaires, démarches administratives.",
      allowedRoles: ["member", "tenant", "syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Nom complet", "Numéro de lot", "Bâtiment", "Adresse"],
    },
    {
      id: "attestation_propriete",
      name: "Attestation de propriété",
      family: "certificates",
      familyLabel: "Certificats",
      icon: "key",
      color: "#2563EB",
      category: "attestation",
      description:
        "Certifie la propriété d'un lot. Titre foncier et tantièmes injectés automatiquement.",
      allowedRoles: ["member", "syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: [
        "Nom du propriétaire",
        "Titre foncier",
        "Tantièmes",
        "N° de lot",
      ],
    },
    {
      id: "attestation_paiement",
      name: "Attestation de paiement des charges",
      family: "certificates",
      familyLabel: "Certificats",
      icon: "check-circle",
      color: "#16a34a",
      category: "attestation",
      description:
        "Certifie que les charges sont à jour. Bloquée automatiquement si des impayés existent.",
      allowedRoles: ["member", "syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: true,
      autoFilled: [
        "Total payé",
        "Solde",
        "Date du dernier paiement",
        "Historique des charges",
      ],
    },
    {
      id: "attestation",
      name: "Attestation d'adhésion",
      family: "certificates",
      familyLabel: "Certificats",
      icon: "award",
      color: "#8b5cf6",
      category: "attestation",
      description: "Certifie l'appartenance au syndicat de copropriété.",
      allowedRoles: ["member", "syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Nom du membre", "Coordonnées", "Syndicat"],
    },
    // ── FAMILLE 2: FINANCES ─────────────────────────────────────────────────────
    {
      id: "rapport_financier",
      name: "Rapport financier",
      family: "finance",
      familyLabel: "Finances",
      icon: "dollar-sign",
      color: "#f59e0b",
      category: "finances",
      description:
        "Bilan financier complet avec prévisions, réalisations et indicateurs clés.",
      allowedRoles: ["member", "syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Données financières complètes depuis la comptabilité"],
    },
    {
      id: "appel_de_fonds",
      name: "Appel de fonds",
      family: "finance",
      familyLabel: "Finances",
      icon: "file-text",
      color: "#06b6d4",
      category: "finances",
      description:
        "Appel de charges communes avec données copropriétaire auto-injectées.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Données copropriétaire", "Montant des charges"],
    },
    {
      id: "facture",
      name: "Facture",
      family: "finance",
      familyLabel: "Finances",
      icon: "file-minus",
      color: "#dc2626",
      category: "finances",
      description: "Facture officielle avec lignes et montants automatiques.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Lignes de facturation depuis la comptabilité"],
    },
    {
      id: "decompte_charges",
      name: "Décompte de charges",
      family: "finance",
      familyLabel: "Finances",
      icon: "bar-chart-2",
      color: "#f59e0b",
      category: "finances",
      description:
        "Détail des charges sur une période donnée pour un copropriétaire.",
      allowedRoles: ["member", "syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Charges calculées depuis le lot"],
    },
    // ── FAMILLE 3: GOUVERNANCE ──────────────────────────────────────────────────
    {
      id: "pv",
      name: "Procès-verbal de réunion",
      family: "governance",
      familyLabel: "Gouvernance",
      icon: "clipboard",
      color: "#10b981",
      category: "pv",
      description:
        "PV officiel enregistrant les délibérations et résolutions d'une réunion.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Bureau syndical", "Ordre du jour depuis la réunion"],
    },
    {
      id: "convocation",
      name: "Convocation officielle",
      family: "governance",
      familyLabel: "Gouvernance",
      icon: "calendar",
      color: "#3b82f6",
      category: "pv",
      description:
        "Convocation officielle adressée aux membres pour une réunion.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Coordonnées du syndicat", "Bureau syndical"],
    },
    {
      id: "decision",
      name: "Décision syndicale",
      family: "governance",
      familyLabel: "Gouvernance",
      icon: "check-circle",
      color: "#16a34a",
      category: "pv",
      description: "Décision officielle prise par le bureau syndical.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Bureau syndical"],
    },
    // ── FAMILLE 4: JURIDIQUE ────────────────────────────────────────────────────
    {
      id: "contrat",
      name: "Contrat",
      family: "legal",
      familyLabel: "Juridique",
      icon: "file-text",
      color: "#0891b2",
      category: "juridique",
      description:
        "Contrat formel entre le syndicat et un tiers (prestataire, partenaire).",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Coordonnées du syndicat"],
    },
    {
      id: "mise_en_demeure",
      name: "Mise en demeure",
      family: "legal",
      familyLabel: "Juridique",
      icon: "alert-circle",
      color: "#ef4444",
      category: "juridique",
      description: "Document légal de mise en demeure adressé à un débiteur.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: false,
      requiresBalance: false,
      autoFilled: ["Données du débiteur depuis membersTable"],
    },
    // ── FAMILLE 5: DOSSIERS (BUNDLES) ───────────────────────────────────────────
    {
      id: "bundle_sale",
      name: "Dossier de vente",
      family: "bundles",
      familyLabel: "Dossiers",
      icon: "package",
      color: "#7c3aed",
      category: "attestation",
      description:
        "4 documents requis par le notaire pour la vente d'un appartement. Générés en une seule opération.",
      allowedRoles: ["member", "syndicate_admin", "super_admin"],
      isBundle: true,
      requiresBalance: false,
      autoFilled: [
        "Attestation propriété",
        "Attestation paiement",
        "Rapport financier",
        "Décision syndicale",
      ],
    },
    {
      id: "bundle_recovery",
      name: "Dossier de recouvrement",
      family: "bundles",
      familyLabel: "Dossiers",
      icon: "alert-triangle",
      color: "#dc2626",
      category: "juridique",
      description:
        "5 documents escaladés automatiquement : relance amiable → officielle → mise en demeure → rapport → dossier juridique.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: true,
      requiresBalance: false,
      autoFilled: [
        "Historique des impayés",
        "Montants",
        "Relances précédentes",
      ],
    },
    {
      id: "bundle_ag",
      name: "Dossier Assemblée Générale",
      family: "bundles",
      familyLabel: "Dossiers",
      icon: "users",
      color: "#3b82f6",
      category: "pv",
      description:
        "Convocation + PV + Décisions générés automatiquement pour l'Assemblée Générale.",
      allowedRoles: ["syndicate_admin", "super_admin"],
      isBundle: true,
      requiresBalance: false,
      autoFilled: ["Membres du syndicat", "Bureau syndical"],
    },
  ];

  const filtered = ALL.filter((t) => t.allowedRoles.includes(role));

  const familyMeta: Record<string, { color: string }> = {
    certificates: { color: "#0891b2" },
    finance: { color: "#f59e0b" },
    governance: { color: "#10b981" },
    legal: { color: "#ef4444" },
    operations: { color: "#1F5EFF" },
    administration: { color: "#8b5cf6" },
    bundles: { color: "#7c3aed" },
  };

  const familiesMap: Record<
    string,
    { id: string; label: string; color: string; templates: TplEntry[] }
  > = {};
  for (const tpl of filtered) {
    if (!familiesMap[tpl.family]) {
      familiesMap[tpl.family] = {
        id: tpl.family,
        label: tpl.familyLabel,
        color: familyMeta[tpl.family]?.color ?? "#1F5EFF",
        templates: [],
      };
    }
    familiesMap[tpl.family].templates.push(tpl);
  }

  res.json({
    data: {
      role,
      families: Object.values(familiesMap),
      total: filtered.length,
    },
  });
});

// ─── POST /documents/payment-certificate/check — Eligibility pre-check ────────
// Returns whether the requesting member can obtain a payment certificate.
// Checks for outstanding charges; blocks if any exist.

router.post(
  "/documents/payment-certificate/check",
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user!;
      const syndicateId = user.syndicateId ?? null;
      if (!syndicateId) {
        res.status(400).json({ error: "Aucun syndicat associé" });
        return;
      }

      // Find the member's lot (owners only)
      const memberRows = await db
        .select({
          memberId: membersTable.id,
          lotId: lotsTable.id,
          lotNumber: lotsTable.number,
        })
        .from(membersTable)
        .leftJoin(lotsTable, eq(lotsTable.ownerId, membersTable.id))
        .where(
          and(
            eq(membersTable.syndicateId, syndicateId),
            eq(membersTable.email, user.email ?? ""),
          ),
        )
        .limit(1);

      const member = memberRows[0] ?? null;
      if (!member?.lotId) {
        res.json({
          data: {
            eligible: false,
            blockedReason: "Aucun lot trouvé pour ce compte.",
            totalPaid: 0,
            totalCharged: 0,
            remainingBalance: 0,
            overdueCount: 0,
            lastPaymentDate: null,
          },
        });
        return;
      }

      const appels = await db
        .select({
          amount: appelsDeFondsTable.amount,
          amountPaid: appelsDeFondsTable.amountPaid,
          status: appelsDeFondsTable.status,
          period: appelsDeFondsTable.period,
          paidDate: appelsDeFondsTable.paidDate,
        })
        .from(appelsDeFondsTable)
        .where(
          and(
            eq(appelsDeFondsTable.lotId, member.lotId),
            sql`${appelsDeFondsTable.status} <> 'cancelled'`,
          ),
        );

      const totalPaid = moneySum(appels.map((a) => a.amountPaid));
      const totalCharged = appels.reduce(
        (s, a) => s + Number(a.amount ?? 0),
        0,
      );
      const overdueItems = appels.filter((a) =>
        ["overdue", "pending", "partially_paid", "rejected", "pending_validation"].includes(a.status ?? ""),
      );
      const overdueAmount = overdueItems.reduce((s, a) => s + toCents(a.amount) - toCents(a.amountPaid), 0) / 100;
      const remainingBalance = Math.max(0, totalCharged - totalPaid);
      const hasOverdue = overdueItems.length > 0 || remainingBalance > 0;
      const lastPaymentDate =
        appels
          .filter((a) => a.status === "paid" && a.paidDate)
          .sort((a, b) => (b.paidDate ?? "").localeCompare(a.paidDate ?? ""))[0]
          ?.paidDate ?? null;

      const eligible = !hasOverdue;
      const blockedReason = !eligible
        ? `Ce certificat ne peut pas être délivré car ${overdueItems.length > 0 ? `${overdueItems.length} charge(s) impayée(s) existent` : "le solde n'est pas apuré"}. Montant dû : ${remainingBalance.toLocaleString("fr-MA")} MAD.`
        : null;

      res.json({
        data: {
          eligible,
          blockedReason,
          totalPaid,
          totalCharged,
          remainingBalance,
          overdueCount: overdueItems.length,
          overdueAmount,
          lastPaymentDate,
          lotNumber: member.lotNumber,
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /documents/recovery-package — 5-step debt recovery bundle ───────────
// Generates the full escalation chain for a debtor member (admin/treasurer only):
//   Step 1: Relance amiable (convocation template)
//   Step 2: Relance officielle (decision template)
//   Step 3: Mise en demeure
//   Step 4: Rapport de dette (rapport_financier)
//   Step 5: Dossier juridique (contrat)

router.post(
  "/documents/recovery-package",
  requireAuth,
  requireRole("syndicate_admin", "super_admin"),
  async (req, res) => {
    const schema = z.object({
      memberId: z.string().uuid(),
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Données invalides", details: parsed.error.flatten() });
      return;
    }

    try {
      const user = req.user!;
      const syndicateId = user.syndicateId ?? null;
      if (!syndicateId && user.role !== "super_admin") {
        res.status(403).json({ error: "syndicateId requis" });
        return;
      }
      const { memberId, language = "fr" } = parsed.data;
      if (
        syndicateId &&
        (await findForeignReference(syndicateId, { memberId }))
      ) {
        res.status(404).json({ error: "Membre introuvable" });
        return;
      }
      // Recovery letters concern one co-owner: only they (and the team) see them.
      const recoverySubject = await resolveDocumentSubject(syndicateId, { memberId });
      const docLanguage: DocumentLanguage = language as DocumentLanguage;

      const [syndInfo, property, officeHolders, lotMemberData, memberRows] =
        await Promise.all([
          getSyndicateInfo(syndicateId),
          getPropertyInfo(syndicateId),
          getOfficeHolders(syndicateId),
          getLotMemberData(undefined, memberId),
          db
            .select({ name: membersTable.name, email: membersTable.email })
            .from(membersTable)
            .where(eq(membersTable.id, memberId))
            .limit(1),
        ]);

      const member = memberRows[0];
      if (!member) {
        res.status(404).json({ error: "Membre introuvable" });
        return;
      }

      const [lotRow] = await db
        .select({ id: lotsTable.id, number: lotsTable.number })
        .from(lotsTable)
        .where(eq(lotsTable.ownerId, memberId))
        .limit(1);
      const lotId = lotRow?.id ?? null;
      const debtData = lotId
        ? await getAttestationPaiementData(lotId, undefined, syndicateId)
        : {};

      const memberName = member.name ?? lotMemberData.memberName ?? "Inconnu";
      const totalCharged = Number(
        (debtData as any)._totalCharged
          ?.replace(/\s/g, "")
          .replace(/,/g, ".") ?? 0,
      );
      const totalPaid = Number(
        (debtData as any).montant?.replace(/\s/g, "").replace(/,/g, ".") ?? 0,
      );
      const totalDue = Math.max(0, totalCharged - totalPaid).toLocaleString(
        "fr-MA",
      );

      const steps: Array<{
        step: number;
        template: DocumentTemplate;
        category: "pv" | "juridique" | "finances";
        title: string;
        extra: Record<string, string>;
      }> = [
        {
          step: 1,
          template: "convocation",
          category: "pv",
          title: `Relance amiable — ${memberName}`,
          extra: {
            objet: `1ère relance : charges impayées — Montant dû : ${totalDue} MAD`,
            heure: "",
            meetingDate: localToday(),
          },
        },
        {
          step: 2,
          template: "decision",
          category: "pv",
          title: `Relance officielle — ${memberName}`,
          extra: {
            objet: `2ème relance officielle — Charges impayées : ${totalDue} MAD`,
            organe: "Bureau syndical",
            content: `Malgré notre relance amiable, les charges restent impayées. Montant total dû : ${totalDue} MAD. Délai accordé : 8 jours.`,
          },
        },
        {
          step: 3,
          template: "mise_en_demeure",
          category: "juridique",
          title: `Mise en demeure — ${memberName}`,
          extra: {
            objet: `Non-paiement des charges — ${totalDue} MAD`,
            delai: "48 heures",
            consequences:
              "Procédure judiciaire — frais à la charge du débiteur",
            preamble: `Malgré deux relances restées sans suite, les charges de copropriété demeurent impayées.`,
          },
        },
        {
          step: 4,
          template: "rapport_financier",
          category: "finances",
          title: `Rapport de dette — ${memberName}`,
          extra: {
            observations: `Rapport de situation financière du copropriétaire ${memberName}. Total impayé : ${totalDue} MAD. Nb appels : ${(debtData as any)._appelCount ?? "—"}.`,
            etabliPar: officeHolders?.treasurer?.fullName ?? "",
          },
        },
        {
          step: 5,
          template: "contrat",
          category: "juridique",
          title: `Dossier juridique — ${memberName}`,
          extra: {
            partieB: memberName,
            objet: `Constitution du dossier de recouvrement judiciaire pour ${memberName}`,
            content: `Dossier constitué suite à l'échec des procédures amiable et officielle. Montant litigieux : ${totalDue} MAD.`,
          },
        },
      ];

      const createdDocs: {
        step: number;
        documentId: string;
        title: string;
        documentNumber: string;
      }[] = [];

      for (const s of steps) {
        const docNumber = await generateSequentialDocumentNumber(
          syndicateId,
          s.template,
        );
        const verificationToken = randomUUID();
        const createdAt = new Date();
        const generated = await generateAndUploadDocument(s.template, {
          title: s.title,
          syndicate: syndInfo,
          property,
          officeHolders,
          memberName,
          documentNumber: docNumber,
          docStatus: "generated",
          version: "v1.0",
          language: docLanguage,
          verificationUrl: buildVerifyUrl(verificationToken),
          signatures: [],
          ...lotMemberData,
          ...(debtData as Record<string, string>),
          ...s.extra,
        });
        const [doc] = await db
          .insert(documentsTable)
          .values({
            title: s.title,
            category: s.category,
            status: "generated",
            syndicateId,
            subjectUserId: recoverySubject,
            size: generated.fileSizeKo,
            fileUrl: generated.fileUrl ?? null,
            documentNumber: generated.documentNumber,
            templateId: s.template,
            version: 1,
            isDeleted: false,
            createdBy: user.userId,
            updatedAt: createdAt,
            language: docLanguage,
            verificationToken,
            retentionUntil: computeRetentionUntil(
              s.category,
              s.template,
              createdAt,
            ),
            generationParams: {
              memberId,
              lotId,
              step: s.step,
              bundleType: "recovery",
            },
          } as any)
          .returning();
        createdDocs.push({
          step: s.step,
          documentId: doc.id,
          title: doc.title,
          documentNumber: doc.documentNumber ?? docNumber,
        });
      }

      await serverAuditLog(req, {
        action: "RECOVERY_PACKAGE_GENERATED",
        entity: "document",
        entityId: createdDocs[0]?.documentId ?? memberId,
        details: `Dossier recouvrement — ${memberName} — ${createdDocs.length} docs`,
      });
      if (syndicateId) {
        createAlert({
          key: "document.recoveryPack",
          params: { count: createdDocs.length, member: memberName },
          type: "warning",
          syndicateId,
          target: "admin",
        }).catch(() => {});
      }

      res.status(201).json({
        data: {
          memberName,
          totalDue,
          documents: createdDocs,
          message: `Dossier de recouvrement complet : ${createdDocs.length} documents générés.`,
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({
        error:
          "Erreur serveur lors de la génération du dossier de recouvrement",
      });
    }
  },
);

// ─── POST /documents/sale-bundle — Apartment sale document bundle ─────────────
// Generates 4 documents required by notary for apartment sale:
//   1. Attestation de propriété
//   2. Attestation de paiement
//   3. Rapport financier
//   4. Décision syndicale (situation)
// Available to owners (for their own lot) and admins.

router.post("/documents/sale-bundle", requireAuth, async (req, res) => {
  const schema = z.object({
    lotId: z.string().uuid(),
    language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Données invalides", details: parsed.error.flatten() });
    return;
  }

  try {
    const user = req.user!;
    const syndicateId = user.syndicateId ?? null;
    const { lotId, language = "fr" } = parsed.data;
    const docLanguage: DocumentLanguage = language as DocumentLanguage;

    // The lot must belong to the caller's syndicate (any role).
    if (syndicateId && (await findForeignReference(syndicateId, { lotId }))) {
      res.status(404).json({ error: "Lot introuvable" });
      return;
    }
    // The sale file concerns the lot owner only.
    const saleSubject = await resolveDocumentSubject(syndicateId, { lotId });

    // Members can only request for their own lot
    if (user.role === "member" || user.role === "tenant") {
      const [lotCheck] = await db
        .select({ ownerId: lotsTable.ownerId })
        .from(lotsTable)
        .where(eq(lotsTable.id, lotId))
        .limit(1);
      if (lotCheck?.ownerId) {
        const [mc] = await db
          .select({ id: membersTable.id })
          .from(membersTable)
          .where(
            and(
              eq(membersTable.id, lotCheck.ownerId),
              eq(membersTable.email, user.email ?? ""),
            ),
          )
          .limit(1);
        if (!mc) {
          res.status(403).json({
            error:
              "Vous ne pouvez demander ce dossier que pour votre propre lot",
          });
          return;
        }
      }
    }

    const [syndInfo, property, officeHolders, lotMemberData, paiementData] =
      await Promise.all([
        getSyndicateInfo(syndicateId),
        getPropertyInfo(syndicateId),
        getOfficeHolders(syndicateId),
        getLotMemberData(lotId, undefined),
        getAttestationPaiementData(lotId, undefined, syndicateId),
      ]);

    const memberName = lotMemberData.memberName || "Propriétaire";
    const bundleItems: Array<{
      template: DocumentTemplate;
      category: "attestation" | "finances" | "pv";
      title: string;
      extra?: Record<string, string>;
    }> = [
      {
        template: "attestation_propriete",
        category: "attestation",
        title: `Attestation de propriété — ${memberName}`,
      },
      {
        template: "attestation_paiement",
        category: "attestation",
        title: `Attestation de paiement — ${memberName}`,
      },
      {
        template: "rapport_financier",
        category: "finances",
        title: `Rapport financier — Dossier de vente`,
      },
      {
        template: "decision",
        category: "pv",
        title: `Situation syndicale — ${memberName}`,
        extra: {
          organe: "Bureau syndical",
          objet: `Certification pour dossier de vente — Lot ${lotMemberData.lotNumber ?? lotId}`,
        },
      },
    ];

    const createdDocs: {
      documentId: string;
      title: string;
      templateId: string;
      documentNumber: string;
    }[] = [];

    for (const item of bundleItems) {
      const docNumber = await generateSequentialDocumentNumber(
        syndicateId,
        item.template,
      );
      const verificationToken = randomUUID();
      const createdAt = new Date();
      const generated = await generateAndUploadDocument(item.template, {
        title: item.title,
        syndicate: syndInfo,
        property,
        officeHolders,
        memberName,
        documentNumber: docNumber,
        docStatus: "generated",
        version: "v1.0",
        language: docLanguage,
        verificationUrl: buildVerifyUrl(verificationToken),
        signatures: [],
        lotId,
        ...lotMemberData,
        ...paiementData,
        ...(item.extra ?? {}),
      });
      const [doc] = await db
        .insert(documentsTable)
        .values({
          title: item.title,
          category: item.category,
          status: "generated",
          syndicateId,
          subjectUserId: saleSubject,
          size: generated.fileSizeKo,
          fileUrl: generated.fileUrl ?? null,
          documentNumber: generated.documentNumber,
          templateId: item.template,
          version: 1,
          isDeleted: false,
          createdBy: user.userId,
          updatedAt: createdAt,
          language: docLanguage,
          verificationToken,
          retentionUntil: computeRetentionUntil(
            item.category,
            item.template,
            createdAt,
          ),
          generationParams: { lotId, bundleType: "sale" },
        } as any)
        .returning();
      createdDocs.push({
        documentId: doc.id,
        title: doc.title,
        templateId: item.template,
        documentNumber: doc.documentNumber ?? docNumber,
      });
    }

    await serverAuditLog(req, {
      action: "SALE_BUNDLE_GENERATED",
      entity: "document",
      entityId: createdDocs[0]?.documentId ?? lotId,
      details: `Dossier de vente — ${memberName} — Lot ${lotId} — ${createdDocs.length} docs`,
    });
    res.status(201).json({
      data: {
        memberName,
        lotNumber: lotMemberData.lotNumber,
        documents: createdDocs,
        message: `Dossier de vente complet : ${createdDocs.length} documents générés.`,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({
      error: "Erreur serveur lors de la génération du dossier de vente",
    });
  }
});

// ─── POST /documents/ag-bundle — Assemblée Générale document bundle ─────────────
// Generates AG documentation package (secretary/admin only):
//   1. Convocation officielle
//   2. Procès-verbal de réunion
//   3. Décision syndicale (résolutions)

router.post(
  "/documents/ag-bundle",
  requireAuth,
  requireRole("syndicate_admin", "super_admin"),
  async (req, res) => {
    const schema = z.object({
      meetingId: z.string().uuid().optional(),
      meetingDate: z.string().optional(),
      lieu: z.string().max(300).optional(),
      heure: z.string().max(50).optional(),
      agendaText: z.string().max(5000).optional(),
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Données invalides", details: parsed.error.flatten() });
      return;
    }

    try {
      const user = req.user!;
      const syndicateId = user.syndicateId ?? null;
      if (!syndicateId && user.role !== "super_admin") {
        res.status(403).json({ error: "syndicateId requis" });
        return;
      }
      const {
        meetingId,
        meetingDate,
        lieu,
        heure,
        agendaText,
        language = "fr",
      } = parsed.data;
      const docLanguage: DocumentLanguage = language as DocumentLanguage;

      if (
        syndicateId &&
        meetingId &&
        (await findForeignReference(syndicateId, { meetingId }))
      ) {
        res.status(404).json({ error: "Réunion introuvable" });
        return;
      }

      const [syndInfo, property, officeHolders] = await Promise.all([
        getSyndicateInfo(syndicateId),
        getPropertyInfo(syndicateId),
        getOfficeHolders(syndicateId),
      ]);

      const meetingData = meetingId ? await getMeetingData(meetingId) : {};
      const agDate =
        meetingDate ??
        meetingData.meetingDate ??
        localToday();
      const agTitle = `AG du ${agDate}`;

      const agDocs: Array<{
        template: DocumentTemplate;
        category: "pv";
        title: string;
        extra: Record<string, string>;
      }> = [
        {
          template: "convocation",
          category: "pv",
          title: `Convocation — ${agTitle}`,
          extra: {
            meetingDate: agDate,
            lieu: lieu ?? meetingData.lieu ?? "",
            heure: heure ?? meetingData.heure ?? "",
            objet:
              agendaText ??
              meetingData.agendaText ??
              "Assemblée Générale annuelle",
          },
        },
        {
          template: "pv",
          category: "pv",
          title: `Procès-verbal — ${agTitle}`,
          extra: {
            meetingDate: agDate,
            lieu: lieu ?? meetingData.lieu ?? "",
            heure: heure ?? meetingData.heure ?? "",
            agendaText: agendaText ?? meetingData.agendaText ?? "",
          },
        },
        {
          template: "decision",
          category: "pv",
          title: `Décisions AG — ${agTitle}`,
          extra: {
            organe: "Assemblée Générale",
            objet: `Résolutions de l'AG du ${agDate}`,
            meetingDate: agDate,
          },
        },
      ];

      const createdDocs: {
        documentId: string;
        title: string;
        templateId: string;
        documentNumber: string;
      }[] = [];

      for (const item of agDocs) {
        const docNumber = await generateSequentialDocumentNumber(
          syndicateId,
          item.template,
        );
        const verificationToken = randomUUID();
        const createdAt = new Date();
        const generated = await generateAndUploadDocument(item.template, {
          title: item.title,
          syndicate: syndInfo,
          property,
          officeHolders,
          documentNumber: docNumber,
          docStatus: "generated",
          version: "v1.0",
          language: docLanguage,
          verificationUrl: buildVerifyUrl(verificationToken),
          signatures: [],
          ...meetingData,
          ...item.extra,
        });
        const [doc] = await db
          .insert(documentsTable)
          .values({
            title: item.title,
            category: item.category,
            status: "generated",
            syndicateId,
            size: generated.fileSizeKo,
            fileUrl: generated.fileUrl ?? null,
            documentNumber: generated.documentNumber,
            templateId: item.template,
            version: 1,
            isDeleted: false,
            createdBy: user.userId,
            updatedAt: createdAt,
            language: docLanguage,
            verificationToken,
            retentionUntil: computeRetentionUntil(
              item.category,
              item.template,
              createdAt,
            ),
            generationParams: {
              meetingId: meetingId ?? null,
              bundleType: "ag",
            },
          } as any)
          .returning();
        createdDocs.push({
          documentId: doc.id,
          title: doc.title,
          templateId: item.template,
          documentNumber: doc.documentNumber ?? docNumber,
        });
      }

      await serverAuditLog(req, {
        action: "AG_BUNDLE_GENERATED",
        entity: "document",
        entityId: createdDocs[0]?.documentId ?? syndicateId ?? "",
        details: `Dossier AG — ${agTitle} — ${createdDocs.length} docs`,
      });
      if (syndicateId) {
        createAlert({
          key: "document.agPack",
          params: { count: createdDocs.length, meeting: agTitle },
          type: "info",
          syndicateId,
          target: "admin",
        }).catch(() => {});
      }

      res.status(201).json({
        data: {
          agTitle,
          meetingDate: agDate,
          documents: createdDocs,
          message: `Dossier AG complet : ${createdDocs.length} documents générés.`,
        },
      });
    } catch (err) {
      req.log.error(err);
      res
        .status(500)
        .json({ error: "Erreur serveur lors de la génération du dossier AG" });
    }
  },
);

export default router;
