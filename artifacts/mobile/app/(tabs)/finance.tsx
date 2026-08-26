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
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { crossPlatformShadow } from "@/lib/shadow";

export default function FinanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  // FIX [M1]: treasurer must see the management view — they are the primary
  // finance operator. Previously only super_admin and syndicate_admin triggered
  // the admin layout, leaving treasurer on the member view.
  // President has full financial visibility (co-signs budgets and appel-de-fonds).
  // Treasurer is the primary finance manager.
  const isAdmin =
    user?.role === "super_admin" ||
    user?.role === "syndicate_admin" ||
    user?.role === "treasurer" ||
    user?.role === "president";

  const MENU_ITEMS_ADMIN = [
    {
      label: t("financeBoardTitle"),
      sub: t("chargesAppelsSub"),
      icon: "bar-chart-2" as const,
      route: "/tableau-bord-financier",
      color: "#3B82F6",
      bg: "#EFF6FF",
    },
    {
      label: t("chargesAppels"),
      sub: t("chargesAppelsSub"),
      icon: "credit-card" as const,
      route: "/charges",
      color: "#10B981",
      bg: "#ECFDF5",
    },
    {
      label: t("budgetPrevisionnel"),
      sub: t("budgetPrevSub"),
      icon: "pie-chart" as const,
      route: "/budget-previsionnel",
      color: "#8B5CF6",
      bg: "#F5F3FF",
    },
    {
      label: t("travauxChantiersLabel"),
      sub: t("travauxChantiersSub"),
      icon: "tool" as const,
      route: "/travaux",
      color: "#F97316",
      bg: "#FFF7ED",
    },
    {
      label: t("prestatairesContrats"),
      sub: t("prestatairesContratsSub"),
      icon: "briefcase" as const,
      route: "/prestataires",
      color: "#1F5EFF",
      bg: "#EEF2FF",
    },
    {
      label: t("documentsFinanciers"),
      sub: t("documentsFinanciersSub"),
      icon: "folder" as const,
      route: "/documents",
      color: "#0891B2",
      bg: "#ECFEFF",
    },
  ];

  const MENU_ITEMS_MEMBER = [
    {
      label: t("mesChargesLabel"),
      sub: t("mesChargesSub"),
      icon: "credit-card" as const,
      route: "/charges",
      color: "#10B981",
      bg: "#ECFDF5",
    },
    {
      label: t("monAppartement"),
      sub: t("monAppartementSub"),
      icon: "home" as const,
      route: "/mon-lot",
      color: "#2563EB",
      bg: "#EFF6FF",
    },
    {
      label: t("documents"),
      sub: t("documentsMemberSub"),
      icon: "folder" as const,
      route: "/documents",
      color: "#0891B2",
      bg: "#ECFEFF",
    },
    {
      label: t("travauxEnCours"),
      sub: t("travauxEnCoursSub"),
      icon: "tool" as const,
      route: "/travaux",
      color: "#F97316",
      bg: "#FFF7ED",
    },
  ];

  const items = isAdmin ? MENU_ITEMS_ADMIN : MENU_ITEMS_MEMBER;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>{t("finance")}</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>
            {isAdmin ? t("financeAdminSub") : t("financeMemberSub")}
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
            style={[styles.highlightCard, { backgroundColor: colors.primary, flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => router.push("/tableau-bord-financier" as any)}
            activeOpacity={0.85}
          >
            <View style={styles.highlightLeft}>
              <Ionicons name="bar-chart" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.highlightTitle, { textAlign: isRTL ? "right" : "left" }]}>{t("financeBoardTitle")}</Text>
              <Text style={[styles.highlightSub, { textAlign: isRTL ? "right" : "left" }]}>
                {t("financeBoardSub")}
              </Text>
            </View>
            <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>{t("financeModules")}</Text>

        {items.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row" }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
              <Feather name={item.icon} size={20} color={item.color} />
            </View>
            <View style={styles.menuText}>
              <Text style={[styles.menuLabel, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>{item.label}</Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" }]}>{item.sub}</Text>
            </View>
            <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
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
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    ...crossPlatformShadow({ color: "#000", offsetY: 0, opacity: 0.15, radius: 10, elevation: 4 }),
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
