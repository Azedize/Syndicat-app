// ─── Role → colour token ────────────────────────────────────────────────────
export function roleColor(role: string | null | undefined): string {
  switch (role) {
    case "syndicate_admin":
      return "#2563EB";
    case "president":
      return "#7C3AED";
    case "treasurer":
      return "#059669";
    case "secretary":
      return "#EA580C";
    case "committee_member":
      return "#6B7280";
    default:
      return "#6B7280";
  }
}

// ─── Role → label ───────────────────────────────────────────────────────────
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "syndicate_admin":
      return "Admin de Syndicat";
    case "president":
      return "Président";
    case "treasurer":
      return "Trésorier";
    case "secretary":
      return "Secrétaire";
    case "committee_member":
      return "Membre du Bureau";
    default:
      return "Membre";
  }
}

// ─── Role permissions matrix ────────────────────────────────────────────────
export function rolePermissions(role: string | null | undefined) {
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
        modules: [
          "Administration",
          "Membres",
          "Finance",
          "Documents",
          "Réunions",
          "Gouvernance",
          "Marketplace",
          "Support",
        ],
        approvalRights: [
          "Toutes les dépenses",
          "Membres",
          "Documents",
          "Fournisseurs",
        ],
        signatureRights: [
          "Tous documents",
          "Contrats",
          "PV d'assemblée",
          "Actes administratifs",
        ],
        reportsAccess: ["Financiers", "Activité", "Statistiques", "Audit"],
        documentAccess: [
          "Création",
          "Modification",
          "Archivage",
          "Publication",
        ],
        financialAccess: [
          "Budget",
          "Charges",
          "Paiements",
          "Comptabilité",
          "Recouvrement",
        ],
        permissions: [
          "Gestion plateforme",
          "Gestion utilisateurs",
          "Configuration résidence",
          "Paramètres globaux",
          "Permissions",
        ],
      };
    case "president":
      return {
        ...base,
        modules: [
          "Gouvernance",
          "Assemblées",
          "Documents",
          "Réunions",
          "Travaux",
          "Budget",
        ],
        approvalRights: [
          "Décisions AG",
          "Travaux > 50 000 MAD",
          "Contrats prestataires",
        ],
        signatureRights: [
          "PV d'assemblée",
          "Contrats",
          "Décisions officielles",
          "Actes notariaux",
        ],
        reportsAccess: ["Gouvernance", "Financiers (lecture)", "Activité"],
        documentAccess: ["Lecture", "Signature", "Approbation"],
        financialAccess: ["Budget (lecture)", "Rapport financier (lecture)"],
        permissions: [
          "Gouvernance",
          "Prises de décision",
          "Approbations",
          "Signatures",
          "Direction stratégique",
        ],
      };
    case "treasurer":
      return {
        ...base,
        modules: [
          "Finance",
          "Charges",
          "Budget",
          "Rapports financiers",
          "Recouvrement",
        ],
        approvalRights: [
          "Dépenses opérationnelles",
          "Appels de fonds",
          "Remboursements",
        ],
        signatureRights: [
          "Chèques",
          "Virements",
          "Rapports financiers",
          "Reçus de paiement",
        ],
        reportsAccess: [
          "Financiers complets",
          "Trésorerie",
          "Recouvrement",
          "Budget vs Réel",
        ],
        documentAccess: [
          "Documents financiers",
          "Factures",
          "Bons de livraison",
        ],
        financialAccess: [
          "Paiements",
          "Charges",
          "Budget",
          "Rapports",
          "Recouvrement",
          "Gestion trésorerie",
        ],
        permissions: [
          "Paiements",
          "Charges",
          "Budget",
          "Rapports financiers",
          "Recouvrement",
          "Gestion trésorerie",
        ],
      };
    case "secretary":
      return {
        ...base,
        modules: [
          "Réunions",
          "Documents",
          "PV",
          "Publications",
          "Annonces",
          "Messagerie",
        ],
        approvalRights: ["Ordres du jour", "Convocations", "Publications"],
        signatureRights: ["Convocations", "PV de réunion", "Correspondances"],
        reportsAccess: ["Activité des réunions", "Documents archivés"],
        documentAccess: [
          "Création",
          "Archivage",
          "Publication",
          "Gestion complète",
        ],
        financialAccess: [],
        permissions: [
          "Réunions",
          "Minutes",
          "Documents",
          "Publications",
          "Archives",
          "Suivi administratif",
        ],
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
        permissions: [
          "Participation aux décisions",
          "Vote",
          "Présence aux réunions",
          "Révision documents",
          "Support gouvernance",
        ],
      };
    default:
      return base;
  }
}
