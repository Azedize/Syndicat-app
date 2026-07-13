import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type TabType = "preferences" | "historique";

const ALERT_COLORS = {
  info: "#3b82f6",
  warning: "#f59e0b",
  success: "#10b981",
  error: "#ef4444",
};

const ALERT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  info: "info",
  warning: "alert-triangle",
  success: "check-circle",
  error: "alert-circle",
};

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { notificationPreferences, toggleNotificationPref, alerts, markAlertRead } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [tab, setTab] = useState<TabType>("preferences");
  const [globalPush, setGlobalPush] = useState(true);
  const [globalEmail, setGlobalEmail] = useState(true);
  const [doNotDisturb, setDoNotDisturb] = useState(false);

  const unread = alerts.filter((a) => !a.read).length;

  const handleToggle = (id: string, channel: "push" | "email" | "inApp") => {
    Haptics.selectionAsync();
    toggleNotificationPref(id, channel);
  };

  const handleMarkAllRead = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    alerts.filter((a) => !a.read).forEach((a) => markAlertRead(a.id));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["preferences", "historique"] as TabType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { Haptics.selectionAsync(); setTab(t); }}
          >
            <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t === "preferences" ? "Préférences" : `Historique${unread > 0 ? ` (${unread})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
      >
        {tab === "preferences" && (
          <>
            {/* Global controls */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PARAMÈTRES GLOBAUX</Text>

              {[
                {
                  icon: "bell" as const,
                  color: colors.primary,
                  label: "Notifications push",
                  sub: "Recevoir des notifications sur l'appareil",
                  value: globalPush,
                  onChange: (v: boolean) => { Haptics.selectionAsync(); setGlobalPush(v); },
                },
                {
                  icon: "mail" as const,
                  color: "#3b82f6",
                  label: "Notifications email",
                  sub: "Recevoir des emails de notification",
                  value: globalEmail,
                  onChange: (v: boolean) => { Haptics.selectionAsync(); setGlobalEmail(v); },
                },
                {
                  icon: "moon" as const,
                  color: "#8b5cf6",
                  label: "Ne pas déranger",
                  sub: "Désactiver toutes les notifications",
                  value: doNotDisturb,
                  onChange: (v: boolean) => { Haptics.selectionAsync(); setDoNotDisturb(v); },
                },
              ].map((item, i, arr) => (
                <View key={item.label}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                  <View style={styles.switchRow}>
                    <View style={[styles.rowIcon, { backgroundColor: item.color + "18" }]}>
                      <Feather name={item.icon} size={18} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
                    </View>
                    <Switch
                      value={item.value}
                      onValueChange={item.onChange}
                      trackColor={{ false: colors.border, true: item.color + "60" }}
                      thumbColor={item.value ? item.color : "#f4f3f4"}
                    />
                  </View>
                </View>
              ))}
            </View>

            {/* Per-category preferences */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PAR CATÉGORIE</Text>

            {notificationPreferences.map((pref) => (
              <View key={pref.id} style={[styles.prefCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.prefHeader}>
                  <View style={[styles.prefIcon, { backgroundColor: pref.color + "18" }]}>
                    <Feather name={pref.icon as keyof typeof Feather.glyphMap} size={20} color={pref.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.prefLabel, { color: colors.foreground }]}>{pref.label}</Text>
                    <Text style={[styles.prefDesc, { color: colors.mutedForeground }]}>{pref.description}</Text>
                  </View>
                </View>

                <View style={[styles.prefDivider, { backgroundColor: colors.border }]} />

                <View style={styles.prefChannels}>
                  {[
                    { key: "push" as const, label: "Push", icon: "smartphone" as const },
                    { key: "email" as const, label: "Email", icon: "mail" as const },
                    { key: "inApp" as const, label: "In-App", icon: "bell" as const },
                  ].map((ch, i, arr) => (
                    <View key={ch.key} style={[styles.channelCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 }}>
                        <Feather name={ch.icon} size={12} color={colors.mutedForeground} />
                        <Text style={[styles.channelLabel, { color: colors.mutedForeground }]}>{ch.label}</Text>
                      </View>
                      <Switch
                        value={pref[ch.key]}
                        onValueChange={() => handleToggle(pref.id, ch.key)}
                        trackColor={{ false: colors.border, true: pref.color + "60" }}
                        thumbColor={pref[ch.key] ? pref.color : "#f4f3f4"}
                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* Sound & vibration */}
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SON & VIBRATION</Text>
              {[
                { icon: "volume-2" as const, color: "#10b981", label: "Son des notifications", sub: "Jouer un son à chaque notification" },
                { icon: "activity" as const, color: "#f59e0b", label: "Vibration", sub: "Vibrer à chaque notification" },
                { icon: "eye" as const, color: "#6366f1", label: "Aperçu des messages", sub: "Afficher le contenu sur l'écran verrouillé" },
              ].map((item, i, arr) => (
                <View key={item.label}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                  <View style={styles.switchRow}>
                    <View style={[styles.rowIcon, { backgroundColor: item.color + "18" }]}>
                      <Feather name={item.icon} size={18} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{item.label}</Text>
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
                    </View>
                    <Switch
                      value={true}
                      onValueChange={() => Haptics.selectionAsync()}
                      trackColor={{ false: colors.border, true: item.color + "60" }}
                      thumbColor={item.color}
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {tab === "historique" && (
          <>
            {unread > 0 && (
              <TouchableOpacity
                style={[styles.markAllBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}
                onPress={handleMarkAllRead}
              >
                <Feather name="check-square" size={15} color={colors.primary} />
                <Text style={[styles.markAllText, { color: colors.primary }]}>
                  Tout marquer comme lu ({unread})
                </Text>
              </TouchableOpacity>
            )}

            {/* Summary strip */}
            <View style={[styles.summaryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {(["info", "warning", "success", "error"] as const).map((type, i, arr) => {
                const count = alerts.filter((a) => a.type === type).length;
                return (
                  <View key={type} style={[styles.summaryCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                    <View style={[styles.summaryDot, { backgroundColor: ALERT_COLORS[type] + "20" }]}>
                      <Feather name={ALERT_ICONS[type]} size={13} color={ALERT_COLORS[type]} />
                    </View>
                    <Text style={[styles.summaryCount, { color: colors.foreground }]}>{count}</Text>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                      {type === "info" ? "Info" : type === "warning" ? "Alerte" : type === "success" ? "Succès" : "Erreur"}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Notification list */}
            {alerts.map((alert) => {
              const c = ALERT_COLORS[alert.type];
              const ico = ALERT_ICONS[alert.type];
              return (
                <TouchableOpacity
                  key={alert.id}
                  style={[
                    styles.notifCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: alert.read ? colors.border : c + "40",
                      borderLeftWidth: alert.read ? 1 : 4,
                      borderLeftColor: alert.read ? colors.border : c,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    markAlertRead(alert.id);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.notifIconWrap, { backgroundColor: c + "18" }]}>
                    <Feather name={ico} size={18} color={c} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.notifTitleRow}>
                      <Text style={[styles.notifTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {alert.title}
                      </Text>
                      {!alert.read && (
                        <View style={[styles.unreadDot, { backgroundColor: c }]} />
                      )}
                    </View>
                    <Text style={[styles.notifMsg, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {alert.message}
                    </Text>
                    <View style={styles.notifFooter}>
                      <View style={[styles.typeChip, { backgroundColor: c + "18" }]}>
                        <Text style={[styles.typeChipText, { color: c }]}>
                          {alert.type === "info" ? "Info" : alert.type === "warning" ? "Alerte" : alert.type === "success" ? "Succès" : "Erreur"}
                        </Text>
                      </View>
                      <Text style={[styles.notifDate, { color: colors.mutedForeground }]}>{alert.date}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {alerts.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="bell-off" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune notification</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    gap: 0,
  },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginStart: 4 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  sep: { height: 1, marginVertical: 2 },
  prefCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    padding: 14,
    gap: 10,
  },
  prefHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  prefIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  prefLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  prefDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },
  prefDivider: { height: 1 },
  prefChannels: { flexDirection: "row" },
  channelCell: { flex: 1, alignItems: "center", paddingVertical: 6 },
  channelLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  markAllText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryRow: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  summaryCell: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 4 },
  summaryDot: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  summaryCount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  notifCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  notifIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  notifTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notifTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_700Bold" },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  notifMsg: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  notifFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  typeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  notifDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", gap: 12, paddingVertical: 48 },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
