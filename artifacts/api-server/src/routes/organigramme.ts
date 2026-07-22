/**
 * Organigramme du Syndicat
 * Enterprise organizational chart module — full governance hierarchy with
 * dashboard stats, role details, and (super_admin) national view.
 *
 * Endpoints:
 *   GET /organigramme           — hierarchy + stats for current syndicate
 *   GET /organigramme/national  — super_admin: all syndicates governance status
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  conseilSyndicalTable,
  usersTable,
  syndicatesTable,
  membersTable,
  buildingsTable,
  lotsTable,
} from "@workspace/db/schema";
import { eq, and, or, inArray, lt, gte, count, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ─── Role → colour token ────────────────────────────────────────────────────
function roleColor(role: string | null | undefined): string {
  switch (role) {
    case "syndicate_admin": return "#2563EB";
    case "president":       return "#7C3AED";
    case "treasurer":       return "#059669";
    case "secretary":       return "#EA580C";
    case "committee_member":return "#6B7280";
    default:                return "#6B7280";
  }
}

// ─── Role → label ───────────────────────────────────────────────────────────
function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "syndicate_admin":  return "Admin de Syndicat";
    case "president":        return "Président";
    case "treasurer":        return "Trésorier";
    case "secretary":        return "Secrétaire";
    case "committee_member": return "Membre du Bureau";
    default:                 return "Membre";
  }
}

// ─── Role permissions matrix ────────────────────────────────────────────────
function rolePermissions(role: string | null | undefined) {
  const base = {
    modules: [] as string[],
    approvalRights: [] as string[],
    signatureRights: [] as string[],
    reportsAccess: [] as string[],
    documentAccess: [] as string[],
    financialAccess: [] as string[],
    permissions: [] as string[],
  };

  switch (role) {
    case "syndicate_admin":
      return {
        ...base,
        modules: ["Administration", "Membres", "Finance", "Documents", "Réunions", "Gouvernance", "Marketplace", "Support"],
        approvalRights: ["Toutes les dépenses", "Membres", "Documents", "Fournisseurs"],
        signatureRights: ["Tous documents", "Contrats", "PV d'assemblée", "Actes administratifs"],
        reportsAccess: ["Financiers", "Activité", "Statistiques", "Audit"],
        documentAccess: ["Création", "Modification", "Archivage", "Publication"],
        financialAccess: ["Budget", "Charges", "Paiements", "Comptabilité", "Recouvrement"],
        permissions: ["Gestion plateforme", "Gestion utilisateurs", "Configuration résidence", "Paramètres globaux", "Permissions"],
      };
    case "president":
      return {
        ...base,
        modules: ["Gouvernance", "Assemblées", "Documents", "Réunions", "Travaux", "Budget"],
        approvalRights: ["Décisions AG", "Travaux > 50 000 MAD", "Contrats prestataires"],
        signatureRights: ["PV d'assemblée", "Contrats", "Décisions officielles", "Actes notariaux"],
        reportsAccess: ["Gouvernance", "Financiers (lecture)", "Activité"],
        documentAccess: ["Lecture", "Signature", "Approbation"],
        financialAccess: ["Budget (lecture)", "Rapport financier (lecture)"],
        permissions: ["Gouvernance", "Prises de décision", "Approbations", "Signatures", "Direction stratégique"],
      };
    case "treasurer":
      return {
        ...base,
        modules: ["Finance", "Charges", "Budget", "Rapports financiers", "Recouvrement"],
        approvalRights: ["Dépenses opérationnelles", "Appels de fonds", "Remboursements"],
        signatureRights: ["Chèques", "Virements", "Rapports financiers", "Reçus de paiement"],
        reportsAccess: ["Financiers complets", "Trésorerie", "Recouvrement", "Budget vs Réel"],
        documentAccess: ["Documents financiers", "Factures", "Bons de livraison"],
        financialAccess: ["Paiements", "Charges", "Budget", "Rapports", "Recouvrement", "Gestion trésorerie"],
        permissions: ["Paiements", "Charges", "Budget", "Rapports financiers", "Recouvrement", "Gestion trésorerie"],
      };
    case "secretary":
      return {
        ...base,
        modules: ["Réunions", "Documents", "PV", "Publications", "Annonces", "Messagerie"],
        approvalRights: ["Ordres du jour", "Convocations", "Publications"],
        signatureRights: ["Convocations", "PV de réunion", "Correspondances"],
        reportsAccess: ["Activité des réunions", "Documents archivés"],
        documentAccess: ["Création", "Archivage", "Publication", "Gestion complète"],
        financialAccess: [],
        permissions: ["Réunions", "Minutes", "Documents", "Publications", "Archives", "Suivi administratif"],
      };
    case "committee_member":
      return {
        ...base,
        modules: ["Gouvernance", "Réunions", "Documents (lecture)", "Travaux"],
        approvalRights: ["Vote en assemblée"],
        signatureRights: [],
        reportsAccess: ["Rapports d'activité (lecture)"],
        documentAccess: ["Lecture uniquement"],
        financialAccess: ["Budget (lecture)"],
        permissions: ["Participation aux décisions", "Vote", "Présence aux réunions", "Révision documents", "Support gouvernance"],
      };
    default:
      return base;
  }
}

// ─── GET /organigramme ───────────────────────────────────────────────────────
router.get("/organigramme", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    // Super admin sees everything — but uses /organigramme/national for the global view.
    // For a specific syndicate view (when super_admin selects one), fall through normally.
    if (!user.syndicateId && user.role !== "super_admin") {
      return void res.json({ data: null });
    }

    const syndicateId = user.syndicateId;
    if (!syndicateId) {
      return void res.json({ data: null, message: "Sélectionnez un syndicat pour voir l'organigramme." });
    }

    // ── Syndicate info ──────────────────────────────────────────────────────
    const [syndicate] = await db
      .select()
      .from(syndicatesTable)
      .where(eq(syndicatesTable.id, syndicateId));

    // ── Syndicate Admins ────────────────────────────────────────────────────
    const admins = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        avatar: usersTable.avatar,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.syndicateId, syndicateId),
          or(
            eq(usersTable.role, "syndicate_admin"),
            eq(usersTable.role, "super_admin"),
          ),
        ),
      );

    // ── Council members (active) ────────────────────────────────────────────
    const now = new Date();
    const ninetyDaysLater = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const ninetyDaysStr = ninetyDaysLater.toISOString().slice(0, 10);
    const nowStr = now.toISOString().slice(0, 10);

    const council = await db
      .select()
      .from(conseilSyndicalTable)
      .where(
        and(
          eq(conseilSyndicalTable.syndicateId, syndicateId),
          eq(conseilSyndicalTable.status, "active"),
        ),
      )
      .orderBy(desc(conseilSyndicalTable.createdAt));

    // All mandates (including expired) for stats
    const allMandates = await db
      .select()
      .from(conseilSyndicalTable)
      .where(eq(conseilSyndicalTable.syndicateId, syndicateId))
      .orderBy(desc(conseilSyndicalTable.createdAt));

    // ── Build hierarchy nodes ───────────────────────────────────────────────
    const ROLE_ORDER = ["president", "treasurer", "secretary", "committee_member"];

    const adminNodes = admins.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email ?? "",
      phone: a.phone ?? "",
      avatar: a.avatar ?? null,
      role: a.role,
      roleLabel: roleLabel(a.role),
      color: roleColor(a.role),
      level: 2,
      mandateStart: a.createdAt ? String(a.createdAt).slice(0, 10) : "",
      mandateEnd: "",
      status: "active",
      permissions: rolePermissions(a.role),
    }));

    const councilNodes = council.map((c) => {
      const endDate = c.mandateEnd ?? "";
      const isExpiring = endDate && endDate >= nowStr && endDate <= ninetyDaysStr;
      const isExpired = endDate && endDate < nowStr;
      return {
        id: c.id,
        name: c.name ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        avatar: null as null | string,
        role: c.role,
        roleLabel: roleLabel(c.role),
        color: roleColor(c.role),
        level: ROLE_ORDER.indexOf(c.role ?? "") + 3,
        mandateStart: c.mandateStart ?? "",
        mandateEnd: c.mandateEnd ?? "",
        status: isExpired ? "expired" : isExpiring ? "expiring" : "active",
        appointedAt: c.createdAt ? String(c.createdAt).slice(0, 10) : "",
        permissions: rolePermissions(c.role),
      };
    });

    // ── Stats ───────────────────────────────────────────────────────────────
    const presentRoles = new Set(council.map((c) => c.role));
    const REQUIRED_ROLES = ["president", "treasurer", "secretary"];
    const vacantPositions = REQUIRED_ROLES.filter((r) => !presentRoles.has(r));

    const activeMandates = council.length;
    const expiringMandates = councilNodes.filter((n) => n.status === "expiring").length;
    const expiredMandates = allMandates.filter((m) => {
      const end = m.mandateEnd;
      return m.status === "active" && end && end < nowStr;
    }).length;

    // Governance alerts
    const alerts: string[] = [];
    if (vacantPositions.length > 0) {
      alerts.push(`${vacantPositions.length} poste(s) vacant(s): ${vacantPositions.map(roleLabel).join(", ")}`);
    }
    if (expiringMandates > 0) {
      alerts.push(`${expiringMandates} mandat(s) expirant(s) dans 90 jours`);
    }
    if (expiredMandates > 0) {
      alerts.push(`${expiredMandates} mandat(s) expiré(s) — renouvellement requis`);
    }
    if (admins.length === 0) {
      alerts.push("Aucun administrateur de syndicat assigné");
    }

    // ── Dashboard summary cards ─────────────────────────────────────────────
    const president = councilNodes.find((n) => n.role === "president") ?? null;
    const treasurer = councilNodes.find((n) => n.role === "treasurer") ?? null;
    const secretary = councilNodes.find((n) => n.role === "secretary") ?? null;
    const committeeMembers = councilNodes.filter((n) => n.role === "committee_member");

    res.json({
      data: {
        syndicate: syndicate ? {
          id: syndicate.id,
          name: syndicate.name,
          address: syndicate.address ?? "",
          city: syndicate.city ?? "",
          foundingDate: syndicate.foundingDate ?? "",
          logoColor: syndicate.logoColor ?? "#7c3aed",
        } : null,
        hierarchy: {
          admins: adminNodes,
          president,
          treasurer,
          secretary,
          committeeMembers,
        },
        stats: {
          activeMandates,
          expiringMandates,
          expiredMandates,
          vacantPositions: vacantPositions.length,
          vacantRoles: vacantPositions,
          committeeCount: committeeMembers.length,
          totalMembers: adminNodes.length + councilNodes.length,
          alerts,
        },
        allNodes: [
          ...adminNodes,
          president,
          treasurer,
          secretary,
          ...committeeMembers,
        ].filter(Boolean),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /organigramme/national — Super Admin national view ─────────────────
router.get("/organigramme/national", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "super_admin") {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const syndicates = await db.select().from(syndicatesTable).orderBy(desc(syndicatesTable.createdAt));

    const syndicateIds = syndicates.map((s) => s.id);

    // Batch-load council members and buildings for all syndicates
    const [allCouncil, allBuildings, allMembers] = await Promise.all([
      syndicateIds.length > 0
        ? db.select().from(conseilSyndicalTable).where(
            and(
              inArray(conseilSyndicalTable.syndicateId, syndicateIds),
              eq(conseilSyndicalTable.status, "active"),
            ),
          )
        : Promise.resolve([]),
      syndicateIds.length > 0
        ? db.select({ syndicateId: buildingsTable.syndicateId }).from(buildingsTable).where(
            inArray(buildingsTable.syndicateId, syndicateIds),
          )
        : Promise.resolve([]),
      syndicateIds.length > 0
        ? db.select({ syndicateId: membersTable.syndicateId }).from(membersTable).where(
            inArray(membersTable.syndicateId, syndicateIds),
          )
        : Promise.resolve([]),
    ]);

    const now = new Date().toISOString().slice(0, 10);
    const REQUIRED_ROLES = ["president", "treasurer", "secretary"];

    const syndicateData = syndicates.map((s) => {
      const council = (allCouncil as any[]).filter((c: any) => c.syndicateId === s.id);
      const buildings = allBuildings.filter((b: any) => b.syndicateId === s.id);
      const members = allMembers.filter((m: any) => m.syndicateId === s.id);
      const presentRoles = new Set(council.map((c: any) => c.role));
      const vacantRoles = REQUIRED_ROLES.filter((r) => !presentRoles.has(r));
      const expiredMandates = council.filter((c: any) => c.mandateEnd && c.mandateEnd < now).length;

      let governanceStatus: "healthy" | "warning" | "critical" = "healthy";
      if (vacantRoles.length > 0 || expiredMandates > 0) governanceStatus = "warning";
      if (vacantRoles.length >= 2) governanceStatus = "critical";

      const president = council.find((c: any) => c.role === "president");
      const alerts: string[] = [];
      if (vacantRoles.length > 0) alerts.push(`${vacantRoles.length} poste(s) vacant(s)`);
      if (expiredMandates > 0) alerts.push(`${expiredMandates} mandat(s) expiré(s)`);

      return {
        id: s.id,
        name: s.name,
        city: s.city ?? "",
        region: s.region ?? "",
        status: s.status ?? "active",
        logoColor: s.logoColor ?? "#7c3aed",
        buildingsCount: buildings.length,
        lotsCount: 0, // would need join
        membersCount: members.length,
        councilCount: council.length,
        vacantPositions: vacantRoles.length,
        vacantRoles,
        expiredMandates,
        governanceStatus,
        president: president ? { name: president.name, email: president.email ?? "" } : null,
        alerts,
      };
    });

    const healthy = syndicateData.filter((s) => s.governanceStatus === "healthy").length;
    const warnings = syndicateData.filter((s) => s.governanceStatus === "warning").length;
    const critical = syndicateData.filter((s) => s.governanceStatus === "critical").length;

    res.json({
      data: {
        syndicates: syndicateData,
        summary: {
          total: syndicates.length,
          healthy,
          warnings,
          critical,
          totalVacancies: syndicateData.reduce((a, s) => a + s.vacantPositions, 0),
          totalExpired: syndicateData.reduce((a, s) => a + s.expiredMandates, 0),
        },
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
