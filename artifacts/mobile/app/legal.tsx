import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type Tab = "alerts" | "analysis" | "documents";

const AI_RISKS = [
  { area: "Conformité statutaire", score: 82, color: "#10b981", label: "Conforme" },
  { area: "Gestion financière", score: 65, color: "#f59e0b", label: "Attention" },
  { area: "Droit du travail", score: 91, color: "#10b981", label: "Conforme" },
  { area: "Gouvernance", score: 48, color: "#ef4444", label: "Risque" },
  { area: "Protection données", score: 74, color: "#f59e0b", label: "Attention" },
];

const LEGAL_DOCS = [
  { id: "1", title: "Mise en demeure - Cotisations impayées", icon: "file-text" as const, category: "Recouvrement" },
  { id: "2", title: "Convocation Assemblée Générale", icon: "users" as const, category: "AG" },
  { id: "3", title: "Procès-verbal d'élection", icon: "check-square" as const, category: "Elections" },
  { id: "4", title: "Contrat de travail syndicat", icon: "briefcase" as const, category: "RH" },
  { id: "5", title: "Recours administratif", icon: "shield" as const, category: "Juridique" },
  { id: "6", title: "Accord de partenariat", icon: "link" as const, category: "Partenariat" },
];

export default function LegalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { legalAlerts, resolveLegalAlert } = useData();
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Module Juridique</Text>
          <Text style={styles.headerSub}>Alertes légales & analyse des risques</Text>
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
                        resolveLegalAlert(alert.id);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      ) : tab === "analysis" ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 40 }}>
          <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.aiHeader}>
              <Feather name="cpu" size={20} color={colors.primary} />
              <Text style={[styles.aiTitle, { color: colors.foreground }]}>Analyse IA des risques</Text>
              <Text style={[styles.aiDate, { color: colors.mutedForeground }]}>Mise à jour: 18 Mai 2026</Text>
            </View>
            <View style={[styles.globalScore, { backgroundColor: colors.primary + "10" }]}>
              <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>Score global de conformité</Text>
              <Text style={[styles.scoreValue, { color: colors.primary }]}>72/100</Text>
              <Text style={[styles.scoreDesc, { color: colors.mutedForeground }]}>Attention — Des actions correctives sont requises</Text>
            </View>
          </View>

          {AI_RISKS.map((risk) => (
            <View key={risk.area} style={[styles.riskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.riskTop}>
                <Text style={[styles.riskArea, { color: colors.foreground }]}>{risk.area}</Text>
                <View style={[styles.riskBadge, { backgroundColor: risk.color + "18" }]}>
                  <Text style={[styles.riskLabel, { color: risk.color }]}>{risk.label}</Text>
                </View>
              </View>
              <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressFill, { width: `${risk.score}%` as any, backgroundColor: risk.color }]} />
              </View>
              <Text style={[styles.riskScore, { color: colors.mutedForeground }]}>{risk.score}/100</Text>
            </View>
          ))}

          <View style={[styles.recoCard, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
            <Text style={[styles.recoTitle, { color: colors.primary }]}>Recommandations IA</Text>
            {[
              "Organiser les élections du bureau avant expiration du mandat",
              "Réviser le règlement intérieur suite au décret N°2026-15",
              "Mettre en place un comité RGPD pour la protection des données",
              "Renforcer les contrôles internes sur les dépenses budgétaires",
            ].map((r, i) => (
              <View key={i} style={styles.recoRow}>
                <View style={[styles.recoDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.recoText, { color: colors.foreground }]}>{r}</Text>
              </View>
            ))}
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
                Alert.alert(doc.title, `Catégorie: ${doc.category}\n\nCe document peut être généré automatiquement à partir des données du syndicat.`);
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
                  Alert.alert("Document généré", `"${doc.title}" a été généré avec succès. Il sera disponible dans votre espace Documents.`);
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
