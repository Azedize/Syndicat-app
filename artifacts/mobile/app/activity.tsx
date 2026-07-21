import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SectionList,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { audit as auditApi } from "@/services/api";

type ActivityCategory = "all" | "auth" | "finance" | "governance" | "documents" | "elections" | "marketplace" | "members" | "chat" | "system";

const CAT_CONFIG: Record<Exclude<ActivityCategory, "all">, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  auth: { label: "Authentification", color: "#2563EB", icon: "lock" },
  finance: { label: "Finance", color: "#10b981", icon: "dollar-sign" },
  governance: { label: "Gouvernance", color: "#3b82f6", icon: "git-merge" },
  documents: { label: "Documents", color: "#6366f1", icon: "file-text" },
  elections: { label: "Élections", color: "#f59e0b", icon: "check-square" },
  marketplace: { label: "Marketplace", color: "#f97316", icon: "shopping-bag" },
  members: { label: "Membres", color: "#ec4899", icon: "users" },
  chat: { label: "Chat", color: "#06b6d4", icon: "message-circle" },
  system: { label: "Système", color: "#6b7280", icon: "settings" },
};

type Severity = "info" | "warning" | "success" | "error";

interface ActivityLog {
  id: string;
  category: Exclude<ActivityCategory, "all">;
  action: string;
  target: string;
  detail?: string;
  user: string;
  userAvatar: string;
  userRole: string;
  timestamp: string;
  relativeTime: string;
  severity: Severity;
  ip?: string;
}

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string }> = {
  info: { color: "#3b82f6", bg: "#3b82f615" },
  warning: { color: "#f59e0b", bg: "#f59e0b15" },
  success: { color: "#10b981", bg: "#10b98115" },
  error: { color: "#ef4444", bg: "#ef444415" },
};

// ─── Entity → Category mapping ────────────────────────────────────────────────

const ENTITY_TO_CATEGORY: Record<string, Exclude<ActivityCategory, "all">> = {
  auth: "auth", user: "auth", login: "auth", session: "auth", password: "auth",
  transaction: "finance", payment: "finance", cotisation: "finance", invoice: "finance",
  bon: "finance", budget: "finance", salary: "finance", caisse: "finance",
  election: "elections", vote: "elections", candidate: "elections",
  meeting: "governance", resolution: "governance", workflow: "governance",
  document: "documents", file: "documents",
  publication: "members", member: "members", tenant: "members",
  message: "chat", conversation: "chat",
  order: "marketplace", product: "marketplace", cart: "marketplace",
  system: "system", backup: "system", job: "system",
};

function inferCategory(entity: string): Exclude<ActivityCategory, "all"> {
  const e = (entity ?? "").toLowerCase();
  for (const [key, cat] of Object.entries(ENTITY_TO_CATEGORY)) {
    if (e.includes(key)) return cat;
  }
  return "system";
}

function inferSeverity(action: string): Severity {
  const a = (action ?? "").toLowerCase();
  if (a.includes("fail") || a.includes("error") || a.includes("reject") || a.includes("échoué")) return "error";
  if (a.includes("warn") || a.includes("attempt") || a.includes("suspect") || a.includes("tentative")) return "warning";
  if (a.includes("creat") || a.includes("add") || a.includes("approv") || a.includes("pay") || a.includes("login") || a.includes("success") || a.includes("valid")) return "success";
  return "info";
}

function relativeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Hier";
  return `Il y a ${days}j`;
}

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapApiLog(raw: {
  id: string; userId: string; userName: string | null; syndicateId: string | null;
  action: string; entity: string; entityId: string | null; details: string | null; createdAt: string;
}): ActivityLog {
  const userName = raw.userName ?? "Système";
  const avatar = userName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "SY";
  const d = safeDate(raw.createdAt);
  const ts = d ? d.toISOString().slice(0, 16).replace("T", " ") : "";
  return {
    id: raw.id,
    category: inferCategory(raw.entity ?? ""),
    action: raw.action ?? "",
    target: raw.entityId ? `${raw.entity ?? ""} #${raw.entityId.slice(0, 8)}` : (raw.entity ?? ""),
    detail: raw.details ?? undefined,
    user: userName,
    userAvatar: avatar,
    userRole: "",
    timestamp: ts,
    relativeTime: d ? relativeLabel(d.toISOString()) : "",
    severity: inferSeverity(raw.action ?? ""),
  };
}

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role !== "member";

  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loadingApi, setLoadingApi] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState<ActivityCategory>("all");
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingApi(true);
    setLoadError(false);
    auditApi.getLogs()
      .then((res) => {
        if (cancelled) return;
        setActivities((res.data ?? []).map(mapApiLog));
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      })
      .finally(() => { if (!cancelled) setLoadingApi(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = category === "all" ? activities : activities.filter((a) => a.category === category);

  // Group by day
  const grouped = filtered.reduce<Record<string, ActivityLog[]>>((acc, log) => {
    const dateStr = log.timestamp.split(" ")[0];
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let key: string;
    if (d.toDateString() === today.toDateString()) key = "Aujourd'hui";
    else if (d.toDateString() === yesterday.toDateString()) key = "Hier";
    else key = `${d.getDate()} ${["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"][d.getMonth()]} ${d.getFullYear()}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(log);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([title, data]) => ({ title, data }));

  const counts: Record<string, number> = { all: activities.length };
  Object.keys(CAT_CONFIG).forEach((k) => {
    counts[k] = activities.filter((a) => a.category === k).length;
  });

  const errorCount = activities.filter((a) => a.severity === "error" || a.severity === "warning").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t("activityTitle")}</Text>
            <Text style={styles.headerSub}>Audit trail & traçabilité complète</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Share.share({ title: "Journal d'activité VERIDIAN", message: `Journal d'activité complet\nExporté le ${new Date().toLocaleDateString("fr-MA")}\nVERIDIAN` }); }}
            >
              <Feather name="download" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: "activity" as const, val: activities.length, label: "Événements", color: "#fff" },
            { icon: "check-circle" as const, val: activities.filter((a) => a.severity === "success").length, label: "Succès", color: "#6ee7b7" },
            { icon: "alert-triangle" as const, val: errorCount, label: "Alertes", color: errorCount > 0 ? "#fcd34d" : "#6ee7b7" },
            { icon: "users" as const, val: new Set(activities.map((a) => a.user)).size, label: "Utilisateurs", color: "#c4b5fd" },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Feather name={s.icon} size={12} color={s.color} />
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Security alert if needed */}
        {activities.some((a) => a.severity === "error" || (a.severity === "warning" && a.category === "auth")) && (
          <View style={styles.securityAlert}>
            <Feather name="shield" size={14} color="#fbbf24" />
            <Text style={styles.securityAlertText}>1 tentative de connexion suspecte détectée</Text>
            <TouchableOpacity onPress={() => { setCategory("auth"); Haptics.selectionAsync(); }}>
              <Text style={styles.securityAlertLink}>Voir</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.chipContent}
      >
        <TouchableOpacity
          style={[styles.chip, { backgroundColor: category === "all" ? colors.primary : colors.muted }]}
          onPress={() => { setCategory("all"); Haptics.selectionAsync(); }}
        >
          <Feather name="list" size={12} color={category === "all" ? "#fff" : colors.mutedForeground} />
          <Text style={[styles.chipText, { color: category === "all" ? "#fff" : colors.mutedForeground }]}>{t("all")} ({counts.all})</Text>
        </TouchableOpacity>
        {(Object.entries(CAT_CONFIG) as [Exclude<ActivityCategory, "all">, typeof CAT_CONFIG["auth"]][]).map(([key, cfg]) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, { backgroundColor: category === key ? cfg.color : colors.muted }]}
            onPress={() => { setCategory(key); Haptics.selectionAsync(); }}
          >
            <Feather name={cfg.icon} size={12} color={category === key ? "#fff" : colors.mutedForeground} />
            <Text style={[styles.chipText, { color: category === key ? "#fff" : colors.mutedForeground }]}>{cfg.label} ({counts[key]})</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.empty}>
            {loadingApi ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Feather name={loadError ? "wifi-off" : "activity"} size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {loadError ? "Impossible de charger le journal d'activité" : t("noActivity")}
                </Text>
              </>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{section.title}</Text>
            <View style={[styles.sectionCount, { backgroundColor: colors.muted }]}>
              <Text style={[styles.sectionCountText, { color: colors.mutedForeground }]}>{section.data.length}</Text>
            </View>
          </View>
        )}
        renderItem={({ item: log }) => {
          const catCfg = CAT_CONFIG[log.category];
          const sevCfg = SEVERITY_CONFIG[log.severity];
          return (
            <TouchableOpacity
              style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedLog(log); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={[styles.logLeft, { backgroundColor: catCfg.color + "15" }]}>
                <Feather name={catCfg.icon} size={16} color={catCfg.color} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.logTop}>
                  <View style={styles.logBadges}>
                    <View style={[styles.catBadge, { backgroundColor: catCfg.color + "12" }]}>
                      <Text style={[styles.catBadgeText, { color: catCfg.color }]}>{catCfg.label}</Text>
                    </View>
                    <View style={[styles.sevBadge, { backgroundColor: sevCfg.bg }]}>
                      <Text style={[styles.sevBadgeText, { color: sevCfg.color }]}>{log.severity === "info" ? "Info" : log.severity === "warning" ? "Alerte" : log.severity === "success" ? "Succès" : t("error")}</Text>
                    </View>
                  </View>
                  <Text style={[styles.logTime, { color: colors.mutedForeground }]}>{log.relativeTime}</Text>
                </View>
                <Text style={[styles.logAction, { color: colors.foreground }]}>{log.action}</Text>
                <Text style={[styles.logTarget, { color: colors.mutedForeground }]} numberOfLines={1}>{log.target}</Text>
                <View style={styles.logUserRow}>
                  <View style={[styles.logAvatar, { backgroundColor: catCfg.color + "15" }]}>
                    <Text style={[styles.logAvatarText, { color: catCfg.color }]}>{log.userAvatar}</Text>
                  </View>
                  <Text style={[styles.logUser, { color: colors.mutedForeground }]}>{log.user} · {log.userRole}</Text>
                </View>
              </View>
              <View style={[styles.severityStripe, { backgroundColor: sevCfg.color }]} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <Modal visible={!!selectedLog} transparent animationType="slide">
        {selectedLog && (() => {
          const log = selectedLog;
          const catCfg = CAT_CONFIG[log.category];
          const sevCfg = SEVERITY_CONFIG[log.severity];
          return (
            <View style={styles.modalOverlay}>
              <View style={[styles.detailModal, { backgroundColor: colors.card }]}>
                <View style={styles.detailTop}>
                  <View style={[styles.detailIcon, { backgroundColor: catCfg.color + "15" }]}>
                    <Feather name={catCfg.icon} size={22} color={catCfg.color} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.logBadges}>
                      <View style={[styles.catBadge, { backgroundColor: catCfg.color + "12" }]}>
                        <Text style={[styles.catBadgeText, { color: catCfg.color }]}>{catCfg.label}</Text>
                      </View>
                      <View style={[styles.sevBadge, { backgroundColor: sevCfg.bg }]}>
                        <Text style={[styles.sevBadgeText, { color: sevCfg.color }]}>
                          {log.severity === "info" ? "Info" : log.severity === "warning" ? "Alerte" : log.severity === "success" ? "Succès" : t("error")}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.detailAction, { color: colors.foreground }]}>{log.action}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedLog(null)}>
                    <Feather name="x" size={22} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.detailSection, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {[
                    { label: "Cible", value: log.target },
                    { label: "Détail", value: log.detail ?? "—" },
                    { label: "Utilisateur", value: `${log.user} (${log.userRole})` },
                    { label: "Horodatage", value: log.timestamp },
                    log.ip ? { label: "Adresse IP", value: log.ip } : null,
                  ].filter(Boolean).map((item: any, i) => (
                    <View key={item.label}>
                      {i > 0 && <View style={[styles.detailSep, { backgroundColor: colors.border }]} />}
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                        <Text style={[styles.detailValue, { color: colors.foreground }]}>{item.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.detailBtns}>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[styles.detailBtn, { backgroundColor: colors.primary + "15" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Share.share({ title: `Log ${log.id}`, message: `ID: ${log.id}\nActeur: ${log.user}\nAction: ${log.action}\nCible: ${log.target}\nDate: ${log.timestamp}${log.detail ? `\n${log.detail}` : ""}` }); }}
                    >
                      <Feather name="download" size={15} color={colors.primary} />
                      <Text style={[styles.detailBtnText, { color: colors.primary }]}>Exporter</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.detailBtn, { backgroundColor: colors.muted }]}
                    onPress={() => setSelectedLog(null)}
                  >
                    <Text style={[styles.detailBtnText, { color: colors.foreground }]}>{t("close")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })()}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  exportBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, padding: 12, marginBottom: 10 },
  statBox: { flex: 1, alignItems: "center", gap: 3 },
  statVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", textAlign: "center" },
  securityAlert: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(251,191,36,0.15)", padding: 10, borderRadius: 12 },
  securityAlertText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: "#fbbf24" },
  securityAlertLink: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fbbf24", textDecorationLine: "underline" },
  chipBar: { flexShrink: 0, borderBottomWidth: 1 },
  chipContent: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, flexShrink: 0 },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  sectionTitle: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5, flex: 1 },
  sectionCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  sectionCountText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  logCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  logLeft: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logBadges: { flexDirection: "row", gap: 6 },
  catBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  catBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  sevBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  sevBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  logTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  logAction: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  logTarget: { fontSize: 12, fontFamily: "Inter_400Regular" },
  logUserRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  logAvatar: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  logAvatarText: { fontSize: 8, fontFamily: "Inter_700Bold" },
  logUser: { fontSize: 11, fontFamily: "Inter_400Regular" },
  severityStripe: { position: "absolute", right: 0, top: 0, bottom: 0, width: 3 },
  empty: { alignItems: "center", justifyContent: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  detailModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16, maxHeight: "85%" },
  detailTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  detailIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailAction: { fontSize: 16, fontFamily: "Inter_700Bold" },
  detailSection: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  detailRow: { padding: 12, gap: 3 },
  detailLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailSep: { height: 1, marginHorizontal: 12 },
  detailBtns: { flexDirection: "row", gap: 10 },
  detailBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12 },
  detailBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
