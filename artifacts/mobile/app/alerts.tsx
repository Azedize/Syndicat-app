import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData, type Alert as AppAlert } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import FilterChips from "@/components/FilterChips";
import StatsStrip from "@/components/StatsStrip";

type Filter = "all" | "unread" | "info" | "warning" | "success" | "error";

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { alerts, markAlertRead, markAllAlertsRead } = useData();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<AppAlert | null>(null);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const isAdmin = user?.role !== "member";
  const unread = alerts.filter((a) => !a.read).length;

  const alertConfig = (type: AppAlert["type"]) => ({
    info: { color: "#3b82f6", icon: "info" as const, label: "Information", bg: "#3b82f615" },
    warning: { color: "#f59e0b", icon: "alert-triangle" as const, label: "Avertissement", bg: "#f59e0b15" },
    success: { color: colors.success, icon: "check-circle" as const, label: "Succès", bg: colors.success + "15" },
    error: { color: colors.destructive, icon: "alert-circle" as const, label: "Urgent", bg: colors.destructive + "15" },
  }[type]);

  const handleMarkAllRead = () => {
    markAllAlertsRead();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleTap = (alert: AppAlert) => {
    setSelected(alert);
    if (!alert.read) {
      markAlertRead(alert.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const sorted = [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return 0;
  });

  const filtered = sorted.filter((a) => {
    if (filter === "all") return true;
    if (filter === "unread") return !a.read;
    return a.type === filter;
  });

  const FILTERS: { key: Filter; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "all", label: "Tous", icon: "bell" },
    { key: "unread", label: "Non lus", icon: "circle" },
    { key: "error", label: "Urgents", icon: "alert-circle" },
    { key: "warning", label: "Avertissements", icon: "alert-triangle" },
    { key: "info", label: "Infos", icon: "info" },
    { key: "success", label: "Succès", icon: "check-circle" },
  ];

  const TYPE_COLORS: Record<Exclude<Filter, "all" | "unread">, string> = {
    error: colors.destructive,
    warning: "#f59e0b",
    info: "#3b82f6",
    success: colors.success,
  };

  const filterColor = (f: Filter) => {
    if (f === "all") return colors.primary;
    if (f === "unread") return colors.foreground;
    return TYPE_COLORS[f as keyof typeof TYPE_COLORS];
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Alertes</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {unread > 0 ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est lu"}
          </Text>
        </View>
        {unread > 0 ? (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: colors.primary + "15" }]}
            onPress={handleMarkAllRead}
          >
            <Feather name="check-square" size={14} color={colors.primary} />
            <Text style={[styles.markAllText, { color: colors.primary }]}>Tout lire</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <StatsStrip
        stats={[
          { label: "Total",    value: alerts.length,                                          color: colors.primary },
          { label: "Non lus",  value: unread,                                                 color: colors.destructive },
          { label: "Urgents",  value: alerts.filter((a) => a.type === "error").length,        color: colors.destructive },
          { label: "Infos",    value: alerts.filter((a) => a.type === "info").length,         color: "#3b82f6" },
        ]}
      />

      <FilterChips
        options={FILTERS.map((f) => ({ key: f.key, label: f.label, count: f.key === "unread" && unread > 0 ? unread : undefined }))}
        value={filter}
        onChange={(k) => setFilter(k as Filter)}
        accentColor={filterColor(filter)}
      />

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "10" }]}>
              <Feather name="bell-off" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {filter === "unread" ? "Tout est lu" : "Aucune alerte"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {filter === "all"
                ? "Aucune alerte pour le moment. Nous vous notifierons des informations importantes."
                : `Aucune alerte de type "${FILTERS.find((f2) => f2.key === filter)?.label}".`}
            </Text>
            {filter !== "all" ? (
              <TouchableOpacity
                style={[styles.showAllBtn, { borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setFilter("all")}
              >
                <Text style={[styles.showAllText, { color: colors.foreground }]}>Voir toutes les alertes</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        renderItem={({ item: alert }) => {
          const ac = alertConfig(alert.type);
          return (
            <TouchableOpacity
              style={[
                styles.alertCard,
                {
                  backgroundColor: alert.read ? colors.card : ac.bg,
                  borderColor: alert.read ? colors.border : ac.color + "40",
                  borderLeftColor: ac.color,
                },
              ]}
              onPress={() => handleTap(alert)}
              activeOpacity={0.75}
            >
              {!alert.read ? <View style={[styles.unreadDot, { backgroundColor: ac.color }]} /> : null}
              <View style={[styles.alertIcon, { backgroundColor: ac.bg }]}>
                <Feather name={ac.icon} size={20} color={ac.color} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={[
                    styles.alertTitle,
                    { color: colors.foreground, fontFamily: alert.read ? "Inter_500Medium" : "Inter_700Bold" },
                  ]}
                  numberOfLines={2}
                >
                  {alert.title}
                </Text>
                <Text style={[styles.alertMsg, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {alert.message}
                </Text>
                <View style={styles.alertMeta}>
                  <Text style={[styles.alertDate, { color: colors.mutedForeground }]}>{alert.date}</Text>
                  <View style={[styles.typeBadge, { backgroundColor: ac.color + "15" }]}>
                    <Text style={[styles.typeText, { color: ac.color }]}>{ac.label}</Text>
                  </View>
                  <View style={[styles.targetBadge, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.targetText, { color: colors.mutedForeground }]}>
                      {alert.target === "all" ? "Tous" : alert.target === "admin" ? "Admins" : "Membres"}
                    </Text>
                  </View>
                </View>
              </View>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} style={{ alignSelf: "center" }} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Alert detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Détail de l'alerte</Text>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {/* Type badge + icon */}
              <View style={[styles.alertHero, { backgroundColor: alertConfig(selected.type).bg, borderColor: alertConfig(selected.type).color + "25" }]}>
                <View style={[styles.alertHeroIcon, { backgroundColor: alertConfig(selected.type).color + "20" }]}>
                  <Feather name={alertConfig(selected.type).icon} size={42} color={alertConfig(selected.type).color} />
                </View>
                <View style={[styles.alertTypeChip, { backgroundColor: alertConfig(selected.type).color }]}>
                  <Text style={styles.alertTypeChipText}>{alertConfig(selected.type).label}</Text>
                </View>
                <Text style={[styles.alertHeroTitle, { color: colors.foreground }]}>{selected.title}</Text>
              </View>

              {/* Message */}
              <View style={[styles.msgCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.msgLabel, { color: colors.foreground }]}>Message</Text>
                <Text style={[styles.msgText, { color: colors.mutedForeground }]}>{selected.message}</Text>
              </View>

              {/* Meta */}
              <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Date", value: selected.date },
                  { label: "Destinataires", value: selected.target === "all" ? "Tous les utilisateurs" : selected.target === "admin" ? "Administrateurs" : "Membres" },
                  { label: "Statut", value: selected.read ? "Lu" : "Non lu" },
                ].map((m, i) => (
                  <View key={m.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.metaRow}>
                      <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
                      <Text style={[styles.metaValue, { color: colors.foreground }]}>{m.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {!selected.read ? (
                <TouchableOpacity
                  style={[styles.readBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    markAlertRead(selected.id);
                    setSelected(null);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                >
                  <Feather name="check" size={16} color="#fff" />
                  <Text style={styles.readBtnText}>Marquer comme lu</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  markAllText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", gap: 12, paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  showAllBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  showAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  alertCard: { flexDirection: "row", alignItems: "flex-start", padding: 14, borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, gap: 12 },
  unreadDot: { position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: 4 },
  alertIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  alertTitle: { fontSize: 13, lineHeight: 18 },
  alertMsg: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  alertMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  alertDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  typeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  targetBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  targetText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  alertHero: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  alertHeroIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  alertTypeChip: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  alertTypeChipText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  alertHeroTitle: { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center", lineHeight: 22 },
  msgCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  msgLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  metaCard: { borderRadius: 16, borderWidth: 1, padding: 4 },
  sep: { height: 1, marginHorizontal: 12 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", padding: 12 },
  metaLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  readBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 14 },
  readBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
