import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
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
import { useData, type Order } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

type Tab = "purchases" | "sales";

const STATUS_STEPS: Order["status"][] = ["pending", "confirmed", "shipped", "delivered"];

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export default function OrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orders, payOrder } = useData();
  const [tab, setTab] = useState<Tab>("purchases");
  const [selected, setSelected] = useState<Order | null>(null);
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const purchases = orders.filter((o) => o.type === "purchase");
  const sales = orders.filter((o) => o.type === "sale");
  const data = tab === "purchases" ? purchases : sales;

  const totalSpent = purchases.filter((o) => o.status === "delivered").reduce((s, o) => s + o.amount, 0);
  const totalEarned = sales.filter((o) => o.status === "delivered").reduce((s, o) => s + o.amount, 0);

  const statusConfig = (status: Order["status"]) => ({
    pending: { color: "#f59e0b", label: STATUS_LABELS.pending, icon: "clock" as const },
    confirmed: { color: "#3b82f6", label: STATUS_LABELS.confirmed, icon: "check" as const },
    shipped: { color: colors.primary, label: STATUS_LABELS.shipped, icon: "truck" as const },
    delivered: { color: colors.success, label: STATUS_LABELS.delivered, icon: "check-circle" as const },
    cancelled: { color: colors.destructive, label: STATUS_LABELS.cancelled, icon: "x-circle" as const },
  }[status]);

  const stepIndex = (status: Order["status"]) => STATUS_STEPS.indexOf(status);

  const handleConfirm = (order: Order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Confirmer la commande",
      `Confirmer la commande de ${order.buyer} pour "${order.product}" — ${order.amount} MAD?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: () => {
            payOrder(order.id);
            setSelected(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Commande confirmée", "L'acheteur a été notifié de la confirmation.");
          },
        },
      ]
    );
  };

  const handleLeaveReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Avis laissé", "Merci pour votre évaluation! Votre avis aide la communauté.");
  };

  const STATS = [
    { label: "Achats", value: purchases.length, color: colors.primary },
    { label: "Ventes", value: sales.length, color: colors.success },
    { label: "Dépensé", value: totalSpent > 999 ? `${Math.round(totalSpent / 1000)}k` : `${totalSpent}`, color: colors.destructive },
    { label: "Gagné", value: totalEarned > 999 ? `${Math.round(totalEarned / 1000)}k` : `${totalEarned}`, color: colors.success },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Mes Commandes</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {orders.length} commande{orders.length !== 1 ? "s" : ""} au total
          </Text>
        </View>
      </View>

      {/* Stats strip */}
      <View style={[styles.statsBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {STATS.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 ? <View style={[styles.statDiv, { backgroundColor: colors.border }]} /> : null}
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {([
          { key: "purchases", label: "Mes achats", icon: "shopping-bag" as const, count: purchases.length },
          { key: "sales", label: "Mes ventes", icon: "tag" as const, count: sales.length },
        ] as { key: Tab; label: string; icon: keyof typeof Feather.glyphMap; count: number }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key ? { borderBottomColor: colors.primary, borderBottomWidth: 2 } : null]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Feather name={t.icon} size={14} color={tab === t.key ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: tab === t.key ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
            <View style={[styles.tabCount, { backgroundColor: tab === t.key ? colors.primary : colors.muted }]}>
              <Text style={[styles.tabCountText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>
                {t.count}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={data}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "12" }]}>
              <Feather name="shopping-bag" size={36} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Aucune {tab === "purchases" ? "commande" : "vente"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              {tab === "purchases"
                ? "Vous n'avez pas encore passé de commandes sur le marketplace."
                : "Vous n'avez pas encore reçu de commandes pour vos produits."}
            </Text>
          </View>
        }
        renderItem={({ item: order }) => {
          const sc = statusConfig(order.status);
          const si = stepIndex(order.status);
          return (
            <TouchableOpacity
              style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelected(order); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <View style={styles.orderTop}>
                <View style={[styles.orderIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="package" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.orderProduct, { color: colors.foreground }]} numberOfLines={1}>
                    {order.product}
                  </Text>
                  <Text style={[styles.orderParty, { color: colors.mutedForeground }]}>
                    {tab === "purchases" ? `Vendeur: ${order.seller}` : `Acheteur: ${order.buyer}`}
                  </Text>
                  <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>{order.date}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={[styles.orderAmount, { color: colors.foreground }]}>{order.amount} MAD</Text>
                  <View style={[styles.statusBadge, { backgroundColor: sc.color + "15" }]}>
                    <Feather name={sc.icon} size={11} color={sc.color} />
                    <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                </View>
              </View>

              {/* Progress tracker */}
              {order.status !== "cancelled" ? (
                <View style={styles.progress}>
                  {STATUS_STEPS.map((step, i) => {
                    const stepConf = statusConfig(step);
                    const done = i <= si;
                    return (
                      <React.Fragment key={step}>
                        <View style={styles.step}>
                          <View
                            style={[
                              styles.stepDot,
                              { backgroundColor: done ? stepConf.color : colors.muted, borderColor: done ? stepConf.color : colors.border },
                            ]}
                          >
                            {done ? <Feather name="check" size={9} color="#fff" /> : null}
                          </View>
                          <Text style={[styles.stepLabel, { color: done ? colors.foreground : colors.mutedForeground }]}>
                            {stepConf.label}
                          </Text>
                        </View>
                        {i < STATUS_STEPS.length - 1 ? (
                          <View style={[styles.stepLine, { backgroundColor: i < si ? colors.primary : colors.muted }]} />
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.cancelledBadge, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "25" }]}>
                  <Feather name="x-circle" size={13} color={colors.destructive} />
                  <Text style={[styles.cancelledText, { color: colors.destructive }]}>Cette commande a été annulée</Text>
                </View>
              )}

              {/* Quick actions */}
              <View style={styles.orderActions}>
                {tab === "purchases" && order.status === "delivered" ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b30", borderWidth: 1 }]}
                    onPress={(e) => { e.stopPropagation?.(); handleLeaveReview(); }}
                  >
                    <Feather name="star" size={13} color="#f59e0b" />
                    <Text style={[styles.actionText, { color: "#f59e0b" }]}>Laisser un avis</Text>
                  </TouchableOpacity>
                ) : null}
                {tab === "sales" && order.status === "pending" ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={(e) => { e.stopPropagation?.(); handleConfirm(order); }}
                  >
                    <Feather name="check" size={13} color="#fff" />
                    <Text style={[styles.actionText, { color: "#fff" }]}>Confirmer</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.actionBtn, { borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => { setSelected(order); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Feather name="eye" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Détails</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Order detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Détails commande</Text>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
              {/* Order hero */}
              <View style={[styles.orderHero, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "20" }]}>
                <View style={[styles.orderHeroIcon, { backgroundColor: colors.primary + "20" }]}>
                  <Feather name="package" size={40} color={colors.primary} />
                </View>
                <Text style={[styles.orderHeroProduct, { color: colors.foreground }]}>{selected.product}</Text>
                <Text style={[styles.orderHeroAmount, { color: colors.primary }]}>{selected.amount} MAD</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusConfig(selected.status).color + "15" }]}>
                  <Feather name={statusConfig(selected.status).icon} size={12} color={statusConfig(selected.status).color} />
                  <Text style={[styles.statusText, { color: statusConfig(selected.status).color }]}>
                    {statusConfig(selected.status).label}
                  </Text>
                </View>
              </View>

              {/* Progress tracker */}
              {selected.status !== "cancelled" ? (
                <View style={[styles.trackerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.trackerTitle, { color: colors.foreground }]}>Suivi de livraison</Text>
                  <View style={styles.progress}>
                    {STATUS_STEPS.map((step, i) => {
                      const stepConf = statusConfig(step);
                      const si = stepIndex(selected.status);
                      const done = i <= si;
                      return (
                        <React.Fragment key={step}>
                          <View style={styles.step}>
                            <View style={[styles.stepDot, {
                              backgroundColor: done ? stepConf.color : colors.muted,
                              borderColor: done ? stepConf.color : colors.border,
                            }]}>
                              {done ? <Feather name="check" size={9} color="#fff" /> : null}
                            </View>
                            <Text style={[styles.stepLabel, { color: done ? colors.foreground : colors.mutedForeground }]}>
                              {stepConf.label}
                            </Text>
                          </View>
                          {i < STATUS_STEPS.length - 1 ? (
                            <View style={[styles.stepLine, { backgroundColor: i < si ? colors.primary : colors.muted }]} />
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Details card */}
              <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Vendeur", value: selected.seller },
                  { label: "Acheteur", value: selected.buyer },
                  { label: "Date de commande", value: selected.date },
                  { label: "Type", value: selected.type === "purchase" ? "Achat" : "Vente" },
                  { label: "Montant", value: `${selected.amount} MAD` },
                ].map((item, i) => (
                  <View key={item.label}>
                    {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                      <Text style={[styles.detailValue, { color: colors.foreground }]}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Actions */}
              {tab === "purchases" && selected.status === "delivered" ? (
                <TouchableOpacity
                  style={[styles.modalAction, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b30", borderWidth: 1 }]}
                  onPress={handleLeaveReview}
                >
                  <Feather name="star" size={16} color="#f59e0b" />
                  <Text style={[styles.modalActionText, { color: "#f59e0b" }]}>Laisser un avis</Text>
                </TouchableOpacity>
              ) : null}

              {tab === "sales" && selected.status === "pending" ? (
                <TouchableOpacity
                  style={[styles.modalAction, { backgroundColor: colors.primary }]}
                  onPress={() => handleConfirm(selected)}
                >
                  <Feather name="check-circle" size={16} color="#fff" />
                  <Text style={[styles.modalActionText, { color: "#fff" }]}>Confirmer la commande</Text>
                </TouchableOpacity>
              ) : null}

              {selected.status === "delivered" ? (
                <TouchableOpacity
                  style={[styles.modalAction, { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Alert.alert("Reçu téléchargé", "Le reçu de la commande a été sauvegardé dans vos fichiers.");
                  }}
                >
                  <Feather name="download" size={16} color={colors.primary} />
                  <Text style={[styles.modalActionText, { color: colors.primary }]}>Télécharger le reçu</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statsBar: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 1 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statVal: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  statDiv: { width: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 6 },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabCount: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  tabCountText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", gap: 14, paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  orderCard: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 14 },
  orderTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  orderIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  orderProduct: { fontSize: 14, fontFamily: "Inter_700Bold" },
  orderParty: { fontSize: 11, fontFamily: "Inter_400Regular" },
  orderDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  orderAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  progress: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  step: { alignItems: "center", gap: 5, flex: 1 },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  stepLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  stepLine: { height: 2, flex: 1, alignSelf: "center", marginTop: -16, marginHorizontal: -4 },
  cancelledBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  cancelledText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  orderActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  actionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  orderHero: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 8 },
  orderHeroIcon: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  orderHeroProduct: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  orderHeroAmount: { fontSize: 26, fontFamily: "Inter_700Bold" },
  trackerCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  trackerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  detailCard: { borderRadius: 16, borderWidth: 1, padding: 4 },
  sep: { height: 1, marginHorizontal: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", padding: 12 },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modalAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 14 },
  modalActionText: { fontSize: 14, fontFamily: "Inter_700Bold" },
});
