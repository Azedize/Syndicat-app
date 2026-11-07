import type { Feather } from "@expo/vector-icons";

/**
 * The app's menu (« Plus » tab), by section and role. Shared by the menu and
 * the search, so a screen offered in one is offered — or hidden — in both.
 */
export type AllRoles =
  | "super_admin"
  | "syndicate_admin"
  | "president"
  | "treasurer"
  | "secretary"
  | "committee_member"
  | "member"
  | "tenant";

export interface MenuItemDef {
  labelKey: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  badge?: string | number;
  color: string;
  roles: AllRoles[];
}

export interface SectionDef {
  titleKey: string;
  items: MenuItemDef[];
}

// Shorthand role groups used throughout the menu definitions
const ALL_TEAM: AllRoles[] = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member"];
const ALL_USERS: AllRoles[] = ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"];
const RESIDENTS: AllRoles[] = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"];

export const MENU_SECTIONS_DEF: SectionDef[] = [
  // ─── SUPER ADMIN: Platform Administration ────────────────────────────────────
  // Super Admin is the SaaS PLATFORM OWNER. He never manages buildings, lots,
  // residents, finance, maintenance, or governance of a single syndicate.
  // His experience is entirely scoped to the platform.
  {
    titleKey: "menuSectionAdmin",
    items: [
      { labelKey: "tableauNational",      icon: "globe",          route: "/tableau-national",    color: "#1F5EFF", roles: ["super_admin"] },
      { labelKey: "gestionUtilisateurs",  icon: "users",          route: "/utilisateurs",        color: "#2563EB", roles: ["super_admin"] },
      { labelKey: "creerSyndicat",        icon: "plus-circle",    route: "/syndicate-setup",     color: "#10b981", roles: ["super_admin"] },
      { labelKey: "journalAudit",         icon: "shield",         route: "/journal-audit",       color: "#ef4444", roles: ["super_admin"] },
      { labelKey: "statistiquesGlobales", icon: "trending-up",    route: "/statistiques",        color: "#0ea5e9", roles: ["super_admin"] },
      { labelKey: "marketplaceModeration",icon: "shopping-bag",   route: "/admin/marketplace",   color: "#f59e0b", roles: ["super_admin"] },
      { labelKey: "modelesPlateforme",    icon: "layout",         route: "/template-studio",     color: "#8b5cf6", roles: ["super_admin"] },
      { labelKey: "editeurModeles",       icon: "edit",           route: "/template-editor",     color: "#a78bfa", roles: ["super_admin"] },
    ],
  },

  // ─── BUILDING MANAGEMENT — Syndicate Admin only ───────────────────────────────
  // Only the full administrator configures buildings, lots, owners and tenants.
  // President/Treasurer/Secretary/CommitteeMember do not touch residence structure.
  {
    titleKey: "menuSectionBuilding",
    items: [
      { labelKey: "mesCoproprietes",     icon: "repeat",     route: "/coproprietes", color: "#7C3AED", roles: RESIDENTS },
      { labelKey: "portefeuilleSociete", icon: "pie-chart",  route: "/portefeuille", color: "#0f766e", roles: ALL_TEAM },
      { labelKey: "buildingsResidences", icon: "home",       route: "/buildings",   color: "#2563EB", roles: ["syndicate_admin"] },
      { labelKey: "lotsUnits",           icon: "grid",       route: "/lots",        color: "#3b82f6", roles: ["syndicate_admin", "secretary", "president", "treasurer", "committee_member"] },
      { labelKey: "owners",              icon: "users",      route: "/members",     color: "#10b981", roles: ["syndicate_admin"] },
      { labelKey: "locataires",          icon: "user-check", route: "/locataires",  color: "#06b6d4", roles: ["syndicate_admin"] },
      { labelKey: "modTitle",            icon: "check-square", route: "/moderation-annonces", color: "#f59e0b", roles: ["syndicate_admin"] },
    ],
  },

  // ─── MY HOME — Tenant only ────────────────────────────────────────────────────
  {
    titleKey: "menuSectionMyHome",
    items: [
      // Mon Lot: co-owners + governance roles (president/treasurer/secretary/committee_member are co-owners too)
      { labelKey: "myApartment",  icon: "home",      route: "/mon-lot",        color: "#2563EB", roles: ["member", "president", "treasurer", "secretary", "committee_member"] },
      { labelKey: "monBail",      icon: "file-text", route: "/mon-bail",       color: "#3b82f6", roles: ["tenant"] },
      { labelKey: "etatDesLieux", icon: "clipboard", route: "/etat-des-lieux", color: "#10b981", roles: ["tenant"] },
    ],
  },

  // ─── FINANCE ─────────────────────────────────────────────────────────────────
  // Treasurer: full financial management access.
  // Syndicate Admin: full access.
  // Member: sees their own charges and payment history.
  // Tenant: sees payment history only.
  // President/Secretary/CommitteeMember: no financial access (spec: secretary
  // must not access accounting; committee member is read-only on governance).
  {
    titleKey: "menuSectionFinance",
    items: [
      { labelKey: "tableauBord",        icon: "bar-chart-2", route: "/tableau-bord-financier", color: "#3b82f6", roles: ["syndicate_admin", "treasurer"] },
      { labelKey: "treasuryMenu",       icon: "briefcase",   route: "/tresorerie",             color: "#0f766e", roles: ["syndicate_admin", "treasurer", "president", "committee_member"] },
      { labelKey: "chargesAppels",      icon: "credit-card", route: "/charges",                color: "#10b981", roles: ["syndicate_admin", "treasurer", "member"] },
      // Governance roles are also co-owners — they must see their personal cotisations and payment history.
      { labelKey: "paymentHistory",     icon: "dollar-sign", route: "/paiements",              color: "#10b981", roles: ["member", "syndicate_admin", "president", "treasurer", "committee_member"] },
      { labelKey: "finResTitle", icon: "pie-chart", route: "/finances-residence", color: "#5A4AD6", roles: ["member", "syndicate_admin", "president", "treasurer", "secretary", "committee_member"] },
      // FIX [M9]: president chairs AG where budget is voted — must have read-only access
      { labelKey: "repartitionCharges", icon: "sliders",     route: "/repartition",            color: "#0f766e", roles: ["syndicate_admin", "treasurer", "president", "secretary", "committee_member"] },
      { labelKey: "budgetPrevisionnel", icon: "pie-chart",   route: "/budget-previsionnel",    color: "#8b5cf6", roles: ["syndicate_admin", "treasurer", "president"] },
      { labelKey: "devisFactures",      icon: "file-text",   route: "/invoices",               color: "#1F5EFF", roles: ["syndicate_admin", "treasurer"] },
      { labelKey: "bonLivraison",       icon: "package",     route: "/bon-livraison",          color: "#f59e0b", roles: ["syndicate_admin", "treasurer"] },
      { labelKey: "rapportsFinanciers", icon: "bar-chart-2", route: "/reports",                color: "#2563EB", roles: ["syndicate_admin", "treasurer"] },
      // Payroll: restricted — spec says member must not see payroll
      { labelKey: "fichesPaie",         icon: "file-text",   route: "/fiches-paie",            color: "#1F5EFF", roles: ["syndicate_admin", "treasurer"] },
      { labelKey: "escalationLabel",    icon: "trending-up", route: "/escalation",             color: "#ef4444", roles: ["syndicate_admin", "treasurer"] },
    ],
  },

  // ─── MAINTENANCE ─────────────────────────────────────────────────────────────
  // Syndicate Admin: full access.
  // President: can view works and vendors in oversight capacity.
  // Members/Tenants submit support requests via Support section.
  {
    titleKey: "menuSectionMaintenance",
    items: [
      // FIX [M11]: committee_member has oversight role — they vote on works budgets and need visibility
      { labelKey: "travaux",          icon: "tool",           route: "/travaux",           color: "#f59e0b", roles: ["syndicate_admin", "president", "committee_member"] },
      { labelKey: "prestataires",     icon: "briefcase",      route: "/prestataires",      color: "#3b82f6", roles: ["syndicate_admin", "president", "committee_member"] },
      { labelKey: "sinistres",        icon: "alert-triangle", route: "/sinistres",         color: "#ef4444", roles: ["syndicate_admin", "president", "committee_member"] },
      { labelKey: "travauxPrivatifs", icon: "edit-2",         route: "/travaux-privatifs", color: "#f59e0b", roles: ["syndicate_admin"] },
      { labelKey: "parkingVehicules", icon: "map-pin",        route: "/parking",           color: "#2563EB", roles: ["syndicate_admin"] },
    ],
  },

  // ─── ASSEMBLÉE GÉNÉRALE / GOUVERNANCE ────────────────────────────────────────
  // President: full governance scope (leads assemblies, chairs decisions).
  // Secretary: creates/manages meetings and minutes.
  // Committee Member: participates in meetings and votes (read-only management).
  // Syndicate Admin: full management access.
  // Member: attends meetings and casts votes (participates, doesn't manage).
  {
    titleKey: "menuSectionAG",
    items: [
      { labelKey: "assembleesGenerales",  icon: "users",        route: "/assemblee-generale", color: "#2563EB", roles: ["syndicate_admin", "president", "secretary"] },
      { labelKey: "reunionsConvocations", icon: "calendar",     route: "/meetings",            color: "#3b82f6", roles: ["syndicate_admin", "president", "secretary", "committee_member", "member"] },
      { labelKey: "votesResolutions",     icon: "check-square", route: "/elections",           color: "#f59e0b", roles: ["syndicate_admin", "president", "secretary", "committee_member", "member"] },
      { labelKey: "agendaMenu",           icon: "calendar",     route: "/agenda",              color: "#13976C", roles: ["syndicate_admin", "president", "secretary", "committee_member", "treasurer", "member"] },
      { labelKey: "pvLabel",              icon: "file-text",    route: "/pv",                  color: "#1F5EFF", roles: ["syndicate_admin", "president", "secretary"] },
      { labelKey: "governance",           icon: "award",        route: "/governance",          color: "#8b5cf6", roles: ["syndicate_admin", "president", "secretary", "committee_member"] },
      { labelKey: "orgStructureTitle",    icon: "git-branch",   route: "/organization",        color: "#0EA5E9", roles: ["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"] },
      { labelKey: "organigramme",         icon: "git-merge",    route: "/organigramme",        color: "#7C3AED", roles: ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member"] },
    ],
  },

  // ─── DOCUMENTS ───────────────────────────────────────────────────────────────
  // Secretary: full document management (creates, archives, publishes).
  // President: can access and sign documents.
  // Syndicate Admin: full access.
  // Member: reads co-ownership documents and requests certificates.
  // Tenant: reads published documents (certificates, notices).
  {
    titleKey: "menuSectionLegal",
    items: [
      { labelKey: "bibliothequeDocs",     icon: "book",      route: "/bibliotheque",         color: "#0f766e", roles: RESIDENTS },
      { labelKey: "documentsCopro",       icon: "folder",    route: "/documents",            color: "#1F5EFF", roles: ["syndicate_admin", "president", "secretary", "member", "tenant"] },
      { labelKey: "docDashboardMenu",     icon: "pie-chart", route: "/documents-dashboard",  color: "#0f766e", roles: ["syndicate_admin"] },
      { labelKey: "reglementsLabel",       icon: "book",      route: "/reglements",           color: "#3b82f6", roles: ["syndicate_admin", "secretary"] },
      { labelKey: "actesAdministratifs",   icon: "file-text", route: "/actes-administratifs", color: "#2563EB", roles: ["syndicate_admin", "secretary", "president"] },
      { labelKey: "alertesReglementaires", icon: "shield",    route: "/legal",                color: "#8b5cf6", roles: ["syndicate_admin", "president", "secretary"] },
      { labelKey: "transparency",          icon: "eye",       route: "/transparency",         color: "#10b981", roles: ["syndicate_admin", "president", "treasurer", "committee_member", "member"] },
      { labelKey: "demandesModeles",       icon: "inbox",     route: "/template-request",     color: "#a78bfa", roles: ["syndicate_admin", "secretary"] },
    ],
  },

  // ─── COMMUNICATION ───────────────────────────────────────────────────────────
  // Secretary: publishes announcements, manages publications, internal messaging.
  // President: may access announcements and internal chat.
  // All residents: see announcements.
  // Syndicate Admin: full access.
  {
    titleKey: "menuSectionCommunication",
    items: [
      { labelKey: "avisResidents",          icon: "bell",           route: "/annonces",           color: "#f59e0b", roles: RESIDENTS },
      // FIX [M6]: members/tenants should read syndicate news (cannot create)
      { labelKey: "publicationsActualites", icon: "rss",            route: "/publications",       color: "#f59e0b", roles: ["syndicate_admin", "secretary", "president", "member", "tenant"] },
      // FIX [M7]: members/tenants need to communicate with management
      { labelKey: "chatMessagerie",         icon: "message-circle", route: "/chat",               color: "#ec4899", roles: ["syndicate_admin", "president", "secretary", "member", "tenant"] },
      { labelKey: "messagerieInterne",      icon: "mail",           route: "/messagerie-interne", color: "#3b82f6", roles: ["syndicate_admin", "secretary"] },
      // FIX [M8]: members and committee_member can suggest ideas
      { labelKey: "ideas",                  icon: "zap",            route: "/ideas",              color: "#f59e0b", roles: ["syndicate_admin", "president", "member", "committee_member"] },
    ],
  },

  // ─── SUPPORT ─────────────────────────────────────────────────────────────────
  // Level 1 — Syndicate support: residents/members → syndicate team.
  // Level 2 — Platform support: syndicate team → super_admin.
  // Committee members / president can file support tickets.
  {
    titleKey: "menuSectionSupport",
    items: [
      { labelKey: "demandesIntervention", icon: "headphones",   route: "/support",          color: "#ef4444", roles: [...ALL_TEAM, "member", "tenant"] },
      { labelKey: "supportPlateforme",    icon: "life-buoy",    route: "/platform-support", color: "#1F5EFF", roles: ["super_admin", ...ALL_TEAM] },
      // Réclamations = HR grievance module (salaire/discrimination/harcèlement).
      // Tenants are not employees and must not access it (use /support instead).
      { labelKey: "reclamationsLabel",    icon: "inbox",        route: "/reclamations",     color: "#f59e0b", roles: RESIDENTS },
    ],
  },

  // ─── MARKETPLACE — Syndicate Admin only ──────────────────────────────────────
  {
    titleKey: "menuSectionMarketplace",
    items: [
      // Members and tenants are buyers in the marketplace — they need cart and orders access.
      // No basket: neighbours reserve an item and pay on hand-over (marketplace).
      { labelKey: "mesCommandes", icon: "package",       route: "/orders",  color: "#1F5EFF", roles: ["syndicate_admin", "member", "tenant"] },
      // ma-boutique is seller management — admin only
      { labelKey: "maBoutique",   icon: "shopping-bag",  route: "/my-shop", color: "#10b981", roles: ["syndicate_admin"] },
    ],
  },

  // ─── STATISTICS — Admin + Treasurer ─────────────────────────────────────────
  {
    titleKey: "menuSectionSubscriptions",
    items: [
      { labelKey: "statistiquesGlobales", icon: "bar-chart-2", route: "/statistiques", color: "#10b981", roles: ["syndicate_admin", "treasurer"] },
      { labelKey: "plansAbonnements",     icon: "star",         route: "/abonnements",  color: "#f59e0b", roles: ["super_admin", "syndicate_admin"] },
    ],
  },

  // ─── ACCOUNT — All roles ─────────────────────────────────────────────────────
  {
    titleKey: "menuSectionAccount",
    items: [
      { labelKey: "monProfil",     icon: "user",      route: "/profile",       color: "#1F5EFF", roles: ALL_USERS },
      { labelKey: "notifications", icon: "bell",      route: "/notifications", color: "#ec4899", roles: ALL_USERS },
      // FIX [M3]: ALL users need settings (language, dark mode, biometrics, notifications)
      { labelKey: "settings",      icon: "settings",  route: "/settings",      color: "#6b7280", roles: ALL_USERS },
      { labelKey: "cguLabel",      icon: "file-text", route: "/cgu",           color: "#6b7280", roles: ALL_USERS },
    ],
  },
];
