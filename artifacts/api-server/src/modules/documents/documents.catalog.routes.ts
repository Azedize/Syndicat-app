// documents: catalog endpoints (mounted by documents.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { documentsTable, usersTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { expiryBucket } from "../../lib/retention.js";
import { documentVisibilityWhere } from "../../lib/document-access.js";
import { getSyndicateInfo, getPropertyInfo, getOfficeHolders } from "./documents.service.js";

const router = Router();

// ─── GET /documents/deleted — RECYCLE BIN ─────────────────────────────────────
// Lists soft-deleted documents (super_admin / syndicate_admin only), with
// search + category filter. Registered before "/:id" so it isn't shadowed.

router.get(
  "/documents/deleted",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const { search, category } = req.query as Record<string, string>;
    try {
      const conditions = [eq(documentsTable.isDeleted, true)];
      const syndicateId = req.user!.syndicateId;
      if (req.user!.role !== "super_admin") {
        if (!syndicateId) {
          res
            .status(403)
            .json({ error: "Accès refusé : syndicateId manquant" });
          return;
        }
        conditions.push(eq(documentsTable.syndicateId, syndicateId));
      } else if (syndicateId) {
        conditions.push(eq(documentsTable.syndicateId, syndicateId));
      }
      if (category)
        conditions.push(eq(documentsTable.category, category as any));
      if (search)
        conditions.push(
          sql`${documentsTable.title} ILIKE ${"%" + search + "%"}`,
        );

      const rows = await db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          category: documentsTable.category,
          status: documentsTable.status,
          size: documentsTable.size,
          documentNumber: documentsTable.documentNumber,
          deletedAt: documentsTable.deletedAt,
          deletedBy: documentsTable.deletedBy,
          deletedByName: usersTable.name,
          retentionUntil: documentsTable.retentionUntil,
        })
        .from(documentsTable)
        .leftJoin(usersTable, eq(documentsTable.deletedBy, usersTable.id))
        .where(and(...conditions))
        .orderBy(desc(documentsTable.deletedAt));

      res.json({ data: rows });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /documents/summary — dashboard aggregate ─────────────────────────────
// Real backend-computed counts by status + expiring-soon buckets (30/60/90 days),
// replacing the client-side heuristic previously used by the mobile dashboard.

router.get("/documents/summary", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    if (req.user!.role !== "super_admin" && !syndicateId) {
      res.status(403).json({ error: "Accès refusé : syndicateId manquant" });
      return;
    }
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    if (source !== undefined && source !== "generated" && source !== "upload") {
      res.status(400).json({ error: "source invalide (generated | upload)" });
      return;
    }
    const conditions = [eq(documentsTable.isDeleted, false)];
    if (syndicateId)
      conditions.push(eq(documentsTable.syndicateId, syndicateId));
    // Same scope as GET /documents?source=… so a tile's count matches the list it opens.
    if (source) conditions.push(eq(documentsTable.source, source));
    conditions.push((await documentVisibilityWhere(req.user!)) as any);

    const rows = await db
      .select({
        id: documentsTable.id,
        title: documentsTable.title,
        status: documentsTable.status,
        retentionUntil: documentsTable.retentionUntil,
      })
      .from(documentsTable)
      .where(and(...conditions));

    const byStatus: Record<string, number> = {};
    const expiring: {
      in30: typeof rows;
      in60: typeof rows;
      in90: typeof rows;
    } = { in30: [], in60: [], in90: [] };
    const now = new Date();

    for (const row of rows) {
      const st = row.status ?? "draft";
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      const bucket = expiryBucket(row.retentionUntil, now);
      if (bucket === 30) expiring.in30.push(row);
      else if (bucket === 60) expiring.in60.push(row);
      else if (bucket === 90) expiring.in90.push(row);
    }

    res.json({
      data: {
        total: rows.length,
        byStatus,
        expiring: {
          in30: expiring.in30.length,
          in60: expiring.in60.length,
          in90: expiring.in90.length,
          documents30: expiring.in30.slice(0, 10),
        },
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /documents/templates — Static template catalog ─────────────────────
// Returns all 30+ enterprise templates with full metadata: sections, variables,
// data sources. No auth required for super_admin; requireAuth for others.

router.get("/documents/templates", requireAuth, async (_req, res) => {
  const catalog = [
    {
      id: "attestation",
      name: "Attestation d'adhésion",
      category: "attestation",
      description:
        "Certifie officiellement qu'un membre est en règle auprès du syndicat.",
      icon: "award",
      color: "#8b5cf6",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête",
          description: "Logo, coordonnées et accréditation du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Informations du syndicat",
          description: "Nom, adresse, N° d'enregistrement",
          source: "syndicatesTable",
        },
        {
          title: "Attestation",
          description: "Corps du document avec nom du membre et date",
          source: "usersTable + input",
        },
        {
          title: "Signatures",
          description: "Bloc de signature officielle du président",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité avec URL publique",
          source: "documents (généré)",
        },
        {
          title: "Pied de page légal",
          description: "Référence légale et note de non-altération",
          source: "documents (généré)",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Nom du syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "syndicateAddress",
          label: "Adresse du syndicat",
          source: "syndicatesTable.address",
          required: false,
        },
        {
          name: "registrationNumber",
          label: "N° d'enregistrement",
          source: "syndicatesTable.registrationNumber",
          required: false,
        },
        {
          name: "memberName",
          label: "Nom du membre",
          source: "input utilisateur",
          required: true,
        },
        {
          name: "documentDate",
          label: "Date d'émission",
          source: "généré automatiquement",
          required: true,
        },
        {
          name: "presidentName",
          label: "Nom du président",
          source: "conseilSyndicalTable.name",
          required: false,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable (atomique)",
          required: true,
        },
        {
          name: "verificationQR",
          label: "QR de vérification",
          source: "généré automatiquement",
          required: true,
        },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "pv",
      name: "Procès-verbal de réunion",
      category: "pv",
      description:
        "Procès-verbal officiel enregistrant les délibérations et résolutions d'une réunion.",
      icon: "clipboard",
      color: "#10b981",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête",
          description: "Logo et coordonnées du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Informations de la réunion",
          description: "Date, lieu, heure, président de séance",
          source: "input",
        },
        {
          title: "Ordre du jour",
          description: "Points inscrits à l'ordre du jour",
          source: "input",
        },
        {
          title: "Délibérations",
          description: "Discussion et décisions de la réunion",
          source: "input",
        },
        {
          title: "Résolutions",
          description: "Résolutions officiellement adoptées",
          source: "input",
        },
        {
          title: "Signatures",
          description: "Président et secrétaire de séance",
          source: "conseilSyndicalTable + input",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité",
          source: "généré",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Nom du syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "meetingDate",
          label: "Date de réunion",
          source: "input utilisateur",
          required: true,
        },
        {
          name: "lieu",
          label: "Lieu de la réunion",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "heure",
          label: "Heure",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "presidentSeance",
          label: "Président de séance",
          source: "input / conseilSyndical",
          required: false,
        },
        {
          name: "agendaText",
          label: "Ordre du jour",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "deliberationsText",
          label: "Délibérations",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "resolutionsText",
          label: "Résolutions",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable",
          required: true,
        },
      ],
      requiredInputs: ["meetingDate"],
    },
    {
      id: "convocation",
      name: "Convocation officielle",
      category: "pv",
      description:
        "Convocation officielle adressée aux membres pour une réunion.",
      icon: "calendar",
      color: "#3b82f6",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête",
          description: "Logo et identité du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Destinataire",
          description: "Nom du ou des destinataires",
          source: "input / usersTable",
        },
        {
          title: "Objet de la convocation",
          description: "Raison de la convocation",
          source: "input",
        },
        {
          title: "Corps",
          description: "Texte officiel de convocation avec date, lieu, heure",
          source: "syndicatesTable + input",
        },
        {
          title: "Signatures",
          description: "Signature officielle du président",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité",
          source: "généré",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Nom du syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "memberName",
          label: "Destinataire",
          source: "input / usersTable",
          required: false,
        },
        {
          name: "meetingDate",
          label: "Date de la réunion",
          source: "input utilisateur",
          required: true,
        },
        {
          name: "lieu",
          label: "Lieu",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "heure",
          label: "Heure",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "objet",
          label: "Objet",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable",
          required: true,
        },
      ],
      requiredInputs: ["meetingDate"],
    },
    {
      id: "contrat",
      name: "Contrat",
      category: "juridique",
      description:
        "Contrat formel entre le syndicat et un tiers (prestataire, partenaire…).",
      icon: "file-text",
      color: "#0891b2",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête",
          description: "Logo et identité du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Parties contractantes",
          description: "Syndicat (Partie 1) et Tiers (Partie 2)",
          source: "syndicatesTable + input",
        },
        {
          title: "Objet du contrat",
          description: "Description de l'objet et des prestations",
          source: "input",
        },
        {
          title: "Contenu du contrat",
          description: "Clauses et conditions générales",
          source: "input",
        },
        {
          title: "Signatures",
          description: "Signatures des deux parties",
          source: "conseilSyndicalTable + input",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité",
          source: "généré",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Partie 1 (Syndicat)",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "partieB",
          label: "Partie 2",
          source: "input utilisateur",
          required: true,
        },
        {
          name: "objet",
          label: "Objet du contrat",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "content",
          label: "Corps du contrat",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable",
          required: true,
        },
      ],
      requiredInputs: ["partieB"],
    },
    {
      id: "decision",
      name: "Décision syndicale",
      category: "juridique",
      description: "Décision officielle prise par le bureau syndical.",
      icon: "check-circle",
      color: "#16a34a",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête",
          description: "Logo et identité du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Informations de la décision",
          description: "Organe décisionnel, date, objet",
          source: "input",
        },
        {
          title: "Corps de la décision",
          description: "Texte officiel de la décision",
          source: "input",
        },
        {
          title: "Signatures",
          description: "Président et bureau syndical",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité",
          source: "généré",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "organe",
          label: "Organe décisionnel",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "objet",
          label: "Objet de la décision",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "content",
          label: "Corps de la décision",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable",
          required: true,
        },
      ],
      requiredInputs: [],
    },
    {
      id: "mise_en_demeure",
      name: "Mise en demeure",
      category: "juridique",
      description:
        "Document légal de mise en demeure adressé à un débiteur ou contrevenant.",
      icon: "alert-circle",
      color: "#ef4444",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête",
          description: "Logo et identité du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Identité du destinataire",
          description: "Nom et coordonnées du mis en demeure",
          source: "input",
        },
        {
          title: "Objet de la mise en demeure",
          description: "Manquements constatés",
          source: "input",
        },
        {
          title: "Délai et conséquences",
          description: "Délai imparti et mesures en cas d'inexécution",
          source: "input",
        },
        {
          title: "Préambule",
          description: "Contexte juridique et factuel",
          source: "input",
        },
        {
          title: "Signatures",
          description: "Président du syndicat",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité",
          source: "généré",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Syndicat émetteur",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "memberName",
          label: "Mis en demeure",
          source: "input utilisateur",
          required: true,
        },
        {
          name: "objet",
          label: "Objet",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "delai",
          label: "Délai imparti",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "consequences",
          label: "Conséquences",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "preamble",
          label: "Préambule",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable",
          required: true,
        },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "rapport_financier",
      name: "Rapport financier",
      category: "finances",
      description:
        "Bilan financier de la période avec prévisions et réalisations.",
      icon: "dollar-sign",
      color: "#f59e0b",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête",
          description: "Logo et identité du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Informations de l'immeuble",
          description: "Résidence, adresse, N° de lots",
          source: "buildingsTable + lotsTable",
        },
        {
          title: "Exercice couvert",
          description: "Période financière analysée",
          source: "input",
        },
        {
          title: "Prévisions vs Réalisations",
          description: "Budget prévu vs réalisé",
          source: "input",
        },
        {
          title: "Observations",
          description: "Analyse et commentaires financiers",
          source: "input",
        },
        {
          title: "Approbation",
          description: "Établi et approuvé par",
          source: "input + conseilSyndicalTable",
        },
        {
          title: "Signatures",
          description: "Trésorier et président",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité",
          source: "généré",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "propertyName",
          label: "Résidence",
          source: "buildingsTable.name",
          required: false,
        },
        {
          name: "exercice",
          label: "Exercice comptable",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "totalPrevu",
          label: "Budget prévu",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "totalRealise",
          label: "Réalisé",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "observations",
          label: "Observations",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "etabliPar",
          label: "Établi par",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "approuvePar",
          label: "Approuvé par",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable",
          required: true,
        },
      ],
      requiredInputs: [],
    },
    // ── 3 smart certificate templates (auto-fills member + lot + building) ──────
    {
      id: "attestation_residence",
      name: "Attestation de résidence",
      category: "attestation",
      description:
        "Certifie officiellement la résidence d'un copropriétaire dans l'immeuble. Le nom, le bâtiment et le numéro d'appartement sont injectés automatiquement.",
      icon: "home",
      color: "#0891b2",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête professionnel",
          description: "Logo, coordonnées et accréditation du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Identité du résident",
          description: "Nom complet du copropriétaire / locataire",
          source: "usersTable + membersTable",
        },
        {
          title: "Détails de la résidence",
          description: "N° d'appartement, résidence, adresse, étage",
          source: "buildingsTable + lotsTable",
        },
        {
          title: "Corps de l'attestation",
          description: "Texte certifiant la résidence",
          source: "généré automatiquement",
        },
        {
          title: "Signature officielle",
          description: "Président du syndicat",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité avec URL publique",
          source: "documents (généré)",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Nom du syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "memberName",
          label: "Nom du résident",
          source: "membersTable.name (auto-rempli)",
          required: true,
        },
        {
          name: "lotNumber",
          label: "N° d'appartement",
          source: "lotsTable.number (auto-rempli)",
          required: false,
        },
        {
          name: "lotFloor",
          label: "Étage",
          source: "lotsTable.floor (auto-rempli)",
          required: false,
        },
        {
          name: "buildingName",
          label: "Résidence / Immeuble",
          source: "buildingsTable.name (auto-rempli)",
          required: false,
        },
        {
          name: "documentDate",
          label: "Date d'émission",
          source: "généré automatiquement",
          required: true,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable (ATT-RES)",
          required: true,
        },
        {
          name: "verificationQR",
          label: "QR de vérification",
          source: "généré automatiquement",
          required: true,
        },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "attestation_propriete",
      name: "Attestation de propriété",
      category: "attestation",
      description:
        "Certifie officiellement la propriété d'un lot de copropriété. Le titre foncier et les tantiièmes sont injectés depuis la base de données.",
      icon: "key",
      color: "#2563EB",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête professionnel",
          description: "Logo, coordonnées et accréditation du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Identité du propriétaire",
          description: "Nom complet du copropriétaire",
          source: "membersTable",
        },
        {
          title: "Détails du lot",
          description: "N° de lot, titre foncier, tantiièmes",
          source: "lotsTable",
        },
        {
          title: "Corps de l'attestation",
          description: "Texte certifiant la propriété",
          source: "généré automatiquement",
        },
        {
          title: "Avertissement légal",
          description: "Note : ne constitue pas un titre de propriété",
          source: "généré",
        },
        {
          title: "Signature officielle",
          description: "Président du syndicat",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité avec URL publique",
          source: "documents (généré)",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Nom du syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "memberName",
          label: "Nom du propriétaire",
          source: "membersTable.name (auto-rempli)",
          required: true,
        },
        {
          name: "lotNumber",
          label: "N° de lot",
          source: "lotsTable.number (auto-rempli)",
          required: false,
        },
        {
          name: "titreFoncier",
          label: "Titre Foncier",
          source: "lotsTable.titreFoncier (auto-rempli)",
          required: false,
        },
        {
          name: "tantiemes",
          label: "Quote-part / Tantiièmes",
          source: "lotsTable.tantiemes (auto-rempli)",
          required: false,
        },
        {
          name: "documentDate",
          label: "Date d'émission",
          source: "généré automatiquement",
          required: true,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable (ATT-PRO)",
          required: true,
        },
        {
          name: "verificationQR",
          label: "QR de vérification",
          source: "généré automatiquement",
          required: true,
        },
      ],
      requiredInputs: ["memberName"],
    },
    {
      id: "attestation_paiement",
      name: "Attestation de paiement des charges",
      category: "attestation",
      description:
        "Certifie que le copropriétaire est en règle de paiement de ses charges pour la période indiquée.",
      icon: "check-circle",
      color: "#16a34a",
      version: "2.0",
      author: "MIZAN",
      updatedAt: "2026-01-01",
      sections: [
        {
          title: "En-tête professionnel",
          description: "Logo, coordonnées et accréditation du syndicat",
          source: "syndicatesTable",
        },
        {
          title: "Identité du payeur",
          description: "Nom et N° de lot du copropriétaire",
          source: "membersTable + lotsTable",
        },
        {
          title: "Période et montant",
          description: "Période couverte et total des charges réglées",
          source: "input",
        },
        {
          title: "Corps de l'attestation",
          description: "Texte certifiant le paiement",
          source: "généré automatiquement",
        },
        {
          title: "Confirmation comptable",
          description: "Note de vérification comptable à la date de délivrance",
          source: "généré",
        },
        {
          title: "Signature officielle",
          description: "Président du syndicat",
          source: "conseilSyndicalTable",
        },
        {
          title: "QR de vérification",
          description: "Code QR d'authenticité avec URL publique",
          source: "documents (généré)",
        },
      ],
      variables: [
        {
          name: "syndicateName",
          label: "Nom du syndicat",
          source: "syndicatesTable.name",
          required: true,
        },
        {
          name: "memberName",
          label: "Nom du copropriétaire",
          source: "membersTable.name (auto-rempli)",
          required: true,
        },
        {
          name: "lotNumber",
          label: "N° de lot",
          source: "lotsTable.number (auto-rempli)",
          required: false,
        },
        {
          name: "periode",
          label: "Période couverte",
          source: "input utilisateur",
          required: true,
        },
        {
          name: "montant",
          label: "Montant total réglé (MAD)",
          source: "input utilisateur",
          required: false,
        },
        {
          name: "documentDate",
          label: "Date d'émission",
          source: "généré automatiquement",
          required: true,
        },
        {
          name: "documentNumber",
          label: "N° de document",
          source: "documentSequencesTable (ATT-PAI)",
          required: true,
        },
        {
          name: "verificationQR",
          label: "QR de vérification",
          source: "généré automatiquement",
          required: true,
        },
      ],
      requiredInputs: ["memberName", "periode"],
    },
  ];

  res.json({ data: catalog });
});

// ─── POST /documents/preview — Resolve variable values without generating PDF ─
// Takes same body as POST /documents but returns resolved variable values from
// the DB plus the template structure, so the mobile wizard can show a live preview.

router.post(
  "/documents/preview",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    if (req.user!.role === "syndicate_admin" && !req.user!.syndicateId) {
      res.status(403).json({ error: "Accès refusé : syndicateId manquant" });
      return;
    }
    const schema = z.object({
      templateId: z.string(),
      buildingId: z.string().optional(),
      memberName: z.string().optional(),
      language: z.enum(["fr", "ar", "en", "es"] as const).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res
        .status(400)
        .json({ error: "Données invalides", details: result.error.flatten() });
      return;
    }

    try {
      const { templateId, buildingId, memberName } = result.data;
      const syndicateId = req.user!.syndicateId;

      const [syndInfo, property, officeHolders] = await Promise.all([
        getSyndicateInfo(syndicateId),
        getPropertyInfo(syndicateId, buildingId),
        getOfficeHolders(syndicateId),
      ]);

      const today = new Date().toLocaleDateString("fr-FR");
      const year = new Date().getFullYear();

      const resolvedVariables: Record<string, string | null> = {
        syndicateName: syndInfo.name || null,
        syndicateAddress: syndInfo.address || null,
        syndicateCity: syndInfo.city || null,
        syndicatePhone: syndInfo.phone || null,
        syndicateEmail: syndInfo.email || null,
        registrationNumber: syndInfo.registrationNumber || null,
        syndicateColor: syndInfo.logoColor || null,
        propertyName: property?.name || null,
        propertyAddress: property?.address || null,
        propertyCity: property?.city || null,
        totalBuildings: property ? String(property.totalBuildings) : null,
        totalFloors: property ? String(property.totalFloors) : null,
        totalLots: property ? String(property.totalLots) : null,
        totalSurfaceM2: property?.totalSurfaceM2
          ? `${property.totalSurfaceM2} m²`
          : null,
        landRegistryReference: property?.landRegistryReference ?? null,
        presidentName: officeHolders?.president?.fullName ?? null,
        presidentEmail: officeHolders?.president?.email ?? null,
        vicePresidentName: officeHolders?.vicePresident?.fullName ?? null,
        secretaryName: officeHolders?.secretary?.fullName ?? null,
        treasurerName: officeHolders?.treasurer?.fullName ?? null,
        managerName: officeHolders?.manager?.fullName ?? null,
        managerPhone: officeHolders?.manager?.phone ?? null,
        memberName: memberName || null,
        documentDate: today,
        documentYear: String(year),
        documentNumber: `[GÉNÉRÉ — ex: ATT-${year}-0001]`,
        verificationQR: "[QR généré automatiquement à la création]",
        bankName: syndInfo.bankName || null,
        bankIban: syndInfo.bankIban || null,
        bankBic: syndInfo.bankBic || null,
      };

      res.json({
        data: {
          templateId,
          syndicateInfo: syndInfo,
          propertyInfo: property ?? null,
          officeHolders: officeHolders ?? null,
          resolvedVariables,
          resolvedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      req.log.error(err);
      res
        .status(500)
        .json({ error: "Erreur lors de la résolution des variables" });
    }
  },
);

export default router;
