import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData, type LegalAlert } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/context/ToastContext";

type Tab = "alerts" | "analysis" | "documents";

const LEGAL_DOCS = [
  { id: "1", title: "Mise en demeure - Cotisations impayées", icon: "file-text" as const, category: "Recouvrement", template: "mise_en_demeure" },
  { id: "2", title: "Convocation Assemblée Générale", icon: "users" as const, category: "AG", template: "convocation" },
  { id: "3", title: "Procès-verbal d'élection", icon: "check-square" as const, category: "Elections", template: "pv" },
  { id: "4", title: "Contrat de travail syndicat", icon: "briefcase" as const, category: "RH", template: "contrat" },
  { id: "5", title: "Recours administratif", icon: "shield" as const, category: "Juridique", template: "acte_administratif" },
  { id: "6", title: "Accord de partenariat", icon: "link" as const, category: "Partenariat", template: "contrat" },
];

export default function LegalScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <LegalScreenInner />
    </RoleGuard>
  );
}

function LegalScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    legalAlerts,
    legalAlertsLoading,
    legalAlertsLoadError,
    refreshLegalAlerts,
    resolveLegalAlert,
  } = useData();
  const { t, lang, isRTL } = useLanguage();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("alerts");
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const levelConfig = (level: LegalAlert["level"]) => {
    if (level === "critical") return { color: colors.destructive, label: "Critique", icon: "alert-octagon" as const };
    if (level === "warning") return { color: "#f59e0b", label: "Avertissement", icon: "alert-triangle" as const };
    return { color: "#3b82f6", label: "Information", icon: "info" as const };
  };

  const statusConfig = (status: LegalAlert["status"]) => {
    if (status === "open") return { color: colors.destructive, label: "Ouvert" };
    if (status === "in_progress") return { color: "#f59e0b", label: "En cours" };
    return { color: colors.success, label: "Résolu" };
  };

  const analysisCopy = {
    title: { fr: "Analyse de conformité", en: "Compliance analysis", ar: "تحليل الامتثال", es: "Análisis de cumplimiento" },
    unavailable: { fr: "Analyse non disponible", en: "Analysis unavailable", ar: "التحليل غير متاح", es: "Análisis no disponible" },
    description: {
      fr: "Aucun score ou recommandation certifié n'est encore disponible pour ce syndicat. Les résultats ne seront affichés qu'après synchronisation d'une source réelle.",
      en: "No verified score or recommendation is available for this syndicate yet. Results will appear only after a real data source is synchronized.",
      ar: "لا توجد بعد نتيجة أو توصية موثوقة لهذا الاتحاد. ستظهر النتائج بعد مزامنة مصدر بيانات حقيقي.",
      es: "Todavía no hay una puntuación ni recomendaciones verificadas para este sindicato. Los resultados aparecerán tras sincronizar una fuente real.",
    },
    sourceNote: {
      fr: "Les alertes ci-dessous proviennent des données juridiques enregistrées dans votre espace.",
      en: "The alerts below come from the legal data recorded in your workspace.",
      ar: "التنبيهات أدناه مصدرها البيانات القانونية المسجلة في فضائك.",
      es: "Las alertas siguientes proceden de los datos legales registrados en su espacio.",
    },
  };
  const copy = (key: keyof typeof analysisCopy) => analysisCopy[key][lang];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("legalTitle")}</Text>
          <Text style={styles.headerSub}>{t("legalAlertTitle")}</Text>
        </View>
        <View style={[styles.aiBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          <Feather name="zap" size={12} color="#fbbf24" />
          <Text style={styles.aiBadgeText}>IA</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {([
          { key: "alerts", label: "Alertes", count: legalAlerts.filter((a) => a.status === "open").length },
          { key: "analysis", label: "Analyse risques", count: null },
          { key: "documents", label: "Documents légaux", count: null },
        ] as { key: Tab; label: string; count: number | null }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
            {t.count !== null && t.count > 0 ? (
              <View style={[styles.tabBadge, { backgroundColor: colors.destructive }]}>
                <Text style={styles.tabBadgeText}>{t.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {tab === "alerts" ? (
        legalAlertsLoading ? (
          <LoadingState title={t("loading")} description={copy("sourceNote")} accentColor={colors.primary} />
        ) : legalAlertsLoadError ? (
          <ErrorState
            title={t("error")}
            description={copy("description")}
            retryLabel={t("retry")}
            onRetry={() => void refreshLegalAlerts()}
          />
        ) : legalAlerts.length === 0 ? (
          <EmptyState
            icon="shield"
            title={t("noLegalAlerts")}
            description={copy("sourceNote")}
          />
        ) : (
        <FlatList
          data={legalAlerts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: alert }) => {
            const lc = levelConfig(alert.level);
            const sc = statusConfig(alert.status);
            return (
              <View style={[styles.alertCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: lc.color }]}>
                <View style={styles.alertTop}>
                  <View style={[styles.alertIcon, { backgroundColor: lc.color + "18" }]}>
                    <Feather name={lc.icon} size={18} color={lc.color} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.alertTitle, { color: colors.foreground }]}>{alert.title}</Text>
                    <View style={styles.alertMeta}>
                      <View style={[styles.levelBadge, { backgroundColor: lc.color + "18" }]}>
                        <Text style={[styles.levelText, { color: lc.color }]}>{lc.label}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: sc.color + "18" }]}>
                        <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <Text style={[styles.alertDesc, { color: colors.mutedForeground }]}>{alert.description}</Text>
                {alert.action ? (
                  <View style={[styles.actionRow, { backgroundColor: colors.muted }]}>
                    <Feather name="arrow-right-circle" size={14} color={colors.primary} />
                    <Text style={[styles.actionText, { color: colors.primary }]}>{alert.action}</Text>
                  </View>
                ) : null}
                <View style={styles.alertFooter}>
                  <Text style={[styles.alertDate, { color: colors.mutedForeground }]}>{alert.date}</Text>
                  {alert.status !== "resolved" ? (
                    <TouchableOpacity
                      style={[styles.resolveBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        void resolveLegalAlert(alert.id).then((success) => {
                          if (success) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          } else {
                            showToast({ type: "error", title: t("error"), message: copy("description") });
                          }
                        });
                      }}
                    >
                      <Feather name="check" size={13} color="#fff" />
                      <Text style={styles.resolveBtnText}>Résoudre</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.resolvedTag, { backgroundColor: colors.success + "18" }]}>
                      <Feather name="check-circle" size={12} color={colors.success} />
                      <Text style={[styles.resolvedText, { color: colors.success }]}>Résolu</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />
        )
      ) : tab === "analysis" ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 40 }}>
          <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border, direction: isRTL ? "rtl" : "ltr" }]}>
            <View style={styles.aiHeader}>
              <Feather name="info" size={20} color={colors.primary} />
              <Text style={[styles.aiTitle, { color: colors.foreground }]}>{copy("title")}</Text>
            </View>
            <EmptyState
              icon="database"
              title={copy("unavailable")}
              description={copy("description")}
              accentColor={colors.primary}
            />
            <Text style={[styles.sourceNote, { color: colors.mutedForeground }]}>{copy("sourceNote")}</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={LEGAL_DOCS}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: doc }) => (
            <TouchableOpacity
              style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/documents?template=${doc.template}` as any);
              }}
            >
              <View style={[styles.docIcon, { backgroundColor: colors.primary + "15" }]}>
                <Feather name={doc.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docTitle, { color: colors.foreground }]}>{doc.title}</Text>
                <Text style={[styles.docCat, { color: colors.mutedForeground }]}>{doc.category}</Text>
              </View>
              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  router.push(`/documents?template=${doc.template}` as any);
                }}
              >
                <Feather name="download" size={14} color="#fff" />
                <Text style={styles.generateText}>Générer</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
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
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  aiBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fbbf24" },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    flexDirection: "row",
    gap: 5,
  },
  tabLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff" },
  alertCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 16,
    gap: 10,
  },
  alertTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  alertMeta: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  levelText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  alertDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
  },
  actionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  alertFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  alertDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  resolveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  resolveBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  resolvedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  resolvedText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  aiCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  aiTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold" },
  sourceNote: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  aiDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  globalScore: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  scoreLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  scoreValue: { fontSize: 40, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  scoreDesc: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  riskCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  riskTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  riskArea: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  riskLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  progressBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  riskScore: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" },
  recoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  recoTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  recoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  recoDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  recoText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  docCat: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  generateText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
