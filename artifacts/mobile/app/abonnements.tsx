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
import { useToast } from "@/context/ToastContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  name: string;
  description?: string | null;
  price: string | number | null;
  yearlyPrice: string | number | null;
  interval: string;
  features: string;
  maxBuildings?: number | null;
  maxLots?: number | null;
  maxMembers?: number | null;
  maxStorageGb?: number | null;
  maxDocuments?: number | null;
  maxSignatures?: number | null;
  isTrial?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  color?: string | null;
};

type MySub = {
  id: string;
  syndicateId: string;
  planId?: string | null;
  status: string;
  effectiveStatus: string;
  isExpired: boolean;
  isReadOnly: boolean;
  isTrial: boolean;
  isGrace: boolean;
  daysRemaining: number | null;
  expiryDate: string | null;
  autoRenew?: boolean;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  plan?: Partial<Plan> | null;
  planName?: string | null;
  planPrice?: string | number | null;
  planColor?: string | null;
  planFeatures?: string | null;
};

type AllSub = MySub & {
  syndicateName?: string | null;
};

type Invoice = {
  id: string;
  amount: string | number;
  status: string;
  description?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};

type TabType = "plans" | "syndicats" | "facturation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  trial:     { label: "Essai",         color: "#3b82f6", bg: "#3b82f618" },
  active:    { label: "Actif",         color: "#10b981", bg: "#10b98118" },
  grace:     { label: "Grâce",         color: "#f59e0b", bg: "#f59e0b18" },
  expired:   { label: "Expiré",        color: "#ef4444", bg: "#ef444418" },
  suspended: { label: "Suspendu",      color: "#ef4444", bg: "#ef444418" },
  cancelled: { label: "Annulé",        color: "#6b7280", bg: "#6b728018" },
  no_subscription: { label: "Aucun",   color: "#6b7280", bg: "#6b728018" },
};

const INVOICE_STATUS_CFG: Record<string, { label: string; color: string }> = {
  open:          { label: "En attente", color: "#f59e0b" },
  paid:          { label: "Payée",      color: "#10b981" },
  void:          { label: "Annulée",    color: "#6b7280" },
  uncollectible: { label: "Impayée",    color: "#ef4444" },
};

const PLAN_ICONS: { [key: string]: keyof typeof Feather.glyphMap } = {
  "Essai Gratuit": "gift",
  Starter: "zap",
  Professional: "award",
  Business: "briefcase",
  Enterprise: "globe",
};

function parseFeaturesArr(features?: string | null): string[] {
  if (!features) return [];
  try { const p = JSON.parse(features); return Array.isArray(p) ? p : []; } catch { return []; }
}

function fmt(p?: string | number | null): string {
  if (p == null) return "0";
  return parseFloat(String(p)).toLocaleString("fr-MA");
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("fr-MA", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function limitLabel(v?: number | null, unit = ""): string {
  return v == null ? `Illimité${unit ? " " + unit : ""}` : `${v}${unit ? " " + unit : ""}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AbonnementsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const { showToast } = useToast();

  const isSuper = user?.role === "super_admin";
  const isAdmin = user?.role === "syndicate_admin" || isSuper;

  const [tab, setTab] = useState<TabType>(isSuper ? "syndicats" : "plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mySub, setMySub] = useState<MySub | null>(null);
  const [allSubs, setAllSubs] = useState<AllSub[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [manageModal, setManageModal] = useState<AllSub | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const requests: Promise<any>[] = [
        apiRequest("/subscriptions/plans", "GET", undefined, token),
      ];
      if (!isSuper) {
        requests.push(apiRequest("/subscriptions/my", "GET", undefined, token).catch(() => ({ data: null })));
        requests.push(apiRequest("/subscriptions/invoices", "GET", undefined, token).catch(() => ({ data: [] })));
      } else {
        requests.push(apiRequest("/subscriptions", "GET", undefined, token).catch(() => ({ data: [] })));
        requests.push(Promise.resolve({ data: [] }));
      }
      const [plansRes, subRes, invRes] = await Promise.all(requests);
      setPlans((plansRes.data ?? []).filter((p: Plan) => !p.isTrial));
      if (isSuper) { setAllSubs(subRes.data ?? []); }
      else { setMySub(subRes.data ?? null); setInvoices(invRes.data ?? []); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, isSuper]);

  useEffect(() => { load(); }, [load]);

  const handleSubscribe = async (planId: string) => {
    try {
      setSaving(true);
      const syndicateId = isSuper && manageModal ? manageModal.syndicateId : undefined;
      await apiRequest("/subscriptions", "POST", { planId, billingInterval, ...(syndicateId ? { syndicateId } : {}) }, token);
      showToast({ type: "success", title: "Succès", message: "Abonnement activé avec succès." });
      setManageModal(null);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible d'activer l'abonnement" });
    } finally { setSaving(false); }
  };

  const handleUpdateSub = async (subId: string, updates: Record<string, any>) => {
    try {
      setSaving(true);
      await apiRequest(`/subscriptions/${subId}`, "PUT", updates, token);
      showToast({ type: "success", message: "Abonnement mis à jour." });
      setManageModal(null);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible de mettre à jour" });
    } finally { setSaving(false); }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    try {
      setSaving(true);
      await apiRequest(`/subscriptions/invoices/${invoiceId}/pay`, "PUT", {}, token);
      showToast({ type: "success", message: "Facture marquée comme payée." });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", message: e.message ?? "Erreur" });
    } finally { setSaving(false); }
  };

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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  const TABS: { key: TabType; label: string; icon: keyof typeof Feather.glyphMap }[] = isSuper
    ? [
        { key: "syndicats", label: "Syndicats", icon: "layers" },
        { key: "plans", label: "Plans", icon: "star" },
        { key: "facturation", label: "Facturation", icon: "file-text" },
      ]
    : [
        { key: "plans", label: "Plans", icon: "star" },
        { key: "facturation", label: "Factures", icon: "file-text" },
      ];

  const activeCount = allSubs.filter((s) => ["active", "trial"].includes(s.effectiveStatus)).length;
  const trialCount = allSubs.filter((s) => s.effectiveStatus === "trial").length;
  const expiredCount = allSubs.filter((s) => s.isExpired).length;
  const mrr = allSubs
    .filter((s) => s.effectiveStatus === "active")
    .reduce((sum, s) => sum + Number(s.planPrice ?? 0), 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Abonnements</Text>
          {isSuper && (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {allSubs.length} syndicats · {activeCount} actifs
            </Text>
          )}
        </View>
        <View style={[styles.platformBadge, { backgroundColor: colors.primary + "15" }]}>
          <Feather name="shield" size={11} color={colors.primary} />
          <Text style={[styles.platformBadgeText, { color: colors.primary }]}>
            {isSuper ? "Super Admin" : "Admin"}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, { borderBottomWidth: 2, borderBottomColor: isActive ? colors.primary : "transparent" }]}
              onPress={() => { Haptics.selectionAsync(); setTab(t.key); }}
              activeOpacity={0.7}
            >
              <Feather name={t.icon} size={13} color={isActive ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabLabel, { color: isActive ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
      >
        {/* ── SUPER ADMIN: syndicats tab ─────────────────────────────────── */}
        {isSuper && tab === "syndicats" && (
          <>
            {/* KPI strip */}
            <View style={[styles.kpiStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Total", value: allSubs.length.toString(), icon: "layers" as const, color: colors.primary },
                { label: "Actifs", value: activeCount.toString(), icon: "check-circle" as const, color: "#10b981" },
                { label: "Essais", value: trialCount.toString(), icon: "gift" as const, color: "#3b82f6" },
                { label: "Expirés", value: expiredCount.toString(), icon: "alert-circle" as const, color: "#ef4444" },
                { label: "MRR", value: `${(mrr / 1000).toFixed(0)}k`, icon: "dollar-sign" as const, color: "#f59e0b" },
              ].map((k, i, arr) => (
                <View key={k.label} style={[styles.kpiCell, i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null]}>
                  <View style={[styles.kpiIcon, { backgroundColor: k.color + "18" }]}>
                    <Feather name={k.icon} size={13} color={k.color} />
                  </View>
                  <Text style={[styles.kpiVal, { color: colors.foreground }]}>{k.value}</Text>
                  <Text style={[styles.kpiLab, { color: colors.mutedForeground }]}>{k.label}</Text>
                </View>
              ))}
            </View>

            {/* All subscriptions */}
            {allSubs.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="inbox" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun abonnement</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Les syndicats créés reçoivent automatiquement un essai gratuit.</Text>
              </View>
            ) : allSubs.map((sub) => {
              const st = STATUS_CFG[sub.effectiveStatus] ?? STATUS_CFG.active;
              const planColor = sub.planColor ?? colors.primary;
              return (
                <View key={sub.id} style={[styles.subCard, { backgroundColor: colors.card, borderColor: sub.isExpired ? "#ef444430" : colors.border }]}>
                  <View style={styles.subCardHeader}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.subName, { color: colors.foreground }]} numberOfLines={1}>
                        {sub.syndicateName ?? sub.syndicateId}
                      </Text>
                      <View style={styles.chipRow}>
                        {sub.planName ? (
                          <View style={[styles.chip, { backgroundColor: planColor + "20" }]}>
                            <Text style={[styles.chipText, { color: planColor }]}>{sub.planName}</Text>
                          </View>
                        ) : null}
                        <View style={[styles.chip, { backgroundColor: st.bg }]}>
                          <Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text>
                        </View>
                        {sub.daysRemaining !== null && sub.daysRemaining <= 7 && !sub.isExpired && (
                          <View style={[styles.chip, { backgroundColor: "#f59e0b18" }]}>
                            <Feather name="clock" size={10} color="#f59e0b" />
                            <Text style={[styles.chipText, { color: "#f59e0b" }]}>{sub.daysRemaining}j</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      {sub.planPrice != null && Number(sub.planPrice) > 0 ? (
                        <>
                          <Text style={[styles.subAmt, { color: colors.foreground }]}>{fmt(sub.planPrice)}</Text>
                          <Text style={[styles.subAmtUnit, { color: colors.mutedForeground }]}>MAD/mois</Text>
                        </>
                      ) : (
                        <Text style={[styles.subAmtUnit, { color: colors.mutedForeground }]}>Gratuit</Text>
                      )}
                    </View>
                  </View>
                  {sub.expiryDate && (
                    <View style={styles.subExpiry}>
                      <Feather name="calendar" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.subExpiryText, { color: colors.mutedForeground }]}>
                        {sub.isExpired ? "Expiré le" : "Expire le"}: {fmtDate(sub.expiryDate)}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.subFooter, { borderTopColor: colors.border }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="refresh-cw" size={11} color={sub.autoRenew ? "#10b981" : colors.mutedForeground} />
                      <Text style={[styles.subInfoText, { color: sub.autoRenew ? "#10b981" : colors.mutedForeground }]}>
                        {sub.autoRenew ? "Renouvellement auto" : "Renouvellement manuel"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.manageBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setManageModal(sub); setSelectedPlanId(sub.planId ?? ""); }}
                    >
                      <Feather name="edit-2" size={12} color={colors.primary} />
                      <Text style={[styles.manageBtnText, { color: colors.primary }]}>Gérer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── PLANS tab ─────────────────────────────────────────────────── */}
        {tab === "plans" && (
          <>
            {/* Current plan banner (syndicate_admin) */}
            {!isSuper && mySub && (
              <CurrentPlanCard sub={mySub} colors={colors} />
            )}

            {/* Billing interval toggle */}
            {isAdmin && (
              <View style={[styles.intervalToggle, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.intervalLabel, { color: colors.mutedForeground }]}>Facturation :</Text>
                {(["monthly", "yearly"] as const).map((iv) => (
                  <TouchableOpacity
                    key={iv}
                    style={[styles.intervalBtn, billingInterval === iv && { backgroundColor: colors.primary }]}
                    onPress={() => setBillingInterval(iv)}
                  >
                    <Text style={[styles.intervalBtnText, { color: billingInterval === iv ? "#fff" : colors.mutedForeground }]}>
                      {iv === "monthly" ? "Mensuel" : "Annuel (−15%)"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {plans.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="package" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun plan disponible</Text>
              </View>
            ) : plans.map((plan, idx) => {
              const features = parseFeaturesArr(plan.features);
              const isCurrent = mySub?.planId === plan.id;
              const pc = plan.color ?? ["#2563EB","#3b82f6","#10b981","#f59e0b","#ec4899"][idx % 5];
              const price = billingInterval === "yearly" ? plan.yearlyPrice : plan.price;
              const priceLabel = billingInterval === "yearly" ? "MAD/an" : "MAD/mois";
              const iconName = PLAN_ICONS[plan.name] ?? "star";
              const isEnterprise = plan.name === "Enterprise";

              return (
                <View
                  key={plan.id}
                  style={[styles.planCard, { backgroundColor: colors.card, borderColor: isCurrent ? pc : colors.border, borderWidth: isCurrent ? 2 : 1 }]}
                >
                  {isCurrent && (
                    <View style={[styles.currentBadge, { backgroundColor: "#10b981" }]}>
                      <Feather name="check" size={10} color="#fff" />
                      <Text style={styles.currentBadgeText}>Plan actuel</Text>
                    </View>
                  )}

                  <View style={styles.planCardHeader}>
                    <View style={[styles.planIconCircle, { backgroundColor: pc + "18" }]}>
                      <Feather name={iconName} size={20} color={pc} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
                      {plan.description ? (
                        <Text style={[styles.planDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{plan.description}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      {isEnterprise ? (
                        <Text style={[styles.planPrice, { color: pc }]}>Sur devis</Text>
                      ) : (
                        <>
                          <Text style={[styles.planPrice, { color: pc }]}>{fmt(price)}</Text>
                          <Text style={[styles.planPriceUnit, { color: colors.mutedForeground }]}>{priceLabel}</Text>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Limits chips */}
                  <View style={styles.limitsRow}>
                    {[
                      { icon: "home" as const, val: limitLabel(plan.maxBuildings, "imm.") },
                      { icon: "grid" as const, val: limitLabel(plan.maxLots, "lots") },
                      { icon: "users" as const, val: limitLabel(plan.maxMembers, "mbr") },
                      { icon: "hard-drive" as const, val: plan.maxStorageGb == null ? "∞ Go" : `${plan.maxStorageGb} Go` },
                    ].map((lim) => (
                      <View key={lim.icon} style={[styles.limitChip, { backgroundColor: pc + "12", borderColor: pc + "25" }]}>
                        <Feather name={lim.icon} size={10} color={pc} />
                        <Text style={[styles.limitChipText, { color: pc }]}>{lim.val}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.border }]} />

                  {features.length > 0 && (
                    <View style={{ gap: 7 }}>
                      {features.map((f) => (
                        <View key={f} style={styles.featureRow}>
                          <View style={[styles.featureCheck, { backgroundColor: pc + "18" }]}>
                            <Feather name="check" size={11} color={pc} />
                          </View>
                          <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {isAdmin && !isCurrent && (
                    <TouchableOpacity
                      style={[styles.upgradeBtn, { backgroundColor: isEnterprise ? "transparent" : pc, borderColor: pc, borderWidth: isEnterprise ? 1.5 : 0 }]}
                      onPress={() => {
                        if (isEnterprise) {
                          router.push("/support" as any);
                          return;
                        }
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        Alert.alert(
                          "Changer de plan",
                          `Passer au plan "${plan.name}" (${fmt(price)} ${priceLabel}) ?`,
                          [
                            { text: "Annuler", style: "cancel" },
                            { text: "Confirmer", onPress: () => handleSubscribe(plan.id) },
                          ]
                        );
                      }}
                      disabled={saving}
                    >
                      <Text style={[styles.upgradeBtnText, { color: isEnterprise ? pc : "#fff" }]}>
                        {isEnterprise ? "Contacter l'équipe commerciale" : "Choisir ce plan"}
                      </Text>
                      {!isEnterprise && <Feather name="arrow-right" size={13} color="#fff" />}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* ── FACTURATION tab ───────────────────────────────────────────── */}
        {tab === "facturation" && (
          <>
            {invoices.length === 0 && !isSuper ? (
              <View style={styles.empty}>
                <Feather name="file-text" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune facture</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Vos factures apparaîtront ici après activation d'un plan.</Text>
              </View>
            ) : invoices.map((inv) => {
              const stCfg = INVOICE_STATUS_CFG[inv.status] ?? { label: inv.status, color: "#6b7280" };
              return (
                <View key={inv.id} style={[styles.invoiceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.invoiceRow}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[styles.invoiceDesc, { color: colors.foreground }]} numberOfLines={2}>
                        {inv.description ?? "Abonnement"}
                      </Text>
                      <Text style={[styles.invoiceDate, { color: colors.mutedForeground }]}>
                        {inv.paidAt ? `Payée le ${fmtDate(inv.paidAt)}` : inv.dueDate ? `Échéance: ${fmtDate(inv.dueDate)}` : fmtDate(inv.createdAt)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.invoiceAmt, { color: colors.foreground }]}>{fmt(inv.amount)} MAD</Text>
                      <View style={[styles.chip, { backgroundColor: stCfg.color + "18" }]}>
                        <Text style={[styles.chipText, { color: stCfg.color }]}>{stCfg.label}</Text>
                      </View>
                    </View>
                  </View>
                  {isSuper && inv.status === "open" && (
                    <TouchableOpacity
                      style={[styles.payBtn, { borderColor: "#10b98140", backgroundColor: "#10b98110" }]}
                      onPress={() => handlePayInvoice(inv.id)}
                      disabled={saving}
                    >
                      <Feather name="check-circle" size={13} color="#10b981" />
                      <Text style={[styles.payBtnText, { color: "#10b981" }]}>Marquer comme payée</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {isSuper && (
              <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="info" size={14} color={colors.mutedForeground} />
                <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
                  Les factures sont générées automatiquement lors de l'activation ou du renouvellement d'un abonnement.
                </Text>
              </View>
            )}
          </>
        )}

        {/* Super admin plans tab */}
        {isSuper && tab === "plans" && (
          <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.infoBoxText, { color: colors.mutedForeground }]}>
              {plans.length} plans actifs configurés. Contactez l'équipe technique pour modifier les plans tarifaires.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Manage modal (super_admin) */}
      <Modal visible={!!manageModal} transparent animationType="slide" onRequestClose={() => setManageModal(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Gérer l'abonnement</Text>
            {manageModal && (
              <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>{manageModal.syndicateName ?? manageModal.syndicateId}</Text>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: 12 }]} />

            {/* Plan selector */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Changer de plan</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {plans.map((p) => {
                const pc = p.color ?? colors.primary;
                const sel = selectedPlanId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.planChipBtn, { borderColor: sel ? pc : colors.border, backgroundColor: sel ? pc + "18" : colors.background }]}
                    onPress={() => setSelectedPlanId(p.id)}
                  >
                    <Text style={[styles.planChipBtnText, { color: sel ? pc : colors.foreground }]}>{p.name}</Text>
                    <Text style={[styles.planChipBtnPrice, { color: sel ? pc : colors.mutedForeground }]}>{fmt(p.price)} MAD/mois</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedPlanId && (
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Alert.alert("Confirmer", `Changer vers ce plan ?`, [
                    { text: "Annuler", style: "cancel" },
                    { text: "Confirmer", onPress: () => handleSubscribe(selectedPlanId) },
                  ]);
                }}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.confirmBtnText}>Appliquer le changement</Text>
                )}
              </TouchableOpacity>
            )}

            <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: 12 }]} />

            {/* Status actions */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Actions</Text>
            <View style={{ gap: 8 }}>
              {[
                { label: "Suspendre", status: "suspended", color: "#ef4444", icon: "pause-circle" as const },
                { label: "Réactiver", status: "active", color: "#10b981", icon: "play-circle" as const },
                { label: "Annuler", status: "cancelled", color: "#6b7280", icon: "x-circle" as const },
              ].map((a) => (
                <TouchableOpacity
                  key={a.status}
                  style={[styles.actionBtn, { borderColor: a.color + "40", backgroundColor: a.color + "10" }]}
                  onPress={() => {
                    if (!manageModal) return;
                    Alert.alert(a.label, `${a.label} l'abonnement de ${manageModal.syndicateName} ?`, [
                      { text: "Annuler", style: "cancel" },
                      { text: "Confirmer", style: a.status === "cancelled" ? "destructive" : "default",
                        onPress: () => handleUpdateSub(manageModal.id, { status: a.status }) },
                    ]);
                  }}
                  disabled={saving}
                >
                  <Feather name={a.icon} size={15} color={a.color} />
                  <Text style={[styles.actionBtnText, { color: a.color }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.cancelSheetBtn, { borderColor: colors.border }]}
              onPress={() => setManageModal(null)}
            >
              <Text style={[styles.cancelSheetText, { color: colors.mutedForeground }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Current Plan Card ───────────────────────────────────────────────────────

function CurrentPlanCard({ sub, colors }: { sub: MySub; colors: any }) {
  const st = STATUS_CFG[sub.effectiveStatus] ?? STATUS_CFG.active;
  const pc = sub.planColor ?? sub.plan?.color ?? colors.primary;
  const isExpired = sub.isExpired;
  const daysLeft = sub.daysRemaining;

  return (
    <View style={[styles.currentPlanCard, { backgroundColor: pc + "12", borderColor: pc + "40" }]}>
      <View style={styles.currentPlanHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.currentPlanLabel, { color: pc }]}>Plan actuel</Text>
          <Text style={[styles.currentPlanName, { color: colors.foreground }]}>
            {sub.planName ?? sub.plan?.name ?? "—"}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: st.bg }]}>
          <Text style={[styles.chipText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>

      <View style={styles.currentPlanMeta}>
        {sub.expiryDate && (
          <View style={styles.metaRow}>
            <Feather name="calendar" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {isExpired ? "Expiré le" : "Expire le"}: {fmtDate(sub.expiryDate)}
            </Text>
          </View>
        )}
        {daysLeft !== null && !isExpired && (
          <View style={styles.metaRow}>
            <Feather name="clock" size={12} color={daysLeft <= 3 ? "#ef4444" : daysLeft <= 7 ? "#f59e0b" : colors.mutedForeground} />
            <Text style={[styles.metaText, { color: daysLeft <= 3 ? "#ef4444" : daysLeft <= 7 ? "#f59e0b" : colors.mutedForeground }]}>
              {daysLeft === 0 ? "Expire aujourd'hui" : `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`}
            </Text>
          </View>
        )}
        {isExpired && (
          <View style={[styles.expiredBanner, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}>
            <Feather name="alert-circle" size={13} color="#ef4444" />
            <Text style={[styles.expiredText, { color: "#ef4444" }]}>
              Mode lecture seule activé. Renouvelez pour accéder à toutes les fonctionnalités.
            </Text>
          </View>
        )}
      </View>

      {/* Usage limits */}
      {sub.plan && (
        <View style={styles.limitsRow}>
          {[
            { icon: "home" as const, val: limitLabel(sub.plan.maxBuildings, "imm."), label: "Immeubles" },
            { icon: "grid" as const, val: limitLabel(sub.plan.maxLots, "lots"), label: "Lots" },
            { icon: "users" as const, val: limitLabel(sub.plan.maxMembers, "mbr"), label: "Membres" },
          ].map((lim) => (
            <View key={lim.label} style={[styles.limitChip, { backgroundColor: pc + "12", borderColor: pc + "25" }]}>
              <Feather name={lim.icon} size={10} color={pc} />
              <Text style={[styles.limitChipText, { color: pc }]}>{lim.val}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  platformBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  platformBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12 },
  tabLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // KPI strip
  kpiStrip: { flexDirection: "row", borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  kpiCell: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 3 },
  kpiIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  kpiVal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  kpiLab: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },
  // Sub card
  subCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  subCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  subName: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  chipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  subAmt: { fontSize: 16, fontFamily: "Inter_700Bold" },
  subAmtUnit: { fontSize: 10, fontFamily: "Inter_400Regular" },
  subExpiry: { flexDirection: "row", alignItems: "center", gap: 5 },
  subExpiryText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  subFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1 },
  subInfoText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  manageBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  manageBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Current plan card
  currentPlanCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  currentPlanHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  currentPlanLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  currentPlanName: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2 },
  currentPlanMeta: { gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  expiredBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  expiredText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },
  // Interval toggle
  intervalToggle: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, borderWidth: 1 },
  intervalLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  intervalBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  intervalBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Plan card
  planCard: { borderRadius: 18, padding: 18, gap: 14 },
  currentBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  currentBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  planCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  planIconCircle: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  planDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  planPrice: { fontSize: 22, fontFamily: "Inter_700Bold" },
  planPriceUnit: { fontSize: 11, fontFamily: "Inter_400Regular" },
  limitsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  limitChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  limitChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  featureCheck: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center", marginTop: 1 },
  featureText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  upgradeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 2 },
  upgradeBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  // Invoices
  invoiceCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  invoiceRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  invoiceDesc: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  invoiceDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  invoiceAmt: { fontSize: 16, fontFamily: "Inter_700Bold" },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  payBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  // Info box
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  infoBoxText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  // Empty
  empty: { alignItems: "center", gap: 10, paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 280 },
  // Modal sheet
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 4 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#6b7280", alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  planChipBtn: { padding: 10, borderRadius: 12, borderWidth: 1.5, minWidth: 120 },
  planChipBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  planChipBtnPrice: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  confirmBtn: { paddingVertical: 14, borderRadius: 13, alignItems: "center", marginTop: 4 },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cancelSheetBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  cancelSheetText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
