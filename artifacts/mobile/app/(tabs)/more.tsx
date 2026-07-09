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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type AllRoles = "super_admin" | "syndicate_admin" | "member" | "tenant";

interface MenuItem {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  badge?: string | number;
  color: string;
  roles: AllRoles[];
}

const MENU_SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: "Gestion de l'Immeuble",
    items: [
      { label: "Immeubles & Résidences", icon: "home", route: "/buildings", color: "#7c3aed", roles: ["super_admin", "syndicate_admin"] },
      { label: "Lots & Unités", icon: "grid", route: "/lots", color: "#3b82f6", roles: ["super_admin", "syndicate_admin"] },
      { label: "Copropriétaires", icon: "users", route: "/members", color: "#10b981", roles: ["super_admin", "syndicate_admin"] },
      { label: "Locataires", icon: "user-check", route: "/locataires", color: "#06b6d4", roles: ["super_admin", "syndicate_admin"] },
      { label: "Mon Appartement", icon: "home", route: "/mon-lot", color: "#7c3aed", roles: ["member", "tenant"] },
    ],
  },
  {
    title: "Charges & Finance",
    items: [
      { label: "Charges & Appels de Fonds", icon: "credit-card", route: "/charges", color: "#10b981", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Budget Prévisionnel", icon: "pie-chart", route: "/budget-previsionnel", color: "#3b82f6", roles: ["super_admin", "syndicate_admin"] },
      { label: "Devis & Factures", icon: "file-text", route: "/invoices", color: "#6366f1", roles: ["super_admin", "syndicate_admin"] },
      { label: "Bons de Livraison", icon: "package", route: "/bon-livraison", color: "#f97316", roles: ["super_admin", "syndicate_admin"] },
      { label: "Rapports Financiers", icon: "bar-chart-2", route: "/reports", color: "#7c3aed", roles: ["super_admin", "syndicate_admin"] },
      { label: "Recouvrement & Escalades", icon: "trending-up", route: "/escalation", color: "#ef4444", roles: ["super_admin", "syndicate_admin"] },
    ],
  },
  {
    title: "Maintenance & Travaux",
    items: [
      { label: "Travaux & Interventions", icon: "tool", route: "/travaux", color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Prestataires", icon: "briefcase", route: "/prestataires", color: "#3b82f6", roles: ["super_admin", "syndicate_admin"] },
      { label: "Sinistres & Incidents", icon: "alert-triangle", route: "/sinistres", color: "#ef4444", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Travaux Privatifs", icon: "edit-2", route: "/travaux-privatifs", color: "#f97316", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Parking & Véhicules", icon: "map-pin", route: "/parking", color: "#7c3aed", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
  {
    title: "Assemblée Générale",
    items: [
      { label: "Assemblées Générales", icon: "users", route: "/assemblee-generale", color: "#7c3aed", roles: ["super_admin", "syndicate_admin", "member"] },
      { label: "Réunions & Convocations", icon: "calendar", route: "/meetings", color: "#3b82f6", roles: ["super_admin", "syndicate_admin", "member"] },
      { label: "Votes & Résolutions", icon: "check-square", route: "/elections", color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member"] },
      { label: "Procès-Verbaux", icon: "file-text", route: "/pv", color: "#6366f1", roles: ["super_admin", "syndicate_admin", "member"] },
    ],
  },
  {
    title: "Documents Légaux",
    items: [
      { label: "Documents de Copropriété", icon: "folder", route: "/documents", color: "#6366f1", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Règlement de Copropriété", icon: "book", route: "/reglements", color: "#3b82f6", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Actes Administratifs", icon: "file-text", route: "/actes-administratifs", color: "#7c3aed", roles: ["super_admin", "syndicate_admin"] },
      { label: "Alertes Réglementaires", icon: "shield", route: "/legal", color: "#8b5cf6", roles: ["super_admin", "syndicate_admin"] },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Avis aux Copropriétaires", icon: "bell", route: "/annonces", color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Publications & Actualités", icon: "rss", route: "/publications", color: "#f97316", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Chat & Messagerie", icon: "message-circle", route: "/chat", color: "#ec4899", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Messagerie Interne", icon: "mail", route: "/messagerie-interne", color: "#3b82f6", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Alertes", icon: "bell", route: "/alerts", color: "#ef4444", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
  {
    title: "Support & Réclamations",
    items: [
      { label: "Demandes d'Intervention", icon: "headphones", route: "/support", color: "#ef4444", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Réclamations", icon: "inbox", route: "/reclamations", color: "#f97316", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
  {
    title: "Marketplace Résidence",
    items: [
      { label: "Mon Panier", icon: "shopping-cart", route: "/cart", color: "#f59e0b", roles: ["member", "syndicate_admin"] },
      { label: "Mes Commandes", icon: "package", route: "/orders", color: "#6366f1", roles: ["member", "syndicate_admin"] },
      { label: "Ma Boutique", icon: "shopping-bag", route: "/my-shop", color: "#10b981", roles: ["member", "syndicate_admin"] },
    ],
  },
  {
    title: "Administration Plateforme",
    items: [
      { label: "Gestion des Utilisateurs", icon: "users", route: "/utilisateurs", color: "#7c3aed", roles: ["super_admin"] },
      { label: "Tableau de Bord National", icon: "globe", route: "/tableau-national", color: "#6366f1", roles: ["super_admin"] },
      { label: "Créer un Syndicat", icon: "plus-circle", route: "/syndicate-setup", color: "#10b981", roles: ["super_admin"] },
      { label: "Journal d'Audit", icon: "shield", route: "/journal-audit", color: "#ef4444", roles: ["super_admin", "syndicate_admin"] },
      { label: "Statistiques Globales", icon: "trending-up", route: "/statistiques", color: "#10b981", roles: ["super_admin", "syndicate_admin"] },
    ],
  },
  {
    title: "Abonnements",
    items: [
      { label: "Plans & Abonnements", icon: "star", route: "/abonnements", color: "#f59e0b", roles: ["super_admin", "syndicate_admin", "member"] },
    ],
  },
  {
    title: "Mon Compte",
    items: [
      { label: "Mon Profil", icon: "user", route: "/profile", color: "#6366f1", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Notifications", icon: "bell", route: "/notifications", color: "#ec4899", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "Paramètres", icon: "settings", route: "/settings", color: "#6b7280", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
      { label: "CGU & Confidentialité", icon: "file-text", route: "/cgu", color: "#6b7280", roles: ["super_admin", "syndicate_admin", "member", "tenant"] },
    ],
  },
];

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { alerts, elections, supportTickets, members, cart } = useData();
  const { isWide } = useBreakpoints();
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

  const visibleSections = MENU_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role as any)),
  })).filter((s) => s.items.length > 0);

  const getBadge = (item: MenuItem): string | number | undefined => {
    if (item.route === "/alerts" && unreadAlerts > 0) return unreadAlerts;
    if (item.route === "/cart" && cartCount > 0) return cartCount;
    if (item.route === "/charges" && openTickets > 0 && role !== "member") return openTickets;
    return item.badge;
  };

  const roleLabel =
    role === "super_admin" ? "Super Administrateur" :
    role === "syndicate_admin" ? "Gestionnaire Syndic" :
    role === "tenant" ? "Locataire" : "Copropriétaire";

  const roleIcon: keyof typeof Feather.glyphMap =
    role === "super_admin" ? "shield" :
    role === "syndicate_admin" ? "briefcase" :
    role === "tenant" ? "key" : "home";

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Menu</Text>
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
          {[
            { icon: "bell" as const, label: "Alertes", value: unreadAlerts, color: "#ef4444", show: true },
            { icon: "check-square" as const, label: "Votes", value: openElections, color: "#f59e0b", show: true },
            { icon: "tool" as const, label: "Travaux", value: openTickets, color: "#8b5cf6", show: role !== "member" },
            { icon: "users" as const, label: "Copropriétaires", value: activeOwners, color: colors.primary, show: role !== "member" },
            { icon: "shopping-cart" as const, label: "Panier", value: cartCount, color: "#f97316", show: role === "member" },
          ].filter((s) => s.show).map((s, i, arr) => (
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
            <View key={section.title} style={[styles.section, isWide && styles.sectionDesktop]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {section.title.toUpperCase()}
              </Text>
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {section.items.map((item, i) => {
                  const badge = getBadge(item);
                  return (
                    <View key={item.label}>
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
          <Text style={[styles.logoutText, { color: colors.destructive }]}>Se déconnecter</Text>
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
