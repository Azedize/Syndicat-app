import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

const MENU_ITEMS_ADMIN = [
  {
    label: "Tableau de Bord Financier",
    sub: "Recouvrement, budget, historique par immeuble",
    icon: "bar-chart-2" as const,
    route: "/tableau-bord-financier",
    color: "#3B82F6",
    bg: "#EFF6FF",
  },
  {
    label: "Charges & Appels de Fonds",
    sub: "Suivi des paiements des copropriétaires",
    icon: "credit-card" as const,
    route: "/charges",
    color: "#10B981",
    bg: "#ECFDF5",
  },
  {
    label: "Budget Prévisionnel",
    sub: "Lignes budgétaires et répartition annuelle",
    icon: "pie-chart" as const,
    route: "/budget-previsionnel",
    color: "#8B5CF6",
    bg: "#F5F3FF",
  },
  {
    label: "Travaux & Chantiers",
    sub: "Budget travaux et suivi des dépenses",
    icon: "tool" as const,
    route: "/travaux",
    color: "#F97316",
    bg: "#FFF7ED",
  },
  {
    label: "Prestataires & Contrats",
    sub: "Charges contractuelles annuelles",
    icon: "briefcase" as const,
    route: "/prestataires",
    color: "#6366F1",
    bg: "#EEF2FF",
  },
  {
    label: "Documents Financiers",
    sub: "PV, quittances, relevés de compte",
    icon: "folder" as const,
    route: "/documents",
    color: "#0891B2",
    bg: "#ECFEFF",
  },
];

const MENU_ITEMS_MEMBER = [
  {
    label: "Mes Charges",
    sub: "Appels de fonds et historique de paiements",
    icon: "credit-card" as const,
    route: "/charges",
    color: "#10B981",
    bg: "#ECFDF5",
  },
  {
    label: "Mon Appartement",
    sub: "Détail de mon lot et mes locataires",
    icon: "home" as const,
    route: "/mon-lot",
    color: "#2563EB",
    bg: "#EFF6FF",
  },
  {
    label: "Documents",
    sub: "Règlement, PV d'assemblées, quittances",
    icon: "folder" as const,
    route: "/documents",
    color: "#0891B2",
    bg: "#ECFEFF",
  },
  {
    label: "Travaux en cours",
    sub: "Suivi des travaux dans la résidence",
    icon: "tool" as const,
    route: "/travaux",
    color: "#F97316",
    bg: "#FFF7ED",
  },
];

export default function FinanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  // FIX [M1]: treasurer must see the management view — they are the primary
  // finance operator. Previously only super_admin and syndicate_admin triggered
  // the admin layout, leaving treasurer on the member view.
  const isAdmin =
    user?.role === "super_admin" ||
    user?.role === "syndicate_admin" ||
    user?.role === "treasurer";
  const items = isAdmin ? MENU_ITEMS_ADMIN : MENU_ITEMS_MEMBER;

  // Keep this screen as a hub for all finance sub-screens.

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Finance</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {isAdmin
              ? "Gestion financière de la copropriété"
              : "Mes finances & paiements"}
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.primary + "18" }]}>
          <Feather name="dollar-sign" size={24} color={colors.primary} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollFlex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
        bounces
      >
        {/* Admin highlight card */}
        {isAdmin && (
          <TouchableOpacity
            style={[styles.highlightCard, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/tableau-bord-financier" as any)}
            activeOpacity={0.85}
          >
            <View style={styles.highlightLeft}>
              <Ionicons name="bar-chart" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.highlightTitle}>Tableau de Bord Financier</Text>
              <Text style={styles.highlightSub}>
                Taux de recouvrement · Budget · Fonds de réserve
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Modules financiers</Text>

        {items.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
              <Feather name={item.icon} size={20} color={item.color} />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_800ExtraBold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  scrollFlex: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  highlightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  highlightLeft: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  highlightTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  highlightSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },

  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  menuSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
