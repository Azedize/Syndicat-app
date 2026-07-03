import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
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
    color: "#7C3AED",
    bg: "#F5F3FF",
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
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const isAdmin =
    user?.role === "super_admin" || user?.role === "syndicate_admin";
  const items = isAdmin ? MENU_ITEMS_ADMIN : MENU_ITEMS_MEMBER;

  // Auto-redirect admins directly to the financial dashboard if they tap the tab
  // (keep this screen as a hub for all finance sub-screens)

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Finance</Text>
          <Text style={styles.headerSub}>
            {isAdmin
              ? "Gestion financière de la copropriété"
              : "Mes finances & paiements"}
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <Feather name="dollar-sign" size={24} color="#3B82F6" />
        </View>
      </View>

      {/* Admin highlight card */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.highlightCard}
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.sectionTitle}>Modules financiers</Text>

        {items.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.menuItem}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
              <Feather name={item.icon} size={20} color={item.color} />
            </View>
            <View style={styles.menuText}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuSub}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#1E293B" },
  headerSub: { fontSize: 13, color: "#64748B", marginTop: 2 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },

  highlightCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    margin: 16,
    padding: 16,
    backgroundColor: "#1E3A5F",
    borderRadius: 16,
    shadowColor: "#1E3A5F",
    shadowOpacity: 0.3,
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
    fontWeight: "700",
  },
  highlightSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    marginTop: 3,
  },

  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  menuSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
});
