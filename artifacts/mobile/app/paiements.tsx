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
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { shareContent } from "@/hooks/useShare";
import RoleGuard from "@/components/RoleGuard";

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

const STATUS_ICONS: Record<TxStatus, keyof typeof Feather.glyphMap> = {
  paid:    "check-circle",
  pending: "clock",
  overdue: "alert-circle",
};

const STATUS_COLORS: Record<TxStatus, { color: string; bg: string }> = {
  paid:    { color: "#10b981", bg: "#10b98115" },
  pending: { color: "#f59e0b", bg: "#f59e0b15" },
  overdue: { color: "#ef4444", bg: "#ef444415" },
};

const TYPE_ICONS: Record<TxType, keyof typeof Feather.glyphMap> = {
  cotisation: "users",
  depense:    "trending-down",
  salaire:    "briefcase",
  recette:    "trending-up",
};

const TYPE_COLORS: Record<TxType, string> = {
  cotisation: "#2563EB",
  depense:    "#ef4444",
  salaire:    "#f59e0b",
  recette:    "#10b981",
};

function getInitials(label: string): string {
  return label.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "TX";
}

function formatRef(id: string): string {
  return `PAY-${id.slice(0, 8).toUpperCase()}`;
}

// Paiements — personal payment history for members, tenants, and governance roles.
// Super Admin must never see individual syndicate financial data.
export default function PaiementsScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"]}>
      <PaiementsScreenInner />
    </RoleGuard>
  );
}

function PaiementsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { transactions, addTransaction, updateTransactionStatus } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const isAdmin = ["super_admin", "syndicate_admin", "president", "treasurer", "secretary", "committee_member"].includes(user?.role ?? "");

  const [tab, setTab] = useState<TabFilter>("all");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [period, setPeriod] = useState<"7j" | "30j" | "3m" | "12m">("30j");
  const [loading, setLoading] = useState(transactions.length === 0);

  useEffect(() => {
    if (transactions.length > 0) setLoading(false);
  }, [transactions]);

  const filtered = useMemo(() => {
    if (tab === "all") return transactions;
    return transactions.filter((tx) => tx.status === tab);
  }, [tab, transactions]);

  const totalPaid    = transactions.filter((tx) => tx.status === "paid").reduce((s, tx) => s + tx.amount, 0);
  const totalPending = transactions.filter((tx) => tx.status === "pending").reduce((s, tx) => s + tx.amount, 0);
  const totalOverdue = transactions.filter((tx) => tx.status === "overdue").length;
  const countPaid    = transactions.filter((tx) => tx.status === "paid").length;

  const typeBreakdown = (["cotisation", "recette", "depense", "salaire"] as TxType[]).map((ty) => ({
    type: ty,
    count: transactions.filter((tx) => tx.type === ty).length,
    total: transactions.filter((tx) => tx.type === ty).reduce((s, tx) => s + tx.amount, 0),
  })).filter((tx) => tx.count > 0);

  // Translated type labels
  const TYPE_LABELS: Record<TxType, string> = {
    cotisation: t("typeCotisation"),
    depense:    t("typeDepense"),
    salaire:    t("typeSalaire"),
    recette:    t("typeRecette"),
  };

  const TABS: { key: TabFilter; label: string; count: number }[] = [
    { key: "all",     label: t("all"),         count: transactions.length },
    { key: "paid",    label: t("paid"),         count: transactions.filter((tx) => tx.status === "paid").length },
    { key: "pending", label: t("inProgressPayment") ?? t("statusPending"), count: transactions.filter((tx) => tx.status === "pending").length },
    { key: "overdue", label: t("latePayment"),  count: transactions.filter((tx) => tx.status === "overdue").length },
  ];

  // Skeleton loading card
  const SkeletonCard = () => (
    <View style={[styles.payCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.payTop}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.secondary }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={{ height: 18, width: 70, backgroundColor: colors.secondary, borderRadius: 9 }} />
            <View style={{ height: 18, width: 60, backgroundColor: colors.secondary, borderRadius: 9 }} />
          </View>
          <View style={{ height: 13, width: "70%", backgroundColor: colors.secondary, borderRadius: 7 }} />
        </View>
        <View style={{ gap: 6, alignItems: "flex-end" }}>
          <View style={{ height: 18, width: 90, backgroundColor: colors.secondary, borderRadius: 6 }} />
          <View style={{ height: 12, width: 60, backgroundColor: colors.secondary, borderRadius: 6 }} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t("paymentsManagement")}</Text>
            <Text style={styles.headerSub}>{t("paymentsSubtitle")}</Text>
          </View>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const header = "Référence,Type,Libellé,Montant (MAD),Statut,Date";
              const rows = transactions.map((tx) =>
                `${formatRef(tx.id)},${tx.type},${tx.label},${tx.amount},${tx.status},${tx.date}`
              );
              shareContent([header, ...rows].join("\n"), t("paymentsManagement"));
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
              <Text style={styles.kpiLabel}>{t("totalCollected")}</Text>
            </View>
            <Text style={styles.kpiValue}>{totalPaid.toLocaleString()} MAD</Text>
            <Text style={styles.kpiSub}>{countPaid} transactions</Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
            <View style={styles.kpiTop}>
              <Feather name="clock" size={14} color="#fde68a" />
              <Text style={styles.kpiLabel}>{t("inProgressPayment")}</Text>
            </View>
            <Text style={styles.kpiValue}>{totalPending.toLocaleString()} MAD</Text>
            <Text style={styles.kpiSub}>{transactions.filter((tx) => tx.status === "pending").length} {t("inProgressPayment").toLowerCase()}</Text>
          </View>
        </View>

        {totalOverdue > 0 && (
          <View style={styles.alertBanner}>
            <Feather name="alert-triangle" size={14} color="#fbbf24" />
            <Text style={styles.alertText}>{totalOverdue} {t("overdueAlertText")}</Text>
          </View>
        )}
      </View>

      {/* Type breakdown (admin) */}
      {isAdmin && typeBreakdown.length > 0 && (
        <View style={[styles.methodBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.methodContent}>
            {typeBreakdown.map((tb) => {
              const color = TYPE_COLORS[tb.type];
              const icon  = TYPE_ICONS[tb.type];
              const label = TYPE_LABELS[tb.type];
              return (
                <View key={tb.type} style={[styles.methodChip, { backgroundColor: color + "12", borderColor: color + "30" }]}>
                  <Feather name={icon} size={13} color={color} />
                  <View>
                    <Text style={[styles.methodLabel, { color }]}>{label}</Text>
                    <Text style={[styles.methodVal, { color: colors.mutedForeground }]}>{tb.total.toLocaleString()} MAD</Text>
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
        {TABS.map((tb) => (
          <TouchableOpacity
            key={tb.key}
            style={[styles.tabBtn, { backgroundColor: tab === tb.key ? colors.primary : colors.muted }]}
            onPress={() => { setTab(tb.key); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === tb.key ? "#fff" : colors.mutedForeground }]}>{tb.label}</Text>
            {tb.count > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: tab === tb.key ? "rgba(255,255,255,0.25)" : colors.border }]}>
                <Text style={[styles.tabBadgeText, { color: tab === tb.key ? "#fff" : colors.mutedForeground }]}>{tb.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <FlatList
          data={[1, 2, 3, 4]}
          keyExtractor={(k) => String(k)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          renderItem={() => <SkeletonCard />}
        />
      ) : (
        <FlatList
          data={filtered as Transaction[]}
          keyExtractor={(tx) => tx.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="credit-card" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noTransactions")}</Text>
            </View>
          }
          renderItem={({ item: tx }) => {
            const statusColors = STATUS_COLORS[tx.status as TxStatus] ?? STATUS_COLORS.pending;
            const statusIcon   = STATUS_ICONS[tx.status as TxStatus] ?? "clock";
            const statusLabel  = tx.status === "paid" ? t("paid") : tx.status === "overdue" ? t("latePayment") : t("inProgressPayment");
            const typeColor    = TYPE_COLORS[tx.type as TxType] ?? "#6b7280";
            const typeIcon     = TYPE_ICONS[tx.type as TxType] ?? "users";
            const typeLabel    = TYPE_LABELS[tx.type as TxType] ?? tx.type;
            const initials     = getInitials(tx.label);
            const isDebit      = tx.type === "depense" || tx.type === "salaire";
            return (
              <TouchableOpacity
                style={[styles.payCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => { setSelected(tx as Transaction); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.8}
              >
                <View style={styles.payTop}>
                  <View style={[styles.payAvatar, { backgroundColor: statusColors.bg }]}>
                    <Text style={[styles.payAvatarText, { color: statusColors.color }]}>{initials}</Text>
                  </View>

                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.payBadges}>
                      <View style={[styles.typeBadge, { backgroundColor: typeColor + "15" }]}>
                        <Feather name={typeIcon} size={10} color={typeColor} />
                        <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                        <Feather name={statusIcon} size={10} color={statusColors.color} />
                        <Text style={[styles.statusText, { color: statusColors.color }]}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={[styles.payLabel, { color: colors.foreground }]} numberOfLines={2}>{tx.label}</Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[styles.payAmount, { color: isDebit ? "#ef4444" : "#10b981" }]}>
                      {isDebit ? "-" : "+"}{tx.amount.toLocaleString()} MAD
                    </Text>
                    <Text style={[styles.payDate, { color: colors.mutedForeground }]}>{tx.date}</Text>
                  </View>
                </View>

                <View style={styles.payMeta}>
                  <View style={styles.metaItem}>
                    <Feather name="hash" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{formatRef(tx.id)}</Text>
                  </View>
                  {tx.member && (
                    <View style={styles.metaItem}>
                      <Feather name="user" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{tx.member}</Text>
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
          const tx = selected;
          const statusColors = STATUS_COLORS[tx.status as TxStatus] ?? STATUS_COLORS.pending;
          const statusIcon   = STATUS_ICONS[tx.status as TxStatus] ?? "clock";
          const statusLabel  = tx.status === "paid" ? t("paid") : tx.status === "overdue" ? t("latePayment") : t("inProgressPayment");
          const typeLabel    = TYPE_LABELS[tx.type as TxType] ?? tx.type;
          const isDebit      = tx.type === "depense" || tx.type === "salaire";
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: statusColors.color }]}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={styles.modalHeaderCenter}>
                  <Text style={styles.modalAmount}>{isDebit ? "-" : "+"}{tx.amount.toLocaleString()} MAD</Text>
                  <View style={styles.modalStatusRow}>
                    <Feather name={statusIcon} size={14} color="#fff" />
                    <Text style={styles.modalStatusText}>{statusLabel}</Text>
                  </View>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
                {tx.status === "paid" && (
                  <View style={[styles.qrSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.qrBox, { borderColor: colors.border, backgroundColor: "#fff" }]}>
                      <QRCode
                        value={`VERIDIAN:${formatRef(tx.id)}:${tx.amount}:${tx.date}:PAID`}
                        size={112}
                        color="#1a1a1a"
                        backgroundColor="#ffffff"
                      />
                    </View>
                    <View style={styles.qrInfo}>
                      <Text style={[styles.qrRef, { color: colors.foreground }]}>{formatRef(tx.id)}</Text>
                      <Text style={[styles.qrSub, { color: colors.mutedForeground }]}>{t("verifyQr")}</Text>
                    </View>
                  </View>
                )}

                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "tag" as const,      label: t("type"),       value: typeLabel },
                    { icon: "hash" as const,     label: t("reference") ?? "Référence", value: formatRef(tx.id) },
                    { icon: "calendar" as const, label: t("date"),       value: tx.date },
                    ...(tx.member ? [{ icon: "user" as const, label: t("member"), value: tx.member }] : []),
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
                  {tx.status === "paid" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const receiptText =
                          `REÇU DE PAIEMENT\n` +
                          `Référence : ${formatRef(tx.id)}\n` +
                          `Libellé : ${tx.label}\n` +
                          `Montant : ${tx.amount.toLocaleString()} MAD\n` +
                          `Date : ${tx.date}\n` +
                          `Statut : ${t("paid")} ✓`;
                        shareContent(receiptText, `${t("paymentReceiptLabel")} ${formatRef(tx.id)}`);
                      }}
                    >
                      <Feather name="download" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>{t("downloadReceiptLabel")}</Text>
                    </TouchableOpacity>
                  )}
                  {tx.status === "overdue" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
                      onPress={async () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        try {
                          await updateTransactionStatus(tx.id, "overdue");
                          Alert.alert(t("reminderSentTitle"), t("reminderSentMsg"));
                          setSelected(null);
                        } catch {
                          Alert.alert(t("error"), t("errorGeneric"));
                        }
                      }}
                    >
                      <Feather name="send" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>{t("sendReminderLabel")}</Text>
                    </TouchableOpacity>
                  )}
                  {tx.status === "pending" && isAdmin && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#10b981" }]}
                      onPress={async () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        try {
                          await updateTransactionStatus(tx.id, "paid");
                          setSelected(null);
                        } catch {
                          Alert.alert(t("error"), t("errorGeneric"));
                        }
                      }}
                    >
                      <Feather name="check" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>{t("markAsPaidBtn")}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.muted }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const details =
                        `Transaction : ${formatRef(tx.id)}\n` +
                        `Type : ${TYPE_LABELS[tx.type] ?? tx.type}\n` +
                        `Libellé : ${tx.label}\n` +
                        `Montant : ${tx.amount.toLocaleString()} MAD\n` +
                        `Date : ${tx.date}`;
                      shareContent(details, `Transaction ${formatRef(tx.id)}`);
                    }}
                  >
                    <Feather name="share-2" size={16} color={colors.foreground} />
                    <Text style={[styles.actionBtnText, { color: colors.foreground }]}>{t("shareLabel")}</Text>
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
