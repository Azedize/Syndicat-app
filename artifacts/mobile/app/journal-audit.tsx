import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useLanguage, type LangCode } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { getToken } from "@/services/api";
import { ErrorState, LoadingState } from "@/components/DataState";

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  syndicateId?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { color: string; icon: keyof typeof Feather.glyphMap }> = {
  vote: { color: "#f59e0b", icon: "check-square" },
  pay_cotisation: { color: "#10b981", icon: "credit-card" },
  approve_member: { color: "#10b981", icon: "user-check" },
  reject_member: { color: "#ef4444", icon: "user-x" },
  create_election: { color: "#2563EB", icon: "layers" },
  add_member: { color: "#3b82f6", icon: "user-plus" },
  add_transaction: { color: "#10b981", icon: "dollar-sign" },
  validate_product: { color: "#10b981", icon: "package" },
  resolve_ticket: { color: "#6366f1", icon: "check-circle" },
  login: { color: "#3b82f6", icon: "log-in" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { color: "#6b7280", icon: "activity" as const };
}

const ACTION_LABELS: Record<string, Record<LangCode, string>> = {
  vote: { fr: "Vote enregistré", en: "Vote recorded", ar: "تم تسجيل التصويت", es: "Voto registrado" },
  pay_cotisation: { fr: "Cotisation payée", en: "Contribution paid", ar: "تم دفع الاشتراك", es: "Cuota pagada" },
  approve_member: { fr: "Membre approuvé", en: "Member approved", ar: "تمت الموافقة على العضو", es: "Miembro aprobado" },
  reject_member: { fr: "Membre rejeté", en: "Member rejected", ar: "تم رفض العضو", es: "Miembro rechazado" },
  create_election: { fr: "Élection créée", en: "Election created", ar: "تم إنشاء الانتخابات", es: "Elección creada" },
  add_member: { fr: "Membre ajouté", en: "Member added", ar: "تمت إضافة العضو", es: "Miembro añadido" },
  add_transaction: { fr: "Transaction ajoutée", en: "Transaction added", ar: "تمت إضافة المعاملة", es: "Transacción añadida" },
  validate_product: { fr: "Produit validé", en: "Product approved", ar: "تم اعتماد المنتج", es: "Producto validado" },
  resolve_ticket: { fr: "Ticket résolu", en: "Ticket resolved", ar: "تم حل التذكرة", es: "Ticket resuelto" },
  login: { fr: "Connexion", en: "Login", ar: "تسجيل الدخول", es: "Inicio de sesión" },
};

const ENTITY_FILTERS: Array<{ key: string; labelKey: string; matches: string[] }> = [
  { key: "all", labelKey: "auditEntityAll", matches: [] },
  { key: "election", labelKey: "auditEntityElection", matches: ["élection", "election"] },
  { key: "member", labelKey: "auditEntityMember", matches: ["membre", "member"] },
  { key: "payment", labelKey: "auditEntityPayment", matches: ["paiement", "payment", "cotisation", "contribution"] },
  { key: "meeting", labelKey: "auditEntityMeeting", matches: ["réunion", "reunion", "meeting"] },
  { key: "document", labelKey: "auditEntityDocument", matches: ["document"] },
  { key: "work", labelKey: "auditEntityWork", matches: ["travaux", "work"] },
];

const AUDIT_TEXT: Record<string, Record<LangCode, string>> = {
  entries: { fr: "entrée(s)", en: "entry", ar: "سجل", es: "entrada(s)" },
  entriesPlural: { fr: "entrée(s)", en: "entries", ar: "سجلات", es: "entradas" },
  loadingTitle: { fr: "Chargement du journal d’audit", en: "Loading audit log", ar: "جارٍ تحميل سجل التدقيق", es: "Cargando registro de auditoría" },
  loadingDescription: { fr: "Nous préparons l’historique des actions autorisées.", en: "We are preparing the history of authorized actions.", ar: "نحن نجهز سجل الإجراءات المصرح بها.", es: "Estamos preparando el historial de acciones autorizadas." },
  loadingError: { fr: "Impossible de charger le journal d’audit", en: "Unable to load the audit log", ar: "تعذر تحميل سجل التدقيق", es: "No se puede cargar el registro de auditoría" },
  errorDescription: { fr: "Le journal n’est pas disponible pour le moment. Vérifiez votre connexion puis réessayez.", en: "The audit log is unavailable right now. Check your connection and try again.", ar: "سجل التدقيق غير متاح حالياً. تحقق من الاتصال ثم أعد المحاولة.", es: "El registro de auditoría no está disponible. Compruebe su conexión e inténtelo de nuevo." },
  emptyTitle: { fr: "Aucune entrée", en: "No entries", ar: "لا توجد سجلات", es: "Sin entradas" },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  syndicate: { fr: "Syndicat", en: "Syndicate", ar: "النقابة", es: "Sindicato" },
};

function formatDate(iso: string, lang: LangCode) {
  const d = new Date(iso);
  const locale = { fr: "fr-FR", en: "en-GB", ar: "ar-MA", es: "es-ES" }[lang];
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function actionLabel(action: string, lang: LangCode) {
  return ACTION_LABELS[action]?.[lang] ?? action.replace(/_/g, " ");
}

export default function JournalAuditScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <JournalAuditScreenInner />
    </RoleGuard>
  );
}

function JournalAuditScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entityFilter, setEntityFilter] = useState("all");
  const [loadError, setLoadError] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      setLoadError(false);
      const token = await getToken();
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;
      const resp = await fetch(`${baseUrl}/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setLogs(data.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const onRefresh = () => { setRefreshing(true); fetchLogs(); };

  const selectedFilter = ENTITY_FILTERS.find((filter) => filter.key === entityFilter) ?? ENTITY_FILTERS[0];
  const filtered = entityFilter === "all"
    ? logs
    : logs.filter((l) => selectedFilter.matches.some((match) => l.entity.toLowerCase().includes(match)));

  const isSuperAdmin = user?.role === "super_admin";
  const isSyndicateAdmin = user?.role === "syndicate_admin";

  if (!isSuperAdmin && !isSyndicateAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
           <Text style={styles.headerTitle}>{t("journalAudit")}</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>Accès réservé aux administrateurs</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
           <Text style={styles.headerTitle}>{t("journalAudit")}</Text>
           <Text style={styles.headerSub}>
             {filtered.length} {filtered.length === 1 ? AUDIT_TEXT.entries[lang] : AUDIT_TEXT.entriesPlural[lang]} — {isSuperAdmin ? t("platformGlobal") : t("yourSyndicate")}
           </Text>
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRefresh(); }}
          style={styles.refreshBtn}
        >
          <Feather name="refresh-cw" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Entity filter pills */}
      <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
           data={ENTITY_FILTERS}
           keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
          renderItem={({ item }) => {
             const active = entityFilter === item.key;
            return (
              <TouchableOpacity
                style={[styles.filterChip, { backgroundColor: active ? colors.primary : colors.background, borderColor: active ? colors.primary : colors.border }]}
                 onPress={() => { setEntityFilter(item.key); Haptics.selectionAsync(); }}
              >
                 <Text style={[styles.filterLabel, { color: active ? "#fff" : colors.mutedForeground }]}>{t(item.labelKey)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Content */}
      {loading ? (
        <LoadingState title={AUDIT_TEXT.loadingTitle[lang]} description={AUDIT_TEXT.loadingDescription[lang]} accentColor={colors.primary} />
      ) : loadError ? (
        <ErrorState
          title={AUDIT_TEXT.loadingError[lang]}
          description={AUDIT_TEXT.errorDescription[lang]}
          retryLabel={AUDIT_TEXT.retry[lang]}
          onRetry={() => { setLoading(true); fetchLogs(); }}
          accentColor={colors.destructive}
        />
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="shield" size={44} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{AUDIT_TEXT.emptyTitle[lang]}</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noLogsMsg")}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          renderItem={({ item: log }) => {
            const cfg = getActionConfig(log.action);
            return (
              <View style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: cfg.color }]}>
                <View style={[styles.logIcon, { backgroundColor: cfg.color + "18" }]}>
                  <Feather name={cfg.icon} size={16} color={cfg.color} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                     <Text style={[styles.actionLabel, { color: colors.foreground }]}>{actionLabel(log.action, lang)}</Text>
                    <View style={[styles.entityBadge, { backgroundColor: cfg.color + "15" }]}>
                      <Text style={[styles.entityText, { color: cfg.color }]}>{log.entity}</Text>
                    </View>
                  </View>
                  <Text style={[styles.userName, { color: colors.mutedForeground }]}>
                    <Feather name="user" size={10} color={colors.mutedForeground} /> {log.userName}
                     {log.syndicateId ? ` • ${AUDIT_TEXT.syndicate[lang]} ${log.syndicateId.slice(0, 8)}` : ""}
                  </Text>
                  {log.details ? (
                    <Text style={[styles.details, { color: colors.mutedForeground }]} numberOfLines={2}>{log.details}</Text>
                  ) : null}
                </View>
                 <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatDate(log.createdAt, lang)}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  refreshBtn: { padding: 6 },
  filterRow: { borderBottomWidth: 1 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  logCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  actionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  entityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  entityText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 11, fontFamily: "Inter_400Regular" },
  details: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  timestamp: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "right", minWidth: 70 },
});
