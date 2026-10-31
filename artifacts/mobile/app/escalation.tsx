/**
 * Escalation & Debt Recovery Dashboard (Syndic Admin only)
 *
 * Shows all active debt escalations grouped by level with:
 *  - Summary stats strip (count per level)
 *  - Filterable list of escalation records
 *  - Override / Resolve actions with justification modal
 *  - Download / view formal letter PDF
 *  - Manual scan trigger
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBaseUrl, getFileTicket, withFileTicket } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import StatsStrip from "@/components/StatsStrip";
import FilterChips from "@/components/FilterChips";

// ─── Types ───────────────────────────────────────────────────────────────────

type EscalationLevel =
  | "reminder"
  | "warning"
  | "final_warning"
  | "agm_proposal"
  | "legal_action";

interface Escalation {
  id: string;
  syndicateId: string | null;
  memberId: string | null;
  memberName: string | null;
  lotId: string | null;
  residentType: string;
  totalOverdue: string;
  overdueMonths: number;
  escalationLevel: EscalationLevel;
  levelLabel: string;
  status: string;
  letterUrl: string | null;
  overriddenBy: string | null;
  overrideReason: string | null;
  overriddenAt: string | null;
  createdAt: string | null;
  lot: { id: string; number: string; floor: number | null } | null;
  building: { id: string; name: string } | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<
  EscalationLevel,
  { labelKey: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }
> = {
  reminder: {
    labelKey: "escLevelReminder",
    color: "#C98511",
    bg: "#FBF1DD",
    icon: "bell",
  },
  warning: {
    labelKey: "escLevelWarning",
    color: "#C98511",
    bg: "#ffedd5",
    icon: "alert-circle",
  },
  final_warning: {
    labelKey: "escLevelFinalWarning",
    color: "#C8323C",
    bg: "#FBE9EA",
    icon: "alert-triangle",
  },
  agm_proposal: {
    labelKey: "escLevelAgmProposal",
    color: "#1F8A9A",
    bg: "#E4F2F4",
    icon: "users",
  },
  legal_action: {
    labelKey: "escLevelLegalAction",
    color: "#6A6680",
    bg: "#F0ECE4",
    icon: "briefcase",
  },
};

const ALL_LEVELS: EscalationLevel[] = [
  "reminder",
  "warning",
  "final_warning",
  "agm_proposal",
  "legal_action",
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function EscalationScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <EscalationScreenInner />
    </RoleGuard>
  );
}

function EscalationScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState("all");

  // Override modal
  const [overrideTarget, setOverrideTarget] = useState<Escalation | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin =
    user?.role === "super_admin" || user?.role === "syndicate_admin";

  // ── Data loading ───────────────────────────────────────────────────────────

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        const qs = filter !== "all" ? `?level=${filter}` : "";
        const data = await apiRequest<{ data: Escalation[] }>(
          `/escalation${qs}`,
          "GET",
          undefined,
          token,
        );
        setEscalations(data.data ?? []);
      } catch (e: any) {
        if (!silent) showToast({ type: "error", title: t("error"), message: e.message ?? t("escLoadError") });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, filter],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  // ── Manual scan ────────────────────────────────────────────────────────────

  const handleScan = async () => {
    try {
      setScanning(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await apiRequest<{ result: { created: number; skipped: number; errors: number } }>(
        "/escalation/scan",
        "POST",
        {},
        token,
      );
      const r = result.result;
      showToast({ type: "info", title: t("escScanTitle"), message: `${r.created} ${t("escScanCreated")}, ${r.skipped} ${t("escScanSkipped")}${r.errors > 0 ? `, ${r.errors} ${t("escScanErrors")}` : ""}.` });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("escScanError") });
    } finally {
      setScanning(false);
    }
  };

  // ── Override ───────────────────────────────────────────────────────────────

  const submitOverride = async () => {
    if (!overrideTarget) return;
    if (overrideReason.trim().length < 10) {
      showToast({ type: "warning", title: t("escJustifRequired"), message: t("escJustifMinLen") });
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest(
        `/escalation/${overrideTarget.id}/override`,
        "POST",
        { reason: overrideReason.trim() },
        token,
      );
      setOverrideTarget(null);
      setOverrideReason("");
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("escOverrideError") });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Resolve ────────────────────────────────────────────────────────────────

  const handleResolve = (item: Escalation) => {
    Alert.alert(
      t("escResolveTitle"),
      `${t("escResolveConfirm")} ${item.memberName ?? t("escResidentFallback")} ?`,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("escConfirmBtn"),
          style: "default",
          onPress: async () => {
            try {
              await apiRequest(`/escalation/${item.id}/resolve`, "POST", {}, token);
              load(true);
            } catch (e: any) {
              showToast({ type: "error", title: t("error"), message: e.message ?? t("escResolveError") });
            }
          },
        },
      ],
    );
  };

  // ── Open letter ─────────────────────────────────────────────────────────────

  const openLetter = async (item: Escalation) => {
    if (!item.letterUrl) return;
    // Linking.openURL cannot attach Authorization headers: a short-lived
    // download ticket is appended instead, and only for our own API host.
    const rawUrl = item.letterUrl;
    const urlBase = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `${getApiBaseUrl()}${rawUrl.replace(/^\/api(?=\/)/, "")}`;
    const url = urlBase.startsWith(getApiBaseUrl())
      ? withFileTicket(urlBase, await getFileTicket())
      : urlBase;
    Linking.openURL(url).catch(() =>
      showToast({ type: "error", title: t("error"), message: t("escOpenDocError") }),
    );
  };

  // ── Stats ───────────────────────────────────────────────────────────────────

  const statsByLevel = ALL_LEVELS.reduce<Record<string, number>>((acc, lv) => {
    acc[lv] = escalations.filter((e) => e.escalationLevel === lv).length;
    return acc;
  }, {});

  const stats = [
    { label: t("escStatReminders"), value: statsByLevel.reminder, color: colors.warning },
    { label: t("escStatWarning"), value: statsByLevel.warning, color: colors.warning },
    { label: t("escStatFinalWarning"), value: statsByLevel.final_warning, color: colors.danger },
    { label: t("escStatAgm"), value: statsByLevel.agm_proposal, color: "#1F8A9A" },
    { label: t("escStatLegal"), value: statsByLevel.legal_action, color: colors.foreground },
  ];

  const filterChips = [
    { key: "all", label: t("escFilterAll") },
    ...ALL_LEVELS.map((lv) => ({ key: lv, label: t(LEVEL_CONFIG[lv].labelKey) })),
  ];

  const displayed = escalations;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t("escHeaderTitle")}
        subtitle={t("escHeaderSubtitle")}
        onBack={() => router.back()}
        rightContent={
          isAdmin ? (
            <TouchableOpacity
              style={[s.scanBtn, { borderColor: colors.border }]}
              onPress={handleScan}
              disabled={scanning}
            >
              {scanning ? (
                <ActivityIndicator size="small" color="#5A4AD6" />
              ) : (
                <Feather name="refresh-cw" size={16} color="#5A4AD6" />
              )}
              <Text style={s.scanBtnText}>{scanning ? t("escScanning") : t("escLaunchScan")}</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Stats */}
        <StatsStrip stats={stats} />

        {/* Filter chips */}
        <FilterChips
          options={filterChips}
          value={filter}
          onChange={setFilter}
        />

        {/* List */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color="#5A4AD6" />
        ) : displayed.length === 0 ? (
          <View style={s.empty}>
            <Feather name="check-circle" size={48} color={colors.border} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              {t("escEmptyMsg")}
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {displayed.map((item) => (
              <EscalationCard
                key={item.id}
                item={item}
                colors={colors}
                isAdmin={isAdmin}
                onOpenLetter={() => openLetter(item)}
                onOverride={() => {
                  setOverrideTarget(item);
                  setOverrideReason("");
                }}
                onResolve={() => handleResolve(item)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Override Modal */}
      <Modal
        visible={!!overrideTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setOverrideTarget(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>
              {t("escOverrideModalTitle")}
            </Text>
            <Text style={[s.modalSub, { color: colors.mutedForeground }]}>
              {overrideTarget?.memberName} — {overrideTarget?.levelLabel}
            </Text>

            <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>
              {t("escJustifLabel")}
            </Text>
            <TextInput
              style={[
                s.textArea,
                {
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              multiline
              numberOfLines={4}
              placeholder={t("escJustifPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={overrideReason}
              onChangeText={setOverrideReason}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: colors.border }]}
                onPress={() => setOverrideTarget(null)}
              >
                <Text style={{ color: colors.mutedForeground }}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtnPrimary, submitting && s.disabled]}
                onPress={submitOverride}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{t("escConfirmBtn")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Escalation Card ──────────────────────────────────────────────────────────

interface CardProps {
  item: Escalation;
  colors: ReturnType<typeof useColors>;
  isAdmin: boolean;
  onOpenLetter: () => void;
  onOverride: () => void;
  onResolve: () => void;
}

function EscalationCard({ item, colors, isAdmin, onOpenLetter, onOverride, onResolve }: CardProps) {
  const { t } = useLanguage();
  const cfg = LEVEL_CONFIG[item.escalationLevel] ?? LEVEL_CONFIG.reminder;
  const amount = parseFloat(item.totalOverdue ?? "0");

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Level badge + header */}
      <View style={s.cardHeader}>
        <View style={[s.levelBadge, { backgroundColor: cfg.color + "1F" }]}>
          <Feather name={cfg.icon} size={12} color={cfg.color} />
          <Text style={[s.levelBadgeText, { color: cfg.color }]}>{t(cfg.labelKey)}</Text>
        </View>
        {item.status === "overridden" && (
          <View style={[s.statusPill, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[s.statusPillText, { color: "#6A6680" }]}>{t("escStatusOverridden")}</Text>
          </View>
        )}
        {item.status === "meeting_scheduled" && (
          <View style={[s.statusPill, { backgroundColor: colors.infoSoft }]}>
            <Text style={[s.statusPillText, { color: "#5A4AD6" }]}>{t("escStatusMeeting")}</Text>
          </View>
        )}
      </View>

      {/* Resident + Lot */}
      <Text style={[s.residentName, { color: colors.text }]}>
        {item.memberName ?? t("escResidentUnknown")}
      </Text>
      <Text style={[s.lotInfo, { color: colors.mutedForeground }]}>
        {item.building?.name ?? ""}
        {item.lot ? ` — ${t("escLotNumber")} ${item.lot.number}` : ""}
      </Text>

      {/* Financials */}
      <View style={s.financialRow}>
        <View>
          <Text style={[s.amountLabel, { color: colors.mutedForeground }]}>{t("escAmountDue")}</Text>
          <Text style={[s.amountValue, { color: cfg.color }]}>
            {amount.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} MAD
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.amountLabel, { color: colors.mutedForeground }]}>{t("escOverdueSince")}</Text>
          <Text style={[s.amountValue, { color: colors.text }]}>
            {item.overdueMonths} {t("escMonths")}
          </Text>
        </View>
      </View>

      {/* Override reason */}
      {item.overrideReason ? (
        <View style={[s.overrideNote, { backgroundColor: colors.background }]}>
          <Feather name="info" size={12} color={colors.mutedForeground} />
          <Text style={[s.overrideNoteText, { color: colors.mutedForeground }]}>
            {item.overrideReason}
          </Text>
        </View>
      ) : null}

      {/* Actions */}
      {isAdmin && item.status === "open" && (
        <View style={s.actions}>
          {item.letterUrl ? (
            <TouchableOpacity style={[s.actionBtn, { borderColor: "#5A4AD6" }]} onPress={onOpenLetter}>
              <Feather name="file-text" size={13} color="#5A4AD6" />
              <Text style={[s.actionBtnText, { color: "#5A4AD6" }]}>{t("escViewLetter")}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: colors.warning }]}
            onPress={onOverride}
          >
            <Feather name="x-circle" size={13} color={colors.warning} />
            <Text style={[s.actionBtnText, { color: colors.warning }]}>{t("escCancelBtn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: colors.success }]}
            onPress={onResolve}
          >
            <Feather name="check-circle" size={13} color={colors.success} />
            <Text style={[s.actionBtnText, { color: colors.success }]}>{t("escResolvedBtn")}</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.letterUrl && item.status !== "open" && (
        <TouchableOpacity style={s.letterOnlyBtn} onPress={onOpenLetter}>
          <Feather name="download" size={13} color="#5A4AD6" />
          <Text style={[s.actionBtnText, { color: "#5A4AD6" }]}>{t("escDownloadLetter")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 16, gap: 12, marginTop: 8 },
  empty: { alignItems: "center", paddingTop: 64, gap: 12 },
  emptyText: { fontSize: 15, textAlign: "center" },
  // Scan button
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 20,
  },
  scanBtnText: { fontSize: 12, color: "#5A4AD6", fontWeight: "600" },
  // Card
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  levelBadgeText: { fontSize: 11, fontWeight: "700" },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 11, fontWeight: "600" },
  residentName: { fontSize: 15, fontWeight: "700" },
  lotInfo: { fontSize: 12 },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  amountLabel: { fontSize: 11, marginBottom: 2 },
  amountValue: { fontSize: 16, fontWeight: "800" },
  overrideNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderRadius: 8,
    padding: 8,
  },
  overrideNoteText: { fontSize: 11, flex: 1 },
  // Actions
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 20,
  },
  letterOnlyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
  },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalSub: { fontSize: 13 },
  inputLabel: { fontSize: 12, fontWeight: "600" },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 14,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  modalBtnPrimary: {
    flex: 1,
    backgroundColor: "#5A4AD6",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  disabled: { opacity: 0.5 },
});
