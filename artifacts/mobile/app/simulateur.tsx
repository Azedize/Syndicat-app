import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "@/context/ToastContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

interface Bureau {
  id: string;
  name: string;
  type: "national" | "regional" | "local" | "commission";
  president: string;
  members: number;
  budget: number;
  status: "active" | "added" | "removed";
  region?: string;
  parityRatio: number;
  jeunesRatio: number;
}

const INITIAL_BUREAUX: Bureau[] = [
  { id: "b1", name: "Bureau National", type: "national", president: "Fatima Zahra El Alami", members: 15, budget: 120000, status: "active", parityRatio: 47, jeunesRatio: 33 },
  { id: "b2", name: "Bureau Casablanca-Settat", type: "regional", president: "Hassan Berrada", members: 9, budget: 45000, status: "active", region: "Casablanca-Settat", parityRatio: 44, jeunesRatio: 22 },
  { id: "b3", name: "Bureau Rabat-Salé", type: "regional", president: "Salma Idrissi", members: 7, budget: 38000, status: "active", region: "Rabat-Salé", parityRatio: 57, jeunesRatio: 28 },
  { id: "b4", name: "Bureau Fès-Meknès", type: "regional", president: "Karim Tazi", members: 6, budget: 32000, status: "active", region: "Fès-Meknès", parityRatio: 33, jeunesRatio: 17 },
  { id: "b5", name: "Commission Juridique", type: "commission", president: "Omar Lahlou", members: 5, budget: 18000, status: "active", parityRatio: 40, jeunesRatio: 40 },
  { id: "b6", name: "Commission Formation", type: "commission", president: "Nadia Benchekroun", members: 4, budget: 25000, status: "active", parityRatio: 75, jeunesRatio: 50 },
];

const TYPE_CFG = {
  national: { label: "National", color: "#2563EB", icon: "globe" as const },
  regional: { label: "Régional", color: "#3b82f6", icon: "map-pin" as const },
  local: { label: "Local", color: "#10b981", icon: "home" as const },
  commission: { label: "Commission", color: "#f59e0b", icon: "users" as const },
};

function ParityBar({ value, label, min = 40 }: { value: number; label: string; min?: number }) {
  const colors = useColors();
  const ok = value >= min;
  const color = ok ? "#10b981" : "#ef4444";
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>{label}</Text>
        <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color }}>{value}%</Text>
      </View>
      <View style={{ height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, overflow: "hidden" }}>
        <View style={{ width: `${value}%` as any, height: "100%", backgroundColor: color, borderRadius: 2 }} />
      </View>
    </View>
  );
}

export default function SimulateurScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const { t } = useLanguage();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [bureaux, setBureaux] = useState<Bureau[]>(INITIAL_BUREAUX);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [sandboxBureaux, setSandboxBureaux] = useState<Bureau[]>(INITIAL_BUREAUX.map((b) => ({ ...b })));
  const [selectedBureau, setSelectedBureau] = useState<Bureau | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"structure" | "impacts">("structure");
  const [form, setForm] = useState({ name: "", type: "regional" as Bureau["type"], president: "", members: "", budget: "", region: "", parityRatio: "40", jeunesRatio: "30" });

  const current = sandboxMode ? sandboxBureaux : bureaux;
  const setCurrent = sandboxMode ? setSandboxBureaux : setBureaux;

  const activeBureaux = current.filter((b) => b.status !== "removed");
  const totalMembers = activeBureaux.reduce((s, b) => s + b.members, 0);
  const totalBudget = activeBureaux.reduce((s, b) => s + b.budget, 0);
  const avgParity = Math.round(activeBureaux.reduce((s, b) => s + b.parityRatio, 0) / activeBureaux.length);
  const avgJeunes = Math.round(activeBureaux.reduce((s, b) => s + b.jeunesRatio, 0) / activeBureaux.length);

  const origActiveBureaux = bureaux.filter((b) => b.status !== "removed");
  const origTotal = origActiveBureaux.reduce((s, b) => s + b.members, 0);
  const origBudget = origActiveBureaux.reduce((s, b) => s + b.budget, 0);

  const complianceIssues = activeBureaux.filter((b) => b.parityRatio < 40 || b.members < 5);
  const isCompliant = complianceIssues.length === 0;

  const handleRemoveBureau = (id: string) => {
    if (!sandboxMode) {
      Alert.alert(t("simSandboxRequired"), t("simSandboxRequiredMsg"));
      return;
    }
    setSandboxBureaux((p) => p.map((b) => b.id === id ? { ...b, status: "removed" as const } : b));
    setSelectedBureau(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleAddBureau = () => {
    if (!sandboxMode) {
      Alert.alert(t("simSandboxRequired"), t("simSandboxRequiredMsg"));
      return;
    }
    if (!form.name || !form.president || !form.members) {
      Alert.alert(t("simRequiredFields"), t("simRequiredFieldsMsg"));
      return;
    }
    const nb: Bureau = {
      id: `b${Date.now()}`,
      name: form.name,
      type: form.type,
      president: form.president,
      members: parseInt(form.members) || 5,
      budget: parseInt(form.budget) || 0,
      status: "added",
      region: form.region,
      parityRatio: parseInt(form.parityRatio) || 40,
      jeunesRatio: parseInt(form.jeunesRatio) || 30,
    };
    setSandboxBureaux((p) => [...p, nb]);
    setShowAddModal(false);
    setForm({ name: "", type: "regional", president: "", members: "", budget: "", region: "", parityRatio: "40", jeunesRatio: "30" });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleApply = () => {
    Alert.alert(
      t("simApplyConfirmTitle"),
      t("simApplyConfirmMsg"),
      [
        { text: t("pubEditCancel"), style: "cancel" },
        {
          text: t("simApplyConfirmOk"),
          onPress: () => {
            setBureaux(sandboxBureaux.map((b) => ({ ...b, status: b.status === "added" ? "active" : b.status })));
            setSandboxMode(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(t("simApplySuccess"), t("simApplySuccessMsg"));
          },
        },
      ]
    );
  };

  const handleReset = () => {
    setSandboxBureaux(bureaux.map((b) => ({ ...b })));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const renderBureau = (b: Bureau) => {
    if (b.status === "removed") return null;
    const tc = TYPE_CFG[b.type];
    const isNew = b.status === "added";
    return (
      <TouchableOpacity
        key={b.id}
        style={[styles.bureauCard, { backgroundColor: colors.card, borderColor: isNew ? "#10b981" : colors.border, borderLeftWidth: 4, borderLeftColor: tc.color }]}
        onPress={() => { setSelectedBureau(b); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        activeOpacity={0.8}
      >
        <View style={styles.bureauTop}>
          <View style={[styles.typeIcon, { backgroundColor: tc.color + "18" }]}>
            <Feather name={tc.icon} size={14} color={tc.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.bureauNameRow}>
              <Text style={[styles.bureauName, { color: colors.foreground }]} numberOfLines={1}>{b.name}</Text>
              {isNew && (
                <View style={[styles.newBadge, { backgroundColor: "#10b98118" }]}>
                  <Text style={[styles.newBadgeText, { color: "#10b981" }]}>{t("simNewBadge")}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.bureauPresident, { color: colors.mutedForeground }]}>{b.president}</Text>
          </View>
          <View style={styles.bureauStats}>
            <Text style={[styles.bureauMembCount, { color: colors.foreground }]}>{b.members}</Text>
            <Text style={[styles.bureauMembLabel, { color: colors.mutedForeground }]}>{t("simMembers")}</Text>
          </View>
        </View>
        <ParityBar value={b.parityRatio} label={t("simParity")} />
        {b.parityRatio < 40 && (
          <View style={styles.warningRow}>
            <Feather name="alert-triangle" size={11} color="#ef4444" />
            <Text style={[styles.warningText, { color: "#ef4444" }]}>{t("simParityWarning")}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("simTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t("simSubtitle")}</Text>
        </View>
        <TouchableOpacity
          style={[styles.sandboxToggle, { backgroundColor: sandboxMode ? "#f59e0b" : colors.muted }]}
          onPress={() => {
            if (!sandboxMode) setSandboxBureaux(bureaux.map((b) => ({ ...b })));
            setSandboxMode(!sandboxMode);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <Feather name="play" size={14} color={sandboxMode ? "#fff" : colors.mutedForeground} />
          <Text style={[styles.sandboxToggleText, { color: sandboxMode ? "#fff" : colors.mutedForeground }]}>
            {sandboxMode ? t("simSandboxOn") : t("simSandboxOff")}
          </Text>
        </TouchableOpacity>
      </View>

      {sandboxMode && (
        <View style={[styles.sandboxBanner, { backgroundColor: "#f59e0b18", borderBottomColor: "#f59e0b40" }]}>
          <Feather name="alert-circle" size={14} color="#f59e0b" />
          <Text style={[styles.sandboxText, { color: "#f59e0b" }]}>{t("simSandboxBanner")}</Text>
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Feather name="refresh-cw" size={13} color="#f59e0b" />
            <Text style={[styles.resetText, { color: "#f59e0b" }]}>{t("simReset")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(["structure", "impacts"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
              {tab === "structure" ? t("simTabStructure") : t("simTabImpacts")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 100 }}>
        {activeTab === "structure" ? (
          <>
            {/* KPI strip */}
            <View style={[styles.kpiStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: t("simKpiActiveBureaux"), value: activeBureaux.length, icon: "git-merge" as const, color: colors.primary },
                { label: t("simKpiTotalMembers"), value: totalMembers, icon: "users" as const, color: "#3b82f6" },
                { label: t("simKpiAvgParity"), value: `${avgParity}%`, icon: "activity" as const, color: avgParity >= 40 ? "#10b981" : "#ef4444" },
              ].map((k, i, arr) => (
                <View key={k.label} style={[styles.kpi, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: k.color + "18" }]}>
                    <Feather name={k.icon} size={14} color={k.color} />
                  </View>
                  <Text style={[styles.kpiVal, { color: colors.foreground }]}>{k.value}</Text>
                  <Text style={[styles.kpiLab, { color: colors.mutedForeground }]}>{k.label}</Text>
                </View>
              ))}
            </View>

            {/* Bureaux list */}
            {current.map(renderBureau)}

            {sandboxMode && (
              <TouchableOpacity
                style={[styles.addBureauBtn, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "10" }]}
                onPress={() => { setShowAddModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Feather name="plus" size={18} color={colors.primary} />
                <Text style={[styles.addBureauText, { color: colors.primary }]}>{t("simAddBureau")}</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {/* Compliance */}
            <View style={[styles.complianceCard, { backgroundColor: isCompliant ? "#10b98108" : "#ef444408", borderColor: isCompliant ? "#10b98130" : "#ef444430" }]}>
              <View style={styles.complianceHeader}>
                <Feather name={isCompliant ? "check-circle" : "alert-triangle"} size={22} color={isCompliant ? "#10b981" : "#ef4444"} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.complianceTitle, { color: isCompliant ? "#10b981" : "#ef4444" }]}>
                    {isCompliant ? t("simCompliant") : `${complianceIssues.length} ${t("simComplianceIssues")}`}
                  </Text>
                  <Text style={[styles.complianceSub, { color: colors.mutedForeground }]}>{t("simComplianceLaw")}</Text>
                </View>
              </View>
              {!isCompliant && complianceIssues.map((b) => (
                <View key={b.id} style={styles.issueRow}>
                  <Feather name="alert-circle" size={13} color="#ef4444" />
                  <Text style={[styles.issueText, { color: "#ef4444" }]}>
                    {b.name}: {b.parityRatio < 40 ? `Parité ${b.parityRatio}% (min 40%)` : `${b.members} membres (min 5)`}
                  </Text>
                </View>
              ))}
            </View>

            {/* Comparison */}
            {sandboxMode && (
              <View style={[styles.compCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.compTitle, { color: colors.foreground }]}>{t("simCompareTitle")}</Text>
                {[
                  { label: t("simKpiActiveBureaux"), before: origActiveBureaux.length, after: activeBureaux.length, unit: "" },
                  { label: t("simKpiTotalMembers"), before: origTotal, after: totalMembers, unit: "" },
                  { label: t("simAnnualBudget"), before: origBudget, after: totalBudget, unit: " MAD" },
                  { label: t("simFemaleParity"), before: Math.round(bureaux.reduce((s, b) => s + b.parityRatio, 0) / bureaux.length), after: avgParity, unit: "%" },
                  { label: t("simYouth"), before: Math.round(bureaux.reduce((s, b) => s + b.jeunesRatio, 0) / bureaux.length), after: avgJeunes, unit: "%" },
                ].map((r, i) => {
                  const delta = r.after - r.before;
                  const deltaColor = delta > 0 ? "#10b981" : delta < 0 ? "#ef4444" : colors.mutedForeground;
                  return (
                    <View key={r.label}>
                      {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                      <View style={styles.compRow}>
                        <Text style={[styles.compLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                        <Text style={[styles.compBefore, { color: colors.mutedForeground }]}>{r.before}{r.unit}</Text>
                        <Feather name="arrow-right" size={14} color={colors.mutedForeground} />
                        <Text style={[styles.compAfter, { color: colors.foreground }]}>{r.after}{r.unit}</Text>
                        {delta !== 0 && (
                          <View style={[styles.deltaBadge, { backgroundColor: deltaColor + "18" }]}>
                            <Text style={[styles.deltaText, { color: deltaColor }]}>
                              {delta > 0 ? "+" : ""}{delta}{r.unit}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Budget breakdown */}
            <View style={[styles.budgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.compTitle, { color: colors.foreground }]}>{t("simBudgetTitle")}</Text>
              {activeBureaux.map((b, i) => {
                const pct = totalBudget > 0 ? Math.round((b.budget / totalBudget) * 100) : 0;
                const tc = TYPE_CFG[b.type];
                return (
                  <View key={b.id}>
                    {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                    <View style={styles.budgetRow}>
                      <View style={[styles.budgetDot, { backgroundColor: tc.color }]} />
                      <Text style={[styles.budgetLabel, { color: colors.foreground }]} numberOfLines={1}>{b.name}</Text>
                      <Text style={[styles.budgetAmt, { color: colors.mutedForeground }]}>{(b.budget / 1000).toFixed(0)}k</Text>
                      <Text style={[styles.budgetPct, { color: tc.color }]}>{pct}%</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: "#e5e7eb", borderRadius: 2, marginHorizontal: 14, marginBottom: 8, overflow: "hidden" }}>
                      <View style={{ width: `${pct}%` as any, height: "100%", backgroundColor: tc.color + "80", borderRadius: 2 }} />
                    </View>
                  </View>
                );
              })}
            </View>

            {sandboxMode && (
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                onPress={handleApply}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.applyBtnText}>{t("simApplyBtn")}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* Bureau Detail Modal */}
      <Modal visible={!!selectedBureau} animationType="slide" presentationStyle="pageSheet">
        {selectedBureau && (() => {
          const b = selectedBureau;
          const tc = TYPE_CFG[b.type];
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: tc.color, paddingTop: 24 }]}>
                <TouchableOpacity onPress={() => setSelectedBureau(null)} style={{ position: "absolute", top: 16, right: 16 }}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={[styles.bureauModalIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                  <Feather name={tc.icon} size={28} color="#fff" />
                </View>
                <Text style={styles.bureauModalName}>{b.name}</Text>
                <Text style={styles.bureauModalType}>{tc.label}</Text>
                {b.region && <Text style={styles.bureauModalRegion}>{b.region}</Text>}
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
                <View style={[styles.detailGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { label: t("simPresident"), value: b.president, icon: "user" as const },
                    { label: t("simKpiTotalMembers"), value: String(b.members), icon: "users" as const },
                    { label: t("simAnnualBudget"), value: `${b.budget.toLocaleString()} MAD`, icon: "dollar-sign" as const },
                    { label: t("simFemaleParity"), value: `${b.parityRatio}%`, icon: "activity" as const },
                    { label: t("simYouth"), value: `${b.jeunesRatio}%`, icon: "trending-up" as const },
                  ].map(({ label, value, icon }, i) => (
                    <View key={label}>
                      {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                      <View style={styles.detailRow}>
                        <View style={[styles.detailIcon, { backgroundColor: tc.color + "18" }]}>
                          <Feather name={icon} size={14} color={tc.color} />
                        </View>
                        <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
                        <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
        <ParityBar value={b.parityRatio} label={t("simParity")} />
                {sandboxMode && b.id !== "b1" && (
                  <TouchableOpacity
                    style={[styles.removeBureauBtn, { borderColor: "#ef4444" + "40" }]}
                    onPress={() => handleRemoveBureau(b.id)}
                  >
                    <Feather name="trash-2" size={16} color="#ef4444" />
                    <Text style={[styles.removeBureauText, { color: "#ef4444" }]}>{t("simRemoveBureau")}</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* Add Bureau Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader2, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle2, { color: colors.foreground }]}>Ajouter un bureau</Text>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleAddBureau}>
              <Text style={styles.saveBtnText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            {[
              { label: t("simFieldName"), field: "name" as const, placeholder: "Ex: Bureau Marrakech-Safi" },
              { label: t("simFieldPresident"), field: "president" as const, placeholder: "Prénom NOM" },
              { label: t("simFieldRegion"), field: "region" as const, placeholder: "Ex: Marrakech-Safi" },
              { label: t("simFieldMembers"), field: "members" as const, placeholder: "Ex: 7" },
              { label: "Budget annuel (MAD)", field: "budget" as const, placeholder: "Ex: 35000" },
              { label: t("simFieldParity"), field: "parityRatio" as const, placeholder: "Ex: 44" },
              { label: t("simFieldYouth"), field: "jeunesRatio" as const, placeholder: "Ex: 30" },
            ].map((f) => (
              <View key={f.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <View style={[styles.inputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    value={form[f.field]}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, [f.field]: v }))}
                    keyboardType={["members", "budget", "parityRatio", "jeunesRatio"].includes(f.field) ? "numeric" : "default"}
                  />
                </View>
              </View>
            ))}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Type</Text>
            <View style={styles.typeRow}>
              {(["national", "regional", "local", "commission"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, { backgroundColor: form.type === t ? TYPE_CFG[t].color : colors.muted }]}
                  onPress={() => setForm((f) => ({ ...f, type: t }))}
                >
                  <Text style={[styles.typeChipText, { color: form.type === t ? "#fff" : colors.mutedForeground }]}>
                    {TYPE_CFG[t].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  sandboxToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  sandboxToggleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sandboxBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, paddingHorizontal: 16, borderBottomWidth: 1 },
  sandboxText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  resetText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  kpiStrip: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  kpi: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  kpiIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  kpiVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  kpiLab: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  bureauCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  bureauTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  typeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  bureauNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  bureauName: { fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  newBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  newBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  bureauPresident: { fontSize: 11, fontFamily: "Inter_400Regular" },
  bureauStats: { alignItems: "center" },
  bureauMembCount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  bureauMembLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  warningRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  warningText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  addBureauBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed" as any },
  addBureauText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  complianceCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  complianceHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  complianceTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  complianceSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  issueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  issueText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  compCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 0 },
  compTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  compRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  compLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  compBefore: { fontSize: 13, fontFamily: "Inter_400Regular" },
  compAfter: { fontSize: 13, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "right" },
  deltaBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  deltaText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  sep: { height: 1, marginHorizontal: 0 },
  budgetCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingTop: 14, paddingHorizontal: 14 },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 4 },
  budgetDot: { width: 8, height: 8, borderRadius: 4 },
  budgetLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  budgetAmt: { fontSize: 11, fontFamily: "Inter_400Regular" },
  budgetPct: { fontSize: 11, fontFamily: "Inter_700Bold", minWidth: 36, textAlign: "right" },
  applyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 16 },
  applyBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  modal: { flex: 1 },
  modalHeader: { alignItems: "center", padding: 20, gap: 8 },
  bureauModalIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  bureauModalName: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  bureauModalType: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" },
  bureauModalRegion: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.7)" },
  detailGrid: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  detailIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detailLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  removeBureauBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  removeBureauText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalHeader2: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  modalTitle2: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  inputBox: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 14, fontFamily: "Inter_400Regular" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
