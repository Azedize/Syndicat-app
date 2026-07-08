import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

type TabType = "plans" | "abonnements";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: "Actif",    color: "#10b981", bg: "#10b98118" },
  trial:     { label: "Essai",    color: "#3b82f6", bg: "#3b82f618" },
  suspended: { label: "Suspendu", color: "#ef4444", bg: "#ef444418" },
  cancelled: { label: "Annulé",   color: "#6b7280", bg: "#6b728018" },
};

type SubscriptionPlan = {
  id: string;
  name: string;
  price: string | number;
  interval: string;
  features: string; // JSON string array
  createdAt: string;
};

type SyndicateSub = {
  id: string;
  syndicateId: string;
  planId?: string | null;
  status: string;
  autoRenew?: boolean;
  createdAt: string;
  syndicateName?: string | null;
  planName?: string | null;
  planPrice?: string | number | null;
  planInterval?: string | null;
};

type MySub = SyndicateSub & {
  planFeatures?: string | null;
};

function parseFeatures(features?: string | null): string[] {
  if (!features) return [];
  try {
    const parsed = JSON.parse(features);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatPrice(price?: string | number | null): string {
  if (price == null) return "0";
  return parseFloat(String(price)).toLocaleString("fr-MA");
}

export default function AbonnementsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const role = user?.role ?? "member";
  const isSuper = role === "super_admin";
  const isAdmin = role === "syndicate_admin" || isSuper;

  const [tab, setTab] = useState<TabType>(isSuper ? "abonnements" : "plans");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<SyndicateSub[]>([]);
  const [mySub, setMySub] = useState<MySub | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showManage, setShowManage] = useState<SyndicateSub | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [plansRes, mySubRes] = await Promise.all([
        apiRequest("/subscriptions/plans", "GET", undefined, token),
        apiRequest("/subscriptions/my", "GET", undefined, token).catch(() => ({ data: null })),
      ]);
      setPlans(plansRes.data ?? []);
      setMySub(mySubRes.data ?? null);

      if (isSuper) {
        const allRes = await apiRequest("/subscriptions", "GET", undefined, token);
        setSubscriptions(allRes.data ?? []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, isSuper]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleSubscribe = async (planId: string) => {
    try {
      setSaving(true);
      await apiRequest("/subscriptions", "POST", { planId }, token);
      Alert.alert("Succès", "Abonnement activé avec succès.");
      setShowManage(null);
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de modifier l'abonnement");
    } finally { setSaving(false); }
  };

  const handleUpdateSub = async (subId: string, status: string) => {
    try {
      setSaving(true);
      await apiRequest(`/subscriptions/${subId}`, "PUT", { status }, token);
      setShowManage(null);
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de mettre à jour");
    } finally { setSaving(false); }
  };

  const activeCount = subscriptions.filter((s) => s.status === "active").length;

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Abonnements</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Abonnements</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Tabs — super admin only */}
      {isSuper && (
        <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {(["abonnements", "plans"] as TabType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => { Haptics.selectionAsync(); setTab(t); }}
            >
              <Text style={[styles.tabLabel, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
                {t === "abonnements" ? "Syndicats" : "Plans tarifaires"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
      >
        {/* ── Super admin: all subscriptions ─────────────────────────────── */}
        {isSuper && tab === "abonnements" && (
          <>
            {/* Stats strip */}
            <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Total syndicats", value: subscriptions.length.toString(), icon: "layers" as const, color: colors.primary },
                { label: "Actifs", value: `${activeCount}/${subscriptions.length}`, icon: "check-circle" as const, color: "#10b981" },
                { label: "Plans", value: plans.length.toString(), icon: "star" as const, color: "#f59e0b" },
              ].map((s, i, arr) => (
                <View key={s.label} style={[styles.statCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                  <View style={[styles.statIcon, { backgroundColor: s.color + "18" }]}>
                    <Feather name={s.icon} size={16} color={s.color} />
                  </View>
                  <Text style={[styles.statVal, { color: colors.foreground }]}>{s.value}</Text>
                  <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Subscription cards */}
            {subscriptions.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="inbox" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun abonnement enregistré</Text>
              </View>
            ) : subscriptions.map((sub) => {
              const st = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.active;
              return (
                <View key={sub.id} style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.subCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subName, { color: colors.foreground }]} numberOfLines={1}>{sub.syndicateName ?? sub.syndicateId}</Text>
                      <View style={styles.subMeta}>
                        {sub.planName ? (
                          <View style={[styles.planChip, { backgroundColor: colors.primary + "20" }]}>
                            <Text style={[styles.planChipText, { color: colors.primary }]}>{sub.planName}</Text>
                          </View>
                        ) : null}
                        <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
                          <Text style={[styles.statusChipText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      {sub.planPrice != null ? (
                        <>
                          <Text style={[styles.subAmount, { color: colors.foreground }]}>{formatPrice(sub.planPrice)} MAD</Text>
                          <Text style={[styles.subAmountLabel, { color: colors.mutedForeground }]}>/{sub.planInterval ?? "an"}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.subFooter, { borderTopColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="refresh-cw" size={11} color={sub.autoRenew ? "#10b981" : colors.mutedForeground} />
                      <Text style={[styles.subInfoText, { color: sub.autoRenew ? "#10b981" : colors.mutedForeground }]}>
                        Renouvellement {sub.autoRenew ? "auto" : "manuel"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.manageBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowManage(sub); setSelectedPlanId(sub.planId ?? ""); }}
                    >
                      <Feather name="edit-2" size={13} color={colors.primary} />
                      <Text style={[styles.manageBtnText, { color: colors.primary }]}>Gérer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── Plans tab / non-super-admin ────────────────────────────────── */}
        {(tab === "plans" || !isSuper) && (
          <>
            {/* Current plan banner (syndicate admin) */}
            {!isSuper && mySub && (
              <View style={[styles.currentPlanBanner, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.currentPlanLabel, { color: colors.primary }]}>Votre plan actuel</Text>
                  <Text style={[styles.currentPlanName, { color: colors.foreground }]}>{mySub.planName ?? "—"}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: STATUS_CONFIG[mySub.status]?.bg ?? STATUS_CONFIG.active.bg }]}>
                  <Text style={[styles.statusChipText, { color: STATUS_CONFIG[mySub.status]?.color ?? STATUS_CONFIG.active.color }]}>
                    {STATUS_CONFIG[mySub.status]?.label ?? mySub.status}
                  </Text>
                </View>
              </View>
            )}

            {/* Plans grid */}
            {plans.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="package" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun plan disponible</Text>
              </View>
            ) : plans.map((plan, idx) => {
              const features = parseFeatures(plan.features);
              const isCurrent = mySub?.planId === plan.id;
              const planColors = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#6366f1"];
              const pc = planColors[idx % planColors.length];

              return (
                <View
                  key={plan.id}
                  style={[styles.planCard, { backgroundColor: colors.card, borderColor: isCurrent ? pc : colors.border, borderWidth: isCurrent ? 2 : 1 }]}
                >
                  {isCurrent && (
                    <View style={[styles.popularBadge, { backgroundColor: "#10b981" }]}>
                      <Text style={styles.popularBadgeText}>✓ Plan actuel</Text>
                    </View>
                  )}

                  <View style={styles.planCardHeader}>
                    <View style={[styles.planIconCircle, { backgroundColor: pc + "18" }]}>
                      <Feather name={idx === 0 ? "package" : idx === 1 ? "zap" : "award"} size={22} color={pc} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
                      <Text style={[styles.planInterval, { color: colors.mutedForeground }]}>{plan.interval ?? "mensuel"}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.planPrice, { color: pc }]}>{formatPrice(plan.price)}</Text>
                      <Text style={[styles.planPriceCurrency, { color: colors.mutedForeground }]}>MAD/{plan.interval === "monthly" ? "mois" : "an"}</Text>
                    </View>
                  </View>

                  <View style={[styles.planDivider, { backgroundColor: colors.border }]} />

                  {features.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {features.map((f) => (
                        <View key={f} style={styles.featureRow}>
                          <View style={[styles.featureCheck, { backgroundColor: pc + "18" }]}>
                            <Feather name="check" size={12} color={pc} />
                          </View>
                          <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {isAdmin && !isCurrent && (
                    <TouchableOpacity
                      style={[styles.upgradeBtn, { backgroundColor: pc }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        Alert.alert(
                          "Changer de plan",
                          `Passer au plan "${plan.name}" ?`,
                          [
                            { text: "Annuler", style: "cancel" },
                            { text: "Confirmer", onPress: () => handleSubscribe(plan.id) },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.upgradeBtnText}>Choisir ce plan</Text>
                      <Feather name="arrow-right" size={14} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {/* Contact CTA */}
            <View style={[styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="phone" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactTitle, { color: colors.foreground }]}>Besoin d'un plan personnalisé?</Text>
                <Text style={[styles.contactSub, { color: colors.mutedForeground }]}>
                  Contactez notre équipe pour une offre sur mesure pour votre organisation.
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </View>
          </>
        )}
      </ScrollView>

      {/* Manage subscription modal (super admin) */}
      <Modal visible={!!showManage} transparent animationType="slide" onRequestClose={() => setShowManage(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Gérer l'abonnement</Text>
            {showManage && (
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>{showManage.syndicateName}</Text>
            )}

            <View style={{ gap: 10, marginTop: 16 }}>
              {plans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[styles.planOption, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + "10" : colors.background }]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedPlanId(plan.id); }}
                  >
                    <View style={[styles.planOptionDot, { borderColor: colors.primary, backgroundColor: isSelected ? colors.primary : "transparent" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planOptionName, { color: colors.foreground }]}>{plan.name}</Text>
                      <Text style={[styles.planOptionPrice, { color: colors.mutedForeground }]}>{formatPrice(plan.price)} MAD/{plan.interval ?? "an"}</Text>
                    </View>
                    {isSelected ? <Feather name="check-circle" size={16} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ gap: 10, marginTop: 20 }}>
              {showManage?.status !== "suspended" ? (
                <TouchableOpacity
                  style={[styles.modalAction, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}
                  onPress={() => showManage && handleUpdateSub(showManage.id, "suspended")}
                >
                  <Feather name="pause-circle" size={16} color="#ef4444" />
                  <Text style={[styles.modalActionText, { color: "#ef4444" }]}>Suspendre l'abonnement</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.modalAction, { backgroundColor: "#10b98115", borderColor: "#10b98130" }]}
                  onPress={() => showManage && handleUpdateSub(showManage.id, "active")}
                >
                  <Feather name="play-circle" size={16} color="#10b981" />
                  <Text style={[styles.modalActionText, { color: "#10b981" }]}>Réactiver l'abonnement</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
                onPress={() => selectedPlanId && handleSubscribe(selectedPlanId)}
                disabled={saving || !selectedPlanId}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmBtnText}>Enregistrer le plan</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowManage(null)}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 10, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  subCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", padding: 14, gap: 12 },
  subCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  subName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  subMeta: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  planChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  planChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  subAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  subAmountLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  subFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  subInfoText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  manageBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  manageBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  currentPlanBanner: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  currentPlanLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  currentPlanName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  planCard: { borderRadius: 16, overflow: "hidden", padding: 16, gap: 12 },
  popularBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  popularBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  planCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  planIconCircle: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  planInterval: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  planPrice: { fontSize: 22, fontFamily: "Inter_700Bold" },
  planPriceCurrency: { fontSize: 11, fontFamily: "Inter_400Regular" },
  planDivider: { height: 1 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureCheck: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  upgradeBtn: { borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  upgradeBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  contactCard: { borderRadius: 16, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  contactTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  contactSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: "#d1d5db", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  planOption: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  planOptionDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  planOptionName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  planOptionPrice: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalAction: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  modalActionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { borderRadius: 14, padding: 16, alignItems: "center" },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  cancelBtn: { borderRadius: 14, padding: 16, alignItems: "center" },
  cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
