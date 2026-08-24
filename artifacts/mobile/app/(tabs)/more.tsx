import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type AllRoles =
  | "super_admin"
  | "syndicate_admin"
  | "president"
  | "treasurer"
  | "secretary"
  | "committee_member"
  | "member"
  | "tenant";

interface MenuItemDef {
  labelKey: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  badge?: string | number;
  color: string;
  roles: AllRoles[];
}

interface SectionDef {
  titleKey: string;
  items: MenuItemDef[];
}

// Shorthand role groups used throughout the menu definitions
const ALL_TEAM: AllRoles[] = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member"];
const ALL_USERS: AllRoles[] = ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"];
const RESIDENTS: AllRoles[] = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"];

const MENU_SECTIONS_DEF: SectionDef[] = [
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
      { labelKey: "buildingsResidences", icon: "home",       route: "/buildings",   color: "#2563EB", roles: ["syndicate_admin"] },
      { labelKey: "lotsUnits",           icon: "grid",       route: "/lots",        color: "#3b82f6", roles: ["syndicate_admin"] },
      { labelKey: "owners",              icon: "users",      route: "/members",     color: "#10b981", roles: ["syndicate_admin"] },
      { labelKey: "locataires",          icon: "user-check", route: "/locataires",  color: "#06b6d4", roles: ["syndicate_admin"] },
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
      { labelKey: "chargesAppels",      icon: "credit-card", route: "/charges",                color: "#10b981", roles: ["syndicate_admin", "treasurer", "member"] },
      // Governance roles are also co-owners — they must see their personal cotisations and payment history.
      { labelKey: "cotisations",        icon: "layers",      route: "/cotisations",            color: "#06b6d4", roles: ["member", "president", "treasurer", "secretary", "committee_member"] },
      { labelKey: "paymentHistory",     icon: "dollar-sign", route: "/paiements",              color: "#10b981", roles: ["member", "tenant", "president", "treasurer", "secretary", "committee_member"] },
      // FIX [M9]: president chairs AG where budget is voted — must have read-only access
      { labelKey: "budgetPrevisionnel", icon: "pie-chart",   route: "/budget-previsionnel",    color: "#8b5cf6", roles: ["syndicate_admin", "treasurer", "president"] },
      { labelKey: "devisFactures",      icon: "file-text",   route: "/invoices",               color: "#1F5EFF", roles: ["syndicate_admin", "treasurer"] },
      { labelKey: "bonLivraison",       icon: "package",     route: "/bon-livraison",          color: "#f97316", roles: ["syndicate_admin", "treasurer"] },
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
      { labelKey: "travauxPrivatifs", icon: "edit-2",         route: "/travaux-privatifs", color: "#f97316", roles: ["syndicate_admin"] },
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
      { labelKey: "pvLabel",              icon: "file-text",    route: "/pv",                  color: "#1F5EFF", roles: ["syndicate_admin", "president", "secretary"] },
      { labelKey: "governance",           icon: "award",        route: "/governance",          color: "#8b5cf6", roles: ["syndicate_admin", "president", "secretary", "committee_member"] },
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
      { labelKey: "documentsCopro",       icon: "folder",    route: "/documents",            color: "#1F5EFF", roles: ["syndicate_admin", "president", "secretary", "member", "tenant"] },
      { labelKey: "reglementsLabel",       icon: "book",      route: "/reglements",           color: "#3b82f6", roles: ["syndicate_admin", "secretary"] },
      { labelKey: "actesAdministratifs",   icon: "file-text", route: "/actes-administratifs", color: "#2563EB", roles: ["syndicate_admin", "secretary", "president"] },
      { labelKey: "alertesReglementaires", icon: "shield",    route: "/legal",                color: "#8b5cf6", roles: ["syndicate_admin", "president", "secretary"] },
      { labelKey: "transparency",          icon: "eye",       route: "/transparency",         color: "#10b981", roles: ["syndicate_admin", "president"] },
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
      { labelKey: "publicationsActualites", icon: "rss",            route: "/publications",       color: "#f97316", roles: ["syndicate_admin", "secretary", "president", "member", "tenant"] },
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
      { labelKey: "reclamationsLabel",    icon: "inbox",        route: "/reclamations",     color: "#f97316", roles: ["syndicate_admin", "president", "member"] },
    ],
  },

  // ─── MARKETPLACE — Syndicate Admin only ──────────────────────────────────────
  {
    titleKey: "menuSectionMarketplace",
    items: [
      // Members and tenants are buyers in the marketplace — they need cart and orders access.
      { labelKey: "monPanier",    icon: "shopping-cart", route: "/cart",    color: "#f59e0b", roles: ["syndicate_admin", "member", "tenant"] },
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

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { alerts, elections, supportTickets, members, cart, conversations } = useData();
  const { isWide } = useBreakpoints();
  const { t } = useLanguage();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const role = user?.role ?? "member";
  const unreadAlerts = alerts.filter((a) => !a.read).length;
  const openElections = elections.filter((e) => e.status === "open").length;
  const openTickets = supportTickets.filter((t) => t.status === "open").length;
  const activeOwners = members.filter((m) => m.status === "active").length;
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const handleNav = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  // Build translated sections from definitions
  const visibleSections = MENU_SECTIONS_DEF.map((section) => ({
    title: t(section.titleKey),
    titleKey: section.titleKey,
    items: section.items
      .filter((item) => item.roles.includes(role as any))
      .map((item) => ({ ...item, label: t(item.labelKey) })),
  })).filter((s) => s.items.length > 0);

  const getBadge = (route: string): string | number | undefined => {
    if (route === "/notifications" && unreadAlerts > 0) return unreadAlerts;
    if (route === "/cart" && cartCount > 0) return cartCount;
    if (route === "/charges" && openTickets > 0 && role !== "member") return openTickets;
    return undefined;
  };

  const roleLabel =
    role === "super_admin"      ? t("superAdministrateur") :
    role === "syndicate_admin"  ? t("gestionnairesSyndic") :
    role === "president"        ? t("rolePresident") :
    role === "treasurer"        ? t("roleTresorier") :
    role === "secretary"        ? t("roleSecrétaire") :
    role === "committee_member" ? t("roleMembreConseil") :
    role === "tenant"           ? t("roleTenant") :
                                  t("copropriétaire");

  const roleIcon: keyof typeof Feather.glyphMap =
    role === "super_admin"      ? "shield" :
    role === "syndicate_admin"  ? "briefcase" :
    role === "president"        ? "award" :
    role === "treasurer"        ? "bar-chart-2" :
    role === "secretary"        ? "file-text" :
    role === "committee_member" ? "users" :
    role === "tenant"           ? "key" : "home";

  const isSyndicateTeam = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member"].includes(role);

  // Stats strip items — scoped by role
  const statsItems = role === "tenant"
    ? [
        { icon: "bell" as const, label: t("alerts"), value: unreadAlerts, color: "#ef4444", show: true },
        { icon: "tool" as const, label: t("travaux"), value: openTickets, color: "#8b5cf6", show: true },
        { icon: "message-circle" as const, label: t("chat"), value: 0, color: "#ec4899", show: true },
      ]
    : role === "member"
    ? [
        { icon: "bell" as const, label: t("alerts"), value: unreadAlerts, color: "#ef4444", show: true },
        { icon: "check-square" as const, label: t("votes"), value: openElections, color: "#f59e0b", show: true },
        { icon: "shopping-cart" as const, label: t("panierLabel"), value: cartCount, color: "#f97316", show: true },
      ]
    : isSyndicateTeam
    ? [
        { icon: "bell" as const, label: t("alerts"), value: unreadAlerts, color: "#ef4444", show: true },
        { icon: "check-square" as const, label: t("votes"), value: openElections, color: "#f59e0b", show: true },
        { icon: "tool" as const, label: t("travaux"), value: openTickets, color: "#8b5cf6", show: role === "syndicate_admin" || role === "president" },
        { icon: "users" as const, label: t("owners"), value: activeOwners, color: colors.primary, show: role === "syndicate_admin" || role === "president" },
      ]
    : /* super_admin */
      [
        { icon: "bell" as const, label: t("alerts"), value: unreadAlerts, color: "#ef4444", show: true },
        { icon: "check-square" as const, label: t("votes"), value: openElections, color: "#f59e0b", show: true },
        { icon: "tool" as const, label: t("travaux"), value: openTickets, color: "#8b5cf6", show: true },
        { icon: "users" as const, label: t("owners"), value: activeOwners, color: colors.primary, show: true },
      ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t("menuLabel")}</Text>
        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: colors.secondary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/search" as any); }}
          activeOpacity={0.7}
        >
          <Feather name="search" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: isWide ? 24 : 16, gap: 20, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* User card */}
        <TouchableOpacity
          style={[styles.userCard, { backgroundColor: colors.primary }]}
          onPress={() => handleNav("/profile")}
          activeOpacity={0.85}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {user?.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
            <View style={styles.userRoleBadge}>
              <Feather name={roleIcon} size={10} color="rgba(255,255,255,0.9)" />
              <Text style={styles.userRoleText}>{roleLabel}</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Live stats strip */}
        <View style={[styles.statsStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {statsItems.filter((s) => s.show).map((s, i, arr) => (
            <View key={s.label} style={[styles.statCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
              <View style={[styles.statIcon, { backgroundColor: s.color + "18" }]}>
                <Feather name={s.icon} size={14} color={s.color} />
              </View>
              <Text style={[styles.statVal, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Sections */}
        <View style={isWide ? styles.sectionsGrid : undefined}>
          {visibleSections.map((section) => (
            <View key={section.titleKey} style={[styles.section, isWide && styles.sectionDesktop]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {section.title.toUpperCase()}
              </Text>
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {section.items.map((item, i) => {
                  const badge = getBadge(item.route);
                  return (
                    <View key={item.labelKey}>
                      {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                      <TouchableOpacity
                        style={styles.menuRow}
                        onPress={() => handleNav(item.route)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.menuIcon, { backgroundColor: item.color + "18" }]}>
                          <Feather name={item.icon} size={18} color={item.color} />
                        </View>
                        <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
                        <View style={styles.menuRight}>
                          {badge != null ? (
                            <View style={[styles.menuBadge, { backgroundColor: item.color }]}>
                              <Text style={styles.menuBadgeText}>{badge}</Text>
                            </View>
                          ) : null}
                          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* App info */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Application</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>MIZAN</Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Version</Text>
            <View style={[styles.modeBadge, { backgroundColor: colors.secondary }]}>
              <Feather name="zap" size={11} color={colors.primary} />
              <Text style={[styles.modeText, { color: colors.primary }]}>3.0 Copropriété</Text>
            </View>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Conformité</Text>
            <Text style={[styles.infoValue, { color: "#10b981" }]}>Loi 18-00 — Maroc ✓</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.destructive + "40" }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Feather name="log-out" size={16} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>{t("logoutLabel")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  searchBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  userCard: { borderRadius: 20, padding: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  userAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  userAvatarText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  userName: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  userRoleBadge: { marginTop: 5, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 5 },
  userRoleText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.9)" },
  statsStrip: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  statIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  sectionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  section: { gap: 8 },
  sectionDesktop: { flex: 1, minWidth: 280 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, paddingHorizontal: 4 },
  sectionCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  menuIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  menuRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  menuBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  menuBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingHorizontal: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  infoDivider: { height: StyleSheet.hairlineWidth },
  modeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  modeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
