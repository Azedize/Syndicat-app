import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import QRCode from "react-native-qrcode-svg";
import {
  Alert,
  ActivityIndicator,
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
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { shareContent } from "@/hooks/useShare";

type TxStatus = "paid" | "pending" | "overdue";
type TxType = "cotisation" | "depense" | "salaire" | "recette";

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  label: string;
  date: string;
  status: TxStatus;
  member?: string;
}

type TabFilter = "all" | TxStatus;

const STATUS_CONFIG: Record<TxStatus, { label: string; color: string; icon: keyof typeof Feather.glyphMap; bg: string }> = {
  paid:     { label: "Payé",       color: "#10b981", icon: "check-circle", bg: "#10b98115" },
  pending:  { label: "En attente", color: "#f59e0b", icon: "clock",        bg: "#f59e0b15" },
  overdue:  { label: "En retard",  color: "#ef4444", icon: "alert-circle", bg: "#ef444415" },
};

const TYPE_CONFIG: Record<TxType, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  cotisation: { label: "Cotisation", color: "#7c3aed", icon: "users" },
  depense:    { label: "Dépense",    color: "#ef4444", icon: "trending-down" },
  salaire:    { label: "Salaire",    color: "#f59e0b", icon: "briefcase" },
  recette:    { label: "Recette",    color: "#10b981", icon: "trending-up" },
};

function getInitials(label: string): string {
  return label.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "TX";
}

function formatRef(id: string): string {
  return `PAY-${id.slice(0, 8).toUpperCase()}`;
}

export default function PaiementsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { transactions, addTransaction, updateTransactionStatus } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = user?.role !== "member";

  const [tab, setTab] = useState<TabFilter>("all");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [period, setPeriod] = useState<"7j" | "30j" | "3m" | "12m">("30j");
  const [loading, setLoading] = useState(transactions.length === 0);

  useEffect(() => {
    if (transactions.length > 0) setLoading(false);
  }, [transactions]);

  const filtered = useMemo(() => {
    if (tab === "all") return transactions;
    return transactions.filter((t) => t.status === tab);
  }, [tab, transactions]);

  const totalPaid     = transactions.filter((t) => t.status === "paid").reduce((s, t) => s + t.amount, 0);
  const totalPending  = transactions.filter((t) => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const totalOverdue  = transactions.filter((t) => t.status === "overdue").length;
  const countPaid     = transactions.filter((t) => t.status === "paid").length;

  const typeBreakdown = (["cotisation", "recette", "depense", "salaire"] as TxType[]).map((ty) => ({
    type: ty,
    count: transactions.filter((t) => t.type === ty).length,
    total: transactions.filter((t) => t.type === ty).reduce((s, t) => s + t.amount, 0),
  })).filter((t) => t.count > 0);

  const TABS: { key: TabFilter; label: string; count: number }[] = [
    { key: "all",     label: "Tous",       count: transactions.length },
    { key: "paid",    label: "Payés",      count: transactions.filter((t) => t.status === "paid").length },
    { key: "pending", label: "En attente", count: transactions.filter((t) => t.status === "pending").length },
    { key: "overdue", label: "En retard",  count: transactions.filter((t) => t.status === "overdue").length },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Gestion des Paiements</Text>
            <Text style={styles.headerSub}>Suivi et traçabilité financière</Text>
          </View>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const header = "Référence,Type,Libellé,Montant (MAD),Statut,Date";
              const rows = transactions.map((tx) =>
                `${formatRef(tx.id)},${tx.type},${tx.label},${tx.amount},${tx.status},${tx.date}`
              );
              shareContent([header, ...rows].join("\n"), "Rapport Paiements");
            }}
          >
            <Feather name="download" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Period selector */}
        <View style={styles.periodRow}>
          {(["7j", "30j", "3m", "12m"] as const).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, { backgroundColor: period === p ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)" }]}
              onPress={() => { setPeriod(p); Haptics.selectionAsync(); }}
            >
              <Text style={[styles.periodText, { color: period === p ? "#fff" : "rgba(255,255,255,0.65)" }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI cards */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <View style={styles.kpiTop}>
              <Feather name="trending-up" size={14} color="#6ee7b7" />
              <Text style={styles.kpiLabel}>Total encaissé</Text>
            </View>
            <Text style={styles.kpiValue}>{totalPaid.toLocaleString()} MAD</Text>
            <Text style={styles.kpiSub}>{countPaid} transactions</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <View style={styles.kpiTop}>
              <Feather name="clock" size={14} color="#fde68a" />
              <Text style={styles.kpiLabel}>En attente</Text>
            </View>
            <Text style={styles.kpiValue}>{totalPending.toLocaleString()} MAD</Text>
            <Text style={styles.kpiSub}>{transactions.filter((t) => t.status === "pending").length} en cours</Text>
          </View>
        </View>

        {totalOverdue > 0 && (
          <View style={styles.alertBanner}>
            <Feather name="alert-triangle" size={14} color="#fbbf24" />
            <Text style={styles.alertText}>{totalOverdue} paiement{totalOverdue > 1 ? "s" : ""} en retard — action requise</Text>
          </View>
        )}
      </View>

      {/* Type breakdown (admin) */}
      {isAdmin && typeBreakdown.length > 0 && (
        <View style={[styles.methodBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.methodContent}>
            {typeBreakdown.map((t) => {
              const cfg = TYPE_CONFIG[t.type];
              return (
                <View key={t.type} style={[styles.methodChip, { backgroundColor: cfg.color + "12", borderColor: cfg.color + "30" }]}>
                  <Feather name={cfg.icon} size={13} color={cfg.color} />
                  <View>
                    <Text style={[styles.methodLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    <Text style={[styles.methodVal, { color: colors.mutedForeground }]}>{t.total.toLocaleString()} MAD</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, { backgroundColor: tab === t.key ? colors.primary : colors.muted }]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? "rgba(255,255,255,0.25)" : colors.border }]}>
                <Text style={[styles.tabBadgeText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Chargement des transactions...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered as Transaction[]}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucune transaction trouvée</Text>
            </View>
          }
          renderItem={({ item: t }) => {
            const statusCfg = STATUS_CONFIG[t.status as TxStatus] ?? STATUS_CONFIG.pending;
            const typeCfg   = TYPE_CONFIG[t.type as TxType] ?? TYPE_CONFIG.cotisation;
            const initials  = getInitials(t.label);
            const isDebit   = t.type === "depense" || t.type === "salaire";
            return (
              <TouchableOpacity
                style={[styles.payCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { setSelected(t as Transaction); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <View style={styles.payTop}>
                  <View style={[styles.payAvatar, { backgroundColor: statusCfg.color + "15" }]}>
                    <Text style={[styles.payAvatarText, { color: statusCfg.color }]}>{initials}</Text>
                  </View>

                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.payBadges}>
                      <View style={[styles.typeBadge, { backgroundColor: typeCfg.color + "15" }]}>
                        <Feather name={typeCfg.icon} size={10} color={typeCfg.color} />
                        <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                        <Feather name={statusCfg.icon} size={10} color={statusCfg.color} />
                        <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.payLabel, { color: colors.foreground }]} numberOfLines={2}>{t.label}</Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[styles.payAmount, { color: isDebit ? "#ef4444" : "#10b981" }]}>
                      {isDebit ? "-" : "+"}{t.amount.toLocaleString()} MAD
                    </Text>
                    <Text style={[styles.payDate, { color: colors.mutedForeground }]}>{t.date}</Text>
                  </View>
                </View>

                <View style={styles.payMeta}>
                  <View style={styles.metaItem}>
                    <Feather name="hash" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{formatRef(t.id)}</Text>
                  </View>
                  {t.member && (
                    <View style={styles.metaItem}>
                      <Feather name="user" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{t.member}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (() => {
          const t = selected;
          const statusCfg = STATUS_CONFIG[t.status as TxStatus] ?? STATUS_CONFIG.pending;
          const typeCfg   = TYPE_CONFIG[t.type as TxType] ?? TYPE_CONFIG.cotisation;
          const isDebit   = t.type === "depense" || t.type === "salaire";
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: t.status === "paid" ? "#10b981" : t.status === "overdue" ? "#ef4444" : "#f59e0b" }]}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={styles.modalHeaderCenter}>
                  <Text style={styles.modalAmount}>{isDebit ? "-" : "+"}{t.amount.toLocaleString()} MAD</Text>
                  <View style={styles.modalStatusRow}>
                    <Feather name={statusCfg.icon} size={14} color="#fff" />
                    <Text style={styles.modalStatusText}>{statusCfg.label}</Text>
                  </View>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
                {t.status === "paid" && (
                  <View style={[styles.qrSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.qrBox, { borderColor: colors.border, backgroundColor: "#fff" }]}>
                      <QRCode
                        value={`SYNDYCAT:${formatRef(t.id)}:${t.amount}:${t.date}:PAID`}
                        size={112}
                        color="#1a1a1a"
                        backgroundColor="#ffffff"
                      />
                    </View>
                    <View style={styles.qrInfo}>
                      <Text style={[styles.qrRef, { color: colors.foreground }]}>{formatRef(t.id)}</Text>
                      <Text style={[styles.qrSub, { color: colors.mutedForeground }]}>Scannez pour vérifier</Text>
                    </View>
                  </View>
                )}

                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "tag" as const,      label: "Type",       value: typeCfg.label },
                    { icon: "hash" as const,     label: "Référence",  value: formatRef(t.id) },
                    { icon: "calendar" as const, label: "Date",       value: t.date },
                    ...(t.member ? [{ icon: "user" as const, label: "Membre", value: t.member }] : []),
                  ].map(({ icon, label, value }, i) => (
                    <View key={label}>
                      {i > 0 && <View style={[styles.infoSep, { backgroundColor: colors.border }]} />}
                      <View style={styles.infoRow}>
                        <View style={[styles.infoIcon, { backgroundColor: colors.primary + "15" }]}>
                          <Feather name={icon} size={13} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
                          <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.actionBtns}>
                  {t.status === "paid" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const receiptText =
                          `REÇU DE PAIEMENT\n` +
                          `Référence : ${formatRef(t.id)}\n` +
                          `Libellé : ${t.label}\n` +
                          `Montant : ${t.amount.toLocaleString()} MAD\n` +
                          `Date : ${t.date}\n` +
                          `Statut : Payé ✓`;
                        shareContent(receiptText, `Reçu ${formatRef(t.id)}`);
                      }}
                    >
                      <Feather name="download" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Télécharger le reçu</Text>
                    </TouchableOpacity>
                  )}
                  {t.status === "overdue" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
                      onPress={async () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        try {
                          await updateTransactionStatus(t.id, "overdue");
                          Alert.alert("Relance envoyée", "La relance de paiement a été enregistrée.");
                          setSelected(null);
                        } catch {
                          Alert.alert("Erreur", "Impossible d'envoyer la relance. Réessayez.");
                        }
                      }}
                    >
                      <Feather name="send" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Envoyer une relance</Text>
                    </TouchableOpacity>
                  )}
                  {t.status === "pending" && isAdmin && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#10b981" }]}
                      onPress={async () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        try {
                          await updateTransactionStatus(t.id, "paid");
                          setSelected(null);
                        } catch {
                          Alert.alert("Erreur", "Impossible de mettre à jour. Réessayez.");
                        }
                      }}
                    >
                      <Feather name="check" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Marquer comme payé</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const details =
                        `Transaction : ${formatRef(t.id)}\n` +
                        `Type : ${TYPE_CONFIG[t.type]?.label ?? t.type}\n` +
                        `Libellé : ${t.label}\n` +
                        `Montant : ${t.amount.toLocaleString()} MAD\n` +
                        `Date : ${t.date}\n` +
                        `Statut : ${STATUS_CONFIG[t.status]?.label ?? t.status}`;
                      shareContent(details, `Transaction ${formatRef(t.id)}`);
                    }}
                  >
                    <Feather name="share-2" size={16} color={colors.foreground} />
                    <Text style={[styles.actionBtnText, { color: colors.foreground }]}>Partager</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          );
        })()}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  exportBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  periodBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  periodText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  kpiCard: { flex: 1, borderRadius: 16, padding: 14, gap: 4 },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  kpiLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.8)" },
  kpiValue: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  kpiSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)" },
  alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(251,191,36,0.2)", padding: 10, borderRadius: 12 },
  alertText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fbbf24", flex: 1 },
  methodBar: { borderBottomWidth: 1 },
  methodContent: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  methodChip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  methodLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  methodVal: { fontSize: 10, fontFamily: "Inter_400Regular" },
  tabBar: { flexShrink: 0, borderBottomWidth: 1 },
  tabContent: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  payCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  payTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  payAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  payAvatarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  payBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  payLabel: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  payAmount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  payDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  payMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", justifyContent: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { padding: 20, paddingTop: 50, flexDirection: "row", alignItems: "flex-start", gap: 14 },
  modalHeaderCenter: { flex: 1, alignItems: "center", gap: 8 },
  modalAmount: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  modalStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  modalStatusText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  qrSection: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 12 },
  qrBox: { width: 140, height: 140, borderWidth: 2, borderRadius: 12, padding: 8, alignItems: "center", justifyContent: "center" },
  qrGrid: { flexDirection: "row", flexWrap: "wrap", width: 112, height: 112 },
  qrCell: { width: 16, height: 16 },
  qrInfo: { alignItems: "center", gap: 4 },
  qrRef: { fontSize: 13, fontFamily: "Inter_700Bold" },
  qrSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  infoSep: { height: 1, marginHorizontal: 14 },
  actionBtns: { gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
