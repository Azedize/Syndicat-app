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

type AllRoles = "super_admin" | "syndicate_admin" | "member" | "tenant";

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

const MENU_SECTIONS_DEF: SectionDef[] = [
  {
    titleKey: "menuSectionBuilding",
    items: [
      { labelKey: "buildingsResidences", icon: "home",       route: "/buildings",   color: "#7c3aed", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "lotsUnits",           icon: "grid",       route: "/lots",        color: "#3b82f6", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "owners",              icon: "users",      route: "/members",     color: "#10b981", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "locataires",          icon: "user-check", route: "/locataires",  color: "#06b6d4", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "myApartment",         icon: "home",       route: "/mon-lot",     color: "#7c3aed", roles: ["member"] },
    ],
  },
  {
    titleKey: "menuSectionMyHome",
    items: [
      { labelKey: "myApartment",  icon: "home",      route: "/mon-lot",      color: "#7c3aed", roles: ["tenant"] },
      { labelKey: "monBail",      icon: "file-text", route: "/mon-bail",     color: "#3b82f6", roles: ["tenant"] },
      { labelKey: "etatDesLieux", icon: "clipboard", route: "/etat-des-lieux", color: "#10b981", roles: ["tenant"] },
    ],
  },
  {
    titleKey: "menuSectionFinance",
    items: [
      { labelKey: "chargesAppels",      icon: "credit-card",  route: "/charges",              color: "#10b981", roles: ["super_admin", "syndicate_admin", "member"] },
      { labelKey: "budgetPrevisionnel", icon: "pie-chart",    route: "/budget-previsionnel",  color: "#3b82f6", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "devisFactures",      icon: "file-text",    route: "/invoices",             color: "#6366f1", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "bonLivraison",       icon: "package",      route: "/bon-livraison",        color: "#f97316", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "rapportsFinanciers", icon: "bar-chart-2",  route: "/reports",              color: "#7c3aed", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "escalationLabel",    icon: "trending-up",  route: "/escalation",           color: "#ef4444", roles: ["super_admin", "syndicate_admin"] },
    ],
  },
  {
    titleKey: "menuSectionMaintenance",
    items: [
      { labelKey: "travaux",          icon: "tool",           route: "/travaux",           color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "prestataires",     icon: "briefcase",      route: "/prestataires",      color: "#3b82f6", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "sinistres",        icon: "alert-triangle", route: "/sinistres",         color: "#ef4444", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "travauxPrivatifs", icon: "edit-2",         route: "/travaux-privatifs", color: "#f97316", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "parkingVehicules", icon: "map-pin",        route: "/parking",           color: "#7c3aed", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
  {
    titleKey: "menuSectionAG",
    items: [
      { labelKey: "assembleesGenerales",  icon: "users",       route: "/assemblee-generale", color: "#7c3aed", roles: ["super_admin", "syndicate_admin", "member"] },
      { labelKey: "reunionsConvocations", icon: "calendar",    route: "/meetings",            color: "#3b82f6", roles: ["super_admin", "syndicate_admin", "member"] },
      { labelKey: "votesResolutions",     icon: "check-square",route: "/elections",           color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member"] },
      { labelKey: "pvLabel",              icon: "file-text",   route: "/pv",                  color: "#6366f1", roles: ["super_admin", "syndicate_admin", "member"] },
    ],
  },
  {
    titleKey: "menuSectionLegal",
    items: [
      { labelKey: "documentsCopro",         icon: "folder",    route: "/documents",            color: "#6366f1", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "reglementsLabel",         icon: "book",      route: "/reglements",           color: "#3b82f6", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "actesAdministratifs",     icon: "file-text", route: "/actes-administratifs", color: "#7c3aed", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "alertesReglementaires",   icon: "shield",    route: "/legal",                color: "#8b5cf6", roles: ["super_admin", "syndicate_admin"] },
      { labelKey: "demandesModeles",         icon: "inbox",     route: "/template-request",     color: "#a78bfa", roles: ["syndicate_admin"] },
    ],
  },
  {
    titleKey: "menuSectionCommunication",
    items: [
      { labelKey: "avisResidents",          icon: "bell",           route: "/annonces",          color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "publicationsActualites", icon: "rss",            route: "/publications",      color: "#f97316", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "chatMessagerie",         icon: "message-circle", route: "/chat",              color: "#ec4899", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "messagerieInterne",      icon: "mail",           route: "/messagerie-interne",color: "#3b82f6", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "alerts",                 icon: "bell",           route: "/notifications",     color: "#ef4444", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
  {
    titleKey: "menuSectionSupport",
    items: [
      { labelKey: "demandesIntervention", icon: "headphones", route: "/support",      color: "#ef4444", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "reclamationsLabel",    icon: "inbox",      route: "/reclamations", color: "#f97316", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
  {
    titleKey: "menuSectionMarketplace",
    items: [
      { labelKey: "monPanier",    icon: "shopping-cart", route: "/cart",     color: "#f59e0b", roles: ["member", "syndicate_admin"] },
      { labelKey: "mesCommandes", icon: "package",       route: "/orders",   color: "#6366f1", roles: ["member", "syndicate_admin"] },
      { labelKey: "maBoutique",   icon: "shopping-bag",  route: "/my-shop",  color: "#10b981", roles: ["member", "syndicate_admin"] },
    ],
  },
  {
    titleKey: "menuSectionAdmin",
    items: [
      { labelKey: "gestionUtilisateurs",  icon: "users",       route: "/utilisateurs",   color: "#7c3aed", roles: ["super_admin"] },
      { labelKey: "tableauNational",      icon: "globe",        route: "/tableau-national",color: "#6366f1", roles: ["super_admin"] },
      { labelKey: "creerSyndicat",        icon: "plus-circle",  route: "/syndicate-setup", color: "#10b981", roles: ["super_admin"] },
      { labelKey: "journalAudit",         icon: "shield",       route: "/journal-audit",   color: "#ef4444", roles: ["super_admin"] },
      { labelKey: "statistiquesGlobales", icon: "trending-up",  route: "/statistiques",    color: "#10b981", roles: ["super_admin", "syndicate_admin"] },
    ],
  },
  {
    titleKey: "menuSectionSubscriptions",
    items: [
      { labelKey: "plansAbonnements", icon: "star", route: "/abonnements", color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member"] },
    ],
  },
  {
    titleKey: "menuSectionAccount",
    items: [
      { labelKey: "monProfil",     icon: "user",     route: "/profile",       color: "#6366f1", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "notifications", icon: "bell",     route: "/notifications", color: "#ec4899", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "settings",      icon: "settings", route: "/settings",      color: "#6b7280", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { labelKey: "cguLabel",      icon: "file-text",route: "/cgu",           color: "#6b7280", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
];

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { alerts, elections, supportTickets, members, cart } = useData();
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
    role === "super_admin" ? t("superAdministrateur") :
    role === "syndicate_admin" ? t("gestionnairesSyndic") :
    role === "tenant" ? t("roleTenant") : t("copropriétaire");

  const roleIcon: keyof typeof Feather.glyphMap =
    role === "super_admin" ? "shield" :
    role === "syndicate_admin" ? "briefcase" :
    role === "tenant" ? "key" : "home";

  // Stats strip items
  const statsItems = role === "tenant"
    ? [
        { icon: "bell" as const, label: t("alerts"), value: unreadAlerts, color: "#ef4444", show: true },
        { icon: "tool" as const, label: t("travaux"), value: openTickets, color: "#8b5cf6", show: true },
        { icon: "message-circle" as const, label: t("chat"), value: 0, color: "#ec4899", show: true },
      ]
    : [
        { icon: "bell" as const, label: t("alerts"), value: unreadAlerts, color: "#ef4444", show: true },
        { icon: "check-square" as const, label: t("votes"), value: openElections, color: "#f59e0b", show: true },
        { icon: "tool" as const, label: t("travaux"), value: openTickets, color: "#8b5cf6", show: role !== "member" },
        { icon: "users" as const, label: t("owners"), value: activeOwners, color: colors.primary, show: role !== "member" },
        { icon: "shopping-cart" as const, label: t("panierLabel"), value: cartCount, color: "#f97316", show: role === "member" },
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
            <Text style={[styles.infoValue, { color: colors.foreground }]}>SYNDYCAT — Syndicat de Copropriété</Text>
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
