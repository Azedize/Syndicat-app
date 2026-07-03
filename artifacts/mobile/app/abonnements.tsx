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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData, type SyndicateSubscription } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type TabType = "plans" | "abonnements";

const STATUS_CONFIG = {
  active: { label: "Actif", color: "#10b981", bg: "#10b98118" },
  trial: { label: "Essai", color: "#3b82f6", bg: "#3b82f618" },
  suspended: { label: "Suspendu", color: "#ef4444", bg: "#ef444418" },
  cancelled: { label: "Annulé", color: "#6b7280", bg: "#6b728018" },
};

export default function AbonnementsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { subscriptionPlans, syndicateSubscriptions, updateSubscription } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const role = user?.role ?? "member";
  const isSuper = role === "super_admin";

  const [tab, setTab] = useState<TabType>(isSuper ? "abonnements" : "plans");
  const [selectedSub, setSelectedSub] = useState<SyndicateSubscription | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const mySub = syndicateSubscriptions.find((s) => s.syndicateId === "1");

  const totalRevenue = syndicateSubscriptions
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + s.amount, 0);
  const activeCount = syndicateSubscriptions.filter((s) => s.status === "active").length;

  const handleUpgrade = () => {
    if (!selectedSub || !selectedPlanId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateSubscription(selectedSub.id, selectedPlanId);
    setShowUpgradeModal(false);
    Alert.alert("Succès", "L'abonnement a été mis à jour avec succès.");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Abonnements</Text>
        <View style={{ width: 38 }} />
      </View>

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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
      >
        {isSuper && tab === "abonnements" && (
          <>
            {/* Revenue strip */}
            <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { label: "Revenu annuel", value: `${totalRevenue.toLocaleString()} MAD`, icon: "trending-up" as const, color: "#10b981" },
                { label: "Syndicats actifs", value: `${activeCount}/${syndicateSubscriptions.length}`, icon: "check-circle" as const, color: colors.primary },
                { label: "Taux renouvellement", value: "80%", icon: "refresh-cw" as const, color: "#3b82f6" },
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

            {/* Syndicate subscriptions list */}
            {syndicateSubscriptions.map((sub) => {
              const st = STATUS_CONFIG[sub.status];
              const plan = subscriptionPlans.find((p) => p.id === sub.planId);
              const usagePct = sub.maxMembers === 9999 ? 20 : Math.round((sub.membersUsed / sub.maxMembers) * 100);
              return (
                <View key={sub.id} style={[styles.subCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.subCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subName, { color: colors.foreground }]} numberOfLines={1}>
                        {sub.syndicateName}
                      </Text>
                      <View style={styles.subMeta}>
                        <View style={[styles.planChip, { backgroundColor: (plan?.color ?? "#6b7280") + "20" }]}>
                          <Text style={[styles.planChipText, { color: plan?.color ?? "#6b7280" }]}>{sub.planName}</Text>
                        </View>
                        <View style={[styles.statusChip, { backgroundColor: st.bg }]}>
                          <Text style={[styles.statusChipText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.subAmount, { color: colors.foreground }]}>
                        {sub.amount.toLocaleString()} MAD
                      </Text>
                      <Text style={[styles.subAmountLabel, { color: colors.mutedForeground }]}>/an</Text>
                    </View>
                  </View>

                  <View style={[styles.usageBar, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.usageBarFill,
                        {
                          width: `${Math.min(usagePct, 100)}%` as any,
                          backgroundColor: usagePct > 90 ? "#ef4444" : usagePct > 70 ? "#f59e0b" : colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.usageRow}>
                    <Text style={[styles.usageText, { color: colors.mutedForeground }]}>
                      {sub.membersUsed} membres utilisés
                    </Text>
                    <Text style={[styles.usageText, { color: colors.mutedForeground }]}>
                      {sub.maxMembers === 9999 ? "∞" : sub.maxMembers} max
                    </Text>
                  </View>

                  <View style={[styles.subFooter, { borderTopColor: colors.border }]}>
                    <View style={{ gap: 2 }}>
                      <Text style={[styles.subInfoText, { color: colors.mutedForeground }]}>
                        Renouvellement: {sub.renewalDate}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Feather name="refresh-cw" size={11} color={sub.autoRenew ? "#10b981" : colors.mutedForeground} />
                        <Text style={[styles.subInfoText, { color: sub.autoRenew ? "#10b981" : colors.mutedForeground }]}>
                          Renouvellement {sub.autoRenew ? "auto" : "manuel"}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.manageBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedSub(sub);
                        setSelectedPlanId(sub.planId);
                        setShowUpgradeModal(true);
                      }}
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

        {(tab === "plans" || !isSuper) && (
          <>
            {/* Current plan for syndicate admin */}
            {role === "syndicate_admin" && mySub && (
              <View style={[styles.currentPlanBanner, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.currentPlanLabel, { color: colors.primary }]}>Votre plan actuel</Text>
                  <Text style={[styles.currentPlanName, { color: colors.foreground }]}>{mySub.planName}</Text>
                  <Text style={[styles.currentPlanRenewal, { color: colors.mutedForeground }]}>
                    Renouvellement le {mySub.renewalDate}
                  </Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: STATUS_CONFIG[mySub.status].bg }]}>
                  <Text style={[styles.statusChipText, { color: STATUS_CONFIG[mySub.status].color }]}>
                    {STATUS_CONFIG[mySub.status].label}
                  </Text>
                </View>
              </View>
            )}

            {/* For members */}
            {role === "member" && mySub && (
              <View style={[styles.memberPlanCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.memberPlanIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="star" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.memberPlanTitle, { color: colors.foreground }]}>
                  Plan {mySub.planName}
                </Text>
                <Text style={[styles.memberPlanSubtitle, { color: colors.mutedForeground }]}>
                  Votre syndicat bénéficie du plan {mySub.planName} incluant toutes les fonctionnalités ci-dessous.
                </Text>
              </View>
            )}

            {/* Plans grid */}
            {subscriptionPlans.map((plan) => {
              const isCurrent = mySub?.planId === plan.id;
              return (
                <View
                  key={plan.id}
                  style={[
                    styles.planCard,
                    { backgroundColor: colors.card, borderColor: isCurrent ? plan.color : colors.border },
                    plan.popular && { borderColor: plan.color, borderWidth: 2 },
                  ]}
                >
                  {plan.popular && (
                    <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                      <Text style={styles.popularBadgeText}>⭐ Le plus populaire</Text>
                    </View>
                  )}
                  {isCurrent && !plan.popular && (
                    <View style={[styles.popularBadge, { backgroundColor: "#10b981" }]}>
                      <Text style={styles.popularBadgeText}>✓ Plan actuel</Text>
                    </View>
                  )}

                  <View style={styles.planCardHeader}>
                    <View style={[styles.planIconCircle, { backgroundColor: plan.color + "18" }]}>
                      <Feather
                        name={plan.id === "plan_essentiel" ? "package" : plan.id === "plan_pro" ? "zap" : "award"}
                        size={22}
                        color={plan.color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
                      <Text style={[styles.planMax, { color: colors.mutedForeground }]}>
                        {plan.maxMembers === 9999 ? "Membres illimités" : `Jusqu'à ${plan.maxMembers} membres`}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.planPrice, { color: plan.color }]}>
                        {plan.price.toLocaleString()}
                      </Text>
                      <Text style={[styles.planPriceCurrency, { color: colors.mutedForeground }]}>MAD/an</Text>
                    </View>
                  </View>

                  <View style={[styles.planDivider, { backgroundColor: colors.border }]} />

                  <View style={{ gap: 8 }}>
                    {plan.features.map((f) => (
                      <View key={f} style={styles.featureRow}>
                        <View style={[styles.featureCheck, { backgroundColor: plan.color + "18" }]}>
                          <Feather name="check" size={12} color={plan.color} />
                        </View>
                        <Text style={[styles.featureText, { color: colors.foreground }]}>{f}</Text>
                      </View>
                    ))}
                  </View>

                  {role === "syndicate_admin" && !isCurrent && (
                    <TouchableOpacity
                      style={[styles.upgradeBtn, { backgroundColor: plan.color }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        if (mySub) {
                          setSelectedSub(mySub);
                          setSelectedPlanId(plan.id);
                          setShowUpgradeModal(true);
                        }
                      }}
                    >
                      <Text style={styles.upgradeBtnText}>
                        {(subscriptionPlans.findIndex((p) => p.id === plan.id) >
                          subscriptionPlans.findIndex((p) => p.id === mySub?.planId))
                          ? "Passer à ce plan"
                          : "Rétrograder"}
                      </Text>
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

      {/* Upgrade/manage modal */}
      <Modal visible={showUpgradeModal} transparent animationType="slide" onRequestClose={() => setShowUpgradeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {isSuper ? "Gérer l'abonnement" : "Changer de plan"}
            </Text>
            {selectedSub && (
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                {selectedSub.syndicateName}
              </Text>
            )}

            <View style={{ gap: 10, marginTop: 16 }}>
              {subscriptionPlans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.planOption,
                      { borderColor: isSelected ? plan.color : colors.border, backgroundColor: isSelected ? plan.color + "10" : colors.background },
                    ]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedPlanId(plan.id); }}
                  >
                    <View style={[styles.planOptionDot, { borderColor: plan.color, backgroundColor: isSelected ? plan.color : "transparent" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.planOptionName, { color: colors.foreground }]}>{plan.name}</Text>
                      <Text style={[styles.planOptionPrice, { color: colors.mutedForeground }]}>
                        {plan.price.toLocaleString()} MAD/an • {plan.maxMembers === 9999 ? "Illimité" : `${plan.maxMembers} membres`}
                      </Text>
                    </View>
                    {plan.popular && (
                      <View style={[styles.popularDot, { backgroundColor: plan.color }]}>
                        <Text style={styles.popularDotText}>Populaire</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancel, { borderColor: colors.border }]}
                onPress={() => setShowUpgradeModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: colors.primary }]}
                onPress={handleUpgrade}
              >
                <Text style={styles.modalConfirmText}>Confirmer</Text>
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
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statsRow: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
  statIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  subCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  subCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  subName: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 6 },
  subMeta: { flexDirection: "row", gap: 6 },
  planChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  planChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  subAmount: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subAmountLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  usageBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  usageBarFill: { height: "100%", borderRadius: 3 },
  usageRow: { flexDirection: "row", justifyContent: "space-between" },
  usageText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  subFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 12,
  },
  subInfoText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  manageBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  currentPlanBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  currentPlanLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 2 },
  currentPlanName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  currentPlanRenewal: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  memberPlanCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  memberPlanIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  memberPlanTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  memberPlanSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    overflow: "hidden",
  },
  popularBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  popularBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  planCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  planIconCircle: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  planMax: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  planPrice: { fontSize: 22, fontFamily: "Inter_700Bold" },
  planPriceCurrency: { fontSize: 11, fontFamily: "Inter_400Regular" },
  planDivider: { height: 1 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureCheck: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 4,
  },
  upgradeBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  contactTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  contactSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 8,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -4 },
  planOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
  },
  planOptionDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  planOptionName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  planOptionPrice: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  popularDot: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  popularDotText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalConfirmText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
