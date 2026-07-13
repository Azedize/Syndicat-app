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
import { useAuth } from "@/context/AuthContext";
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
  { label: string; color: string; bg: string; icon: keyof typeof Feather.glyphMap }
> = {
  reminder: {
    label: "Rappel",
    color: "#f59e0b",
    bg: "#fef3c7",
    icon: "bell",
  },
  warning: {
    label: "Mise en demeure",
    color: "#f97316",
    bg: "#ffedd5",
    icon: "alert-circle",
  },
  final_warning: {
    label: "Dernière mise en demeure",
    color: "#ef4444",
    bg: "#fee2e2",
    icon: "alert-triangle",
  },
  agm_proposal: {
    label: "AG Extraordinaire",
    color: "#9333ea",
    bg: "#f3e8ff",
    icon: "users",
  },
  legal_action: {
    label: "Action juridique",
    color: "#1e293b",
    bg: "#f1f5f9",
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
        if (!silent) Alert.alert("Erreur", e.message ?? "Chargement impossible");
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
      Alert.alert(
        "Scan terminé",
        `${r.created} nouvelle(s) escalade(s) créée(s), ${r.skipped} ignorée(s)${r.errors > 0 ? `, ${r.errors} erreur(s)` : ""}.`,
      );
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Scan impossible");
    } finally {
      setScanning(false);
    }
  };

  // ── Override ───────────────────────────────────────────────────────────────

  const submitOverride = async () => {
    if (!overrideTarget) return;
    if (overrideReason.trim().length < 10) {
      Alert.alert("Justification requise", "La justification doit comporter au moins 10 caractères.");
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
      Alert.alert("Erreur", e.message ?? "Opération impossible");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Resolve ────────────────────────────────────────────────────────────────

  const handleResolve = (item: Escalation) => {
    Alert.alert(
      "Marquer comme résolu",
      `Confirmer la résolution de l'escalade pour ${item.memberName ?? "ce résident"} ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          style: "default",
          onPress: async () => {
            try {
              await apiRequest(`/escalation/${item.id}/resolve`, "POST", {}, token);
              load(true);
            } catch (e: any) {
              Alert.alert("Erreur", e.message ?? "Résolution impossible");
            }
          },
        },
      ],
    );
  };

  // ── Open letter ─────────────────────────────────────────────────────────────

  const openLetter = (item: Escalation) => {
    if (!item.letterUrl) return;
    // Build absolute URL — pass JWT as query param because Linking.openURL
    // cannot attach Authorization headers (the endpoint accepts ?token= as fallback)
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const base = domain
      ? `https://${domain}`
      : `http://localhost:${process.env.EXPO_PUBLIC_API_PORT ?? "8080"}`;
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${base}${item.letterUrl}${tokenParam}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Erreur", "Impossible d'ouvrir le document"),
    );
  };

  // ── Stats ───────────────────────────────────────────────────────────────────

  const statsByLevel = ALL_LEVELS.reduce<Record<string, number>>((acc, lv) => {
    acc[lv] = escalations.filter((e) => e.escalationLevel === lv).length;
    return acc;
  }, {});

  const stats = [
    { label: "Rappels", value: statsByLevel.reminder, color: "#f59e0b" },
    { label: "Mise en demeure", value: statsByLevel.warning, color: "#f97316" },
    { label: "Dernière M.D.", value: statsByLevel.final_warning, color: "#ef4444" },
    { label: "AG Extraord.", value: statsByLevel.agm_proposal, color: "#9333ea" },
    { label: "Contentieux", value: statsByLevel.legal_action, color: "#1e293b" },
  ];

  const filterChips = [
    { key: "all", label: "Toutes" },
    ...ALL_LEVELS.map((lv) => ({ key: lv, label: LEVEL_CONFIG[lv].label })),
  ];

  const displayed = escalations;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Recouvrement"
        subtitle="Suivi des escalades de dette"
        onBack={() => router.back()}
        rightContent={
          isAdmin ? (
            <TouchableOpacity
              style={[s.scanBtn, { borderColor: colors.border }]}
              onPress={handleScan}
              disabled={scanning}
            >
              {scanning ? (
                <ActivityIndicator size="small" color="#7c3aed" />
              ) : (
                <Feather name="refresh-cw" size={16} color="#7c3aed" />
              )}
              <Text style={s.scanBtnText}>{scanning ? "Scan…" : "Lancer scan"}</Text>
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
          <ActivityIndicator style={{ marginTop: 48 }} color="#7c3aed" />
        ) : displayed.length === 0 ? (
          <View style={s.empty}>
            <Feather name="check-circle" size={48} color={colors.border} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              Aucune escalade active
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
              Annuler l'escalade
            </Text>
            <Text style={[s.modalSub, { color: colors.mutedForeground }]}>
              {overrideTarget?.memberName} — {overrideTarget?.levelLabel}
            </Text>

            <Text style={[s.inputLabel, { color: colors.mutedForeground }]}>
              Justification (obligatoire) *
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
              placeholder="Expliquez la raison de cette annulation…"
              placeholderTextColor={colors.mutedForeground}
              value={overrideReason}
              onChangeText={setOverrideReason}
            />

            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, { borderColor: colors.border }]}
                onPress={() => setOverrideTarget(null)}
              >
                <Text style={{ color: colors.mutedForeground }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtnPrimary, submitting && s.disabled]}
                onPress={submitOverride}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Confirmer</Text>
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
  const cfg = LEVEL_CONFIG[item.escalationLevel] ?? LEVEL_CONFIG.reminder;
  const amount = parseFloat(item.totalOverdue ?? "0");

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Level badge + header */}
      <View style={s.cardHeader}>
        <View style={[s.levelBadge, { backgroundColor: cfg.bg }]}>
          <Feather name={cfg.icon} size={12} color={cfg.color} />
          <Text style={[s.levelBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        {item.status === "overridden" && (
          <View style={[s.statusPill, { backgroundColor: "#f1f5f9" }]}>
            <Text style={[s.statusPillText, { color: "#64748b" }]}>Annulé</Text>
          </View>
        )}
        {item.status === "meeting_scheduled" && (
          <View style={[s.statusPill, { backgroundColor: "#f3e8ff" }]}>
            <Text style={[s.statusPillText, { color: "#7c3aed" }]}>AG planifiée</Text>
          </View>
        )}
      </View>

      {/* Resident + Lot */}
      <Text style={[s.residentName, { color: colors.text }]}>
        {item.memberName ?? "Résident inconnu"}
      </Text>
      <Text style={[s.lotInfo, { color: colors.mutedForeground }]}>
        {item.building?.name ?? ""}
        {item.lot ? ` — Lot N° ${item.lot.number}` : ""}
      </Text>

      {/* Financials */}
      <View style={s.financialRow}>
        <View>
          <Text style={[s.amountLabel, { color: colors.mutedForeground }]}>Montant impayé</Text>
          <Text style={[s.amountValue, { color: cfg.color }]}>
            {amount.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} MAD
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.amountLabel, { color: colors.mutedForeground }]}>Impayé depuis</Text>
          <Text style={[s.amountValue, { color: colors.text }]}>
            {item.overdueMonths} mois
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
            <TouchableOpacity style={[s.actionBtn, { borderColor: "#7c3aed" }]} onPress={onOpenLetter}>
              <Feather name="file-text" size={13} color="#7c3aed" />
              <Text style={[s.actionBtnText, { color: "#7c3aed" }]}>Voir la lettre</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: "#f97316" }]}
            onPress={onOverride}
          >
            <Feather name="x-circle" size={13} color="#f97316" />
            <Text style={[s.actionBtnText, { color: "#f97316" }]}>Annuler</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: "#10b981" }]}
            onPress={onResolve}
          >
            <Feather name="check-circle" size={13} color="#10b981" />
            <Text style={[s.actionBtnText, { color: "#10b981" }]}>Résolu</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.letterUrl && item.status !== "open" && (
        <TouchableOpacity style={s.letterOnlyBtn} onPress={onOpenLetter}>
          <Feather name="download" size={13} color="#7c3aed" />
          <Text style={[s.actionBtnText, { color: "#7c3aed" }]}>Télécharger la lettre</Text>
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
  scanBtnText: { fontSize: 12, color: "#7c3aed", fontWeight: "600" },
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
    backgroundColor: "#7c3aed",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  disabled: { opacity: 0.5 },
});
