import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { content } from "@/services/api";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";

interface ApiCotisation {
  id: string;
  memberId: string;
  syndicateId: string;
  label: string;
  amount: number;
  dueDate: string;
  paidDate?: string | null;
  status: "paid" | "pending" | "overdue" | "pending_validation";
  receipt?: string | null;
  period: string;
  createdAt: string;
}

// Cotisations are co-owner (copropriétaire) membership fees.
// Governance roles (president, treasurer, secretary, committee_member) are also
// co-owners — they must keep access to their personal cotisations space.
// Tenants are not co-owners; admins manage cotisations via the charges/finance module.
export default function CotisationsScreen() {
  return (
    <RoleGuard allow={["member", "president", "treasurer", "secretary", "committee_member"]}>
      <CotisationsScreenInner />
    </RoleGuard>
  );
}

function CotisationsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const queryClient = useQueryClient();

  const { showToast } = useToast();
  const [payModal, setPayModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cotisations"],
    queryFn: () => content.cotisations() as Promise<{ data: ApiCotisation[] }>,
    staleTime: 30_000,
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => content.payCotisation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cotisations"] });
      setPayModal(false);
      setPayMethod(null);
      setSelectedId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: "Paiement enregistré ✓", message: "Votre cotisation a été soumise pour validation. Un reçu vous sera envoyé par email après approbation." });
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ type: "error", title: "Erreur de paiement", message: err.message });
    },
  });

  const cotisations = data?.data ?? [];
  const paid = cotisations.filter((c) => c.status === "paid");
  const pending = cotisations.filter((c) => c.status === "pending" || c.status === "pending_validation");
  const overdue = cotisations.filter((c) => c.status === "overdue");
  const totalPaid = paid.reduce((s, c) => s + c.amount, 0);

  const statusConfig = (status: string) => {
    if (status === "paid") return { color: colors.success, label: "Payée", icon: "check-circle" as const };
    if (status === "pending_validation") return { color: "#8b5cf6", label: "En validation", icon: "clock" as const };
    if (status === "pending") return { color: "#f59e0b", label: "En attente", icon: "clock" as const };
    return { color: colors.destructive, label: "En retard", icon: "alert-circle" as const };
  };

  const handlePay = (id: string) => {
    setSelectedId(id);
    setPayModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmPay = () => {
    if (!selectedId || payMethod === null) return;
    payMutation.mutate(selectedId);
  };

  const sorted = [...cotisations].sort((a, b) => {
    const order: Record<string, number> = { overdue: 0, pending: 1, pending_validation: 2, paid: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mes Cotisations</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Chargement...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mes Cotisations</Text>
        </View>
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.destructive} />
          <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Impossible de charger vos cotisations</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mes Cotisations</Text>
          <Text style={styles.headerSub}>Historique et paiements</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={[styles.summary, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.sumValue, { color: colors.success }]}>{paid.length}</Text>
          <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>Payées</Text>
        </View>
        <View style={[styles.sumDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.sumValue, { color: "#f59e0b" }]}>{pending.length}</Text>
          <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>En attente</Text>
        </View>
        <View style={[styles.sumDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.sumValue, { color: colors.destructive }]}>{overdue.length}</Text>
          <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>En retard</Text>
        </View>
        <View style={[styles.sumDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.sumValue, { color: colors.primary }]}>{totalPaid} MAD</Text>
          <Text style={[styles.sumLabel, { color: colors.mutedForeground }]}>Total payé</Text>
        </View>
      </View>

      {/* Alert banner */}
      {(overdue.length > 0 || pending.length > 0) ? (
        <View style={[styles.alertBanner, {
          backgroundColor: overdue.length > 0 ? colors.destructive + "12" : "#f59e0b12",
          borderColor: overdue.length > 0 ? colors.destructive + "40" : "#f59e0b40",
        }]}>
          <Feather name={overdue.length > 0 ? "alert-circle" : "clock"} size={16} color={overdue.length > 0 ? colors.destructive : "#f59e0b"} />
          <Text style={[styles.alertText, { color: overdue.length > 0 ? colors.destructive : "#f59e0b" }]}>
            {overdue.length > 0
              ? `${overdue.length} cotisation(s) en retard — payez dès maintenant`
              : `${pending.length} cotisation(s) à régler ce mois`}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name="credit-card" size={40} color={colors.mutedForeground} />
            <Text style={[styles.centerText, { color: colors.mutedForeground }]}>Aucune cotisation trouvée</Text>
          </View>
        }
        renderItem={({ item: c }) => {
          const sc = statusConfig(c.status);
          return (
            <View style={[styles.cotCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: sc.color }]}>
              <View style={styles.cotRow}>
                <View style={[styles.cotIcon, { backgroundColor: sc.color + "15" }]}>
                  <Feather name={sc.icon} size={18} color={sc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cotLabel, { color: colors.foreground }]}>{c.label}</Text>
                  <Text style={[styles.cotPeriod, { color: colors.mutedForeground }]}>Période: {c.period}</Text>
                  {c.paidDate ? (
                    <Text style={[styles.cotDate, { color: colors.mutedForeground }]}>Payé le: {c.paidDate}</Text>
                  ) : (
                    <Text style={[styles.cotDate, { color: sc.color }]}>Échéance: {c.dueDate}</Text>
                  )}
                </View>
                <View style={styles.cotRight}>
                  <Text style={[styles.cotAmount, { color: colors.foreground }]}>{c.amount} MAD</Text>
                  <View style={[styles.statusTag, { backgroundColor: sc.color + "15" }]}>
                    <Text style={[styles.statusTagText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                </View>
              </View>

              {c.status !== "paid" && c.status !== "pending_validation" ? (
                <TouchableOpacity
                  style={[styles.payBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handlePay(c.id)}
                  activeOpacity={0.8}
                >
                  <Feather name="credit-card" size={15} color="#fff" />
                  <Text style={styles.payBtnText}>Payer maintenant — {c.amount} MAD</Text>
                </TouchableOpacity>
              ) : c.status === "pending_validation" ? (
                <View style={[styles.pendingTag, { backgroundColor: "#8b5cf615", borderColor: "#8b5cf640" }]}>
                  <Feather name="clock" size={14} color="#8b5cf6" />
                  <Text style={[styles.pendingTagText, { color: "#8b5cf6" }]}>Preuve soumise — en attente de validation par l'administrateur</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.receiptBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    showToast({ type: "info", title: "Reçu", message: `Le reçu ${c.receipt ?? c.label} est disponible dans votre espace Documents.` });
                  }}
                >
                  <Feather name="download" size={14} color={colors.primary} />
                  <Text style={[styles.receiptBtnText, { color: colors.primary }]}>
                    Télécharger le reçu {c.receipt ?? ""}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Payment modal */}
      <Modal visible={payModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.payModal, { backgroundColor: colors.card }]}>
            <Text style={[styles.payModalTitle, { color: colors.foreground }]}>Paiement sécurisé</Text>
            <Text style={[styles.payModalSub, { color: colors.mutedForeground }]}>
              Montant à payer:{" "}
              <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
                {cotisations.find((c) => c.id === selectedId)?.amount ?? 150} MAD
              </Text>
            </Text>

            <View style={styles.payMethods}>
              {[
                { icon: "credit-card" as const, label: "Carte bancaire", sub: "Visa / Mastercard" },
                { icon: "smartphone" as const, label: "Paiement mobile", sub: "M-Wallet / CMI" },
                { icon: "dollar-sign" as const, label: "Virement bancaire", sub: "RIB du syndicat" },
              ].map((method, idx) => {
                const active = payMethod === idx;
                return (
                  <TouchableOpacity
                    key={method.label}
                    style={[styles.payMethod, {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary + "08" : colors.background,
                    }]}
                    activeOpacity={0.7}
                    onPress={() => { setPayMethod(idx); Haptics.selectionAsync(); }}
                  >
                    <View style={[styles.methodIcon, { backgroundColor: active ? colors.primary + "20" : colors.primary + "10" }]}>
                      <Feather name={method.icon} size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.methodLabel, { color: colors.foreground }]}>{method.label}</Text>
                      <Text style={[styles.methodSub, { color: colors.mutedForeground }]}>{method.sub}</Text>
                    </View>
                    {active
                      ? <Feather name="check-circle" size={18} color={colors.primary} />
                      : <View style={[styles.radioEmpty, { borderColor: colors.border }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.payModalBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => { setPayModal(false); setPayMethod(null); }}
              >
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: payMethod !== null ? colors.primary : colors.muted }]}
                onPress={confirmPay}
                disabled={payMethod === null || payMutation.isPending}
              >
                {payMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="lock" size={14} color={payMethod !== null ? "#fff" : colors.mutedForeground} />}
                <Text style={[styles.confirmBtnText, { color: payMethod !== null ? "#fff" : colors.mutedForeground }]}>
                  {payMutation.isPending ? "Traitement..." : "Confirmer le paiement"}
                </Text>
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
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  centerText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  summary: {
    flexDirection: "row",
    paddingVertical: 16,
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 3 },
  sumValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sumLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  sumDivider: { width: 1 },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  cotCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    gap: 12,
  },
  cotRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cotIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cotLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cotPeriod: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  cotDate: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 1 },
  cotRight: { alignItems: "flex-end", gap: 6 },
  cotAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  payBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  pendingTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pendingTagText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  receiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  receiptBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  payModal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 20 },
  payModalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  payModalSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -8 },
  payMethods: { gap: 10 },
  payMethod: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  methodIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  methodLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  methodSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  payModalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  cancelBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  confirmBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  radioEmpty: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
