/**
 * Travaux Privatifs — Resident Structural/Exterior Modification Requests
 *
 * Resident view  : submit a request, track its approval status with a step trail.
 * Admin view     : review all pending requests, perform syndic/committee/vote/decision steps.
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
import { useLanguage, type LangCode } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/DataState";

const ACCENT = "#f97316";

// ─── Config maps ─────────────────────────────────────────────────────────────

const WORK_TYPES: Record<string, { key: string; icon: keyof typeof Feather.glyphMap }> = {
  ac_unit:    { key: "acUnit", icon: "wind" },
  balcony:    { key: "balcony", icon: "square" },
  windows:     { key: "windows", icon: "crop" },
  facade:     { key: "facade", icon: "home" },
  structural: { key: "structural", icon: "layers" },
  plumbing:   { key: "plumbing", icon: "droplet" },
  electrical: { key: "electrical", icon: "zap" },
  other:      { key: "other", icon: "more-horizontal" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; step: number }> = {
  submitted:       { label: "privateWorksSubmitted", color: "#6b7280", bg: "#6b728015", step: 0 },
  under_review:    { label: "privateWorksUnderReview", color: "#3b82f6", bg: "#3b82f615", step: 1 },
  committee_review:{ label: "privateWorksCommittee", color: "#8b5cf6", bg: "#8b5cf615", step: 2 },
  vote_required:   { label: "privateWorksVoteRequired", color: "#f59e0b", bg: "#f59e0b15", step: 3 },
  approved:        { label: "privateWorksApproved", color: "#10b981", bg: "#10b98115", step: 4 },
  rejected:        { label: "privateWorksRejected", color: "#ef4444", bg: "#ef444415", step: 4 },
  withdrawn:       { label: "privateWorksWithdrawn", color: "#9ca3af", bg: "#9ca3af15", step: -1 },
};

const STEPS = [
  { key: "submitted", label: "privateWorksSubmission" },
  { key: "under_review", label: "privateWorksSyndicReview" },
  { key: "committee_review", label: "privateWorksCommittee" },
  { key: "vote_required", label: "privateWorksVote" },
  { key: "decision", label: "privateWorksDecision" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Building = { id: string; name: string; address?: string | null };

type TravauxPrivatif = {
  id: string;
  buildingId: string;
  lotId?: string | null;
  requestedById?: string | null;
  requestedByName: string;
  title: string;
  description: string;
  workType: string;
  currentPhotoUrls?: string;
  proposedPhotoUrls?: string;
  planUrls?: string;
  status: string;
  requiresCommitteeReview?: boolean | null;
  requiresGAVote?: boolean | null;
  bylawReference?: string | null;
  syndicReviewNote?: string | null;
  syndicReviewedByName?: string | null;
  syndicReviewedAt?: string | null;
  committeeNote?: string | null;
  committeeRecommendation?: string | null;
  committeeReviewedByName?: string | null;
  committeeReviewedAt?: string | null;
  voteOutcome?: string | null;
  voteDate?: string | null;
  voteSummary?: string | null;
  finalDecision?: string | null;
  finalDecisionNote?: string | null;
  finalDecisionByName?: string | null;
  finalDecisionAt?: string | null;
  createdAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined, lang: LangCode) {
  if (!d) return "";
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-MA" : lang === "es" ? "es-MA" : "fr-MA";
  return new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function workTypeLabel(t: (key: string) => string, key: string) {
  const labels: Record<string, string> = {
    acUnit: "Climatiseur",
    balcony: "Balcon",
    windows: "Fenêtres",
    facade: "Façade",
    structural: "Structurel",
    plumbing: "Plomberie",
    electrical: "Électricité",
    other: "Autre",
  };
  const translationKeys: Record<string, string> = {
    acUnit: "privateWorksTypeAcUnit",
    balcony: "privateWorksTypeBalcony",
    windows: "privateWorksTypeWindows",
    facade: "privateWorksTypeFacade",
    structural: "privateWorksTypeStructural",
    plumbing: "privateWorksTypePlumbing",
    electrical: "privateWorksTypeElectrical",
    other: "privateWorksTypeOther",
  };
  return t(translationKeys[key] ?? "") || labels[key] || labels.other;
}

function statusLabel(t: (key: string) => string, status: string) {
  return t(STATUS_CONFIG[status]?.label ?? STATUS_CONFIG.submitted.label);
}

// ─── Step Trail Component ─────────────────────────────────────────────────────

function StepTrail({ row, colors, t }: { row: TravauxPrivatif; colors: any; t: (key: string) => string }) {
  const st = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.submitted;
  const currentStep = st.step;
  const isTerminal = row.status === "approved" || row.status === "rejected" || row.status === "withdrawn";

  if (row.status === "withdrawn") {
    return (
      <View style={[trail.box, { backgroundColor: colors.secondary }]}>
        <Feather name="x-circle" size={14} color="#9ca3af" />
        <Text style={[trail.txt, { color: "#9ca3af" }]}>{t("privateWorksWithdrawnByResident")}</Text>
      </View>
    );
  }

  const visibleSteps = STEPS.filter((s) => {
    if (s.key === "committee_review" && !row.requiresCommitteeReview && currentStep < 2) return false;
    if (s.key === "vote_required" && !row.requiresGAVote && currentStep < 3) return false;
    return true;
  });

  return (
    <View style={trail.container}>
      {visibleSteps.map((s, i) => {
        const stepIndex = STEPS.findIndex((x) => x.key === s.key);
        const done = isTerminal ? stepIndex < 4 : stepIndex < currentStep;
        const active = !isTerminal && stepIndex === currentStep;
        const color = done || active ? ACCENT : colors.border;
        return (
          <View key={s.key} style={trail.row}>
            <View style={[trail.dot, { borderColor: color, backgroundColor: done ? ACCENT : active ? ACCENT + "30" : colors.background }]}>
              {done ? <Feather name="check" size={8} color="#fff" /> : null}
            </View>
            <Text style={[trail.label, { color: done || active ? colors.foreground : colors.mutedForeground, fontFamily: active ? "Inter_700Bold" : "Inter_400Regular" }]}>
              {t(s.label)}
            </Text>
            {i < visibleSteps.length - 1 && (
              <View style={[trail.line, { backgroundColor: done ? ACCENT : colors.border }]} />
            )}
          </View>
        );
      })}
      {isTerminal && (
        <View style={[trail.dot, { borderColor: st.color, backgroundColor: st.color + "20", marginStart: 4 }]}>
          <Feather name={row.status === "approved" ? "check" : "x"} size={8} color={st.color} />
        </View>
      )}
    </View>
  );
}

// ─── Decision Trail (audit history) ──────────────────────────────────────────

function DecisionTrail({ row, colors, t, lang }: { row: TravauxPrivatif; colors: any; t: (key: string) => string; lang: LangCode }) {
  const items = [
    row.syndicReviewNote && {
      icon: "eye" as const,
      title: t("privateWorksSyndicReviewTitle"),
      note: row.syndicReviewNote,
      by: row.syndicReviewedByName,
      date: row.syndicReviewedAt,
      color: "#3b82f6",
    },
    row.committeeNote && {
      icon: "users" as const,
      title: `${t("privateWorksCommitteeOpinion")}${row.committeeRecommendation ? ` — ${row.committeeRecommendation === "approve" ? t("privateWorksFavorable") : row.committeeRecommendation === "reject" ? t("privateWorksUnfavorable") : t("privateWorksSubmitToVote")}` : ""}`,
      note: row.committeeNote,
      by: row.committeeReviewedByName,
      date: row.committeeReviewedAt,
      color: "#8b5cf6",
    },
    row.voteSummary && {
      icon: "check-square" as const,
      title: `${t("privateWorksVoteResult")} — ${row.voteOutcome === "approved" ? t("privateWorksApproved") : row.voteOutcome === "rejected" ? t("privateWorksRejected") : t("privateWorksInconclusive")}`,
      note: row.voteSummary,
      date: row.voteDate,
      color: "#f59e0b",
    },
    row.finalDecisionNote && {
      icon: (row.finalDecision === "approved" ? "check-circle" : "x-circle") as "check-circle" | "x-circle",
      title: `${t("privateWorksFinalDecision")} — ${row.finalDecision === "approved" ? t("privateWorksApproved") : t("privateWorksRejected")}`,
      note: row.finalDecisionNote,
      by: row.finalDecisionByName,
      date: row.finalDecisionAt,
      color: row.finalDecision === "approved" ? "#10b981" : "#ef4444",
    },
  ].filter(Boolean) as NonNullable<{ icon: any; title: string; note: string; by?: string | null; date?: string | null; color: string }>[];

  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t("privateWorksDecisionHistory")}</Text>
      {items.map((item, i) => (
        <View key={i} style={[styles.trailCard, { backgroundColor: item.color + "0D", borderColor: item.color + "30" }]}>
          <View style={styles.trailHeader}>
            <Feather name={item.icon} size={14} color={item.color} />
            <Text style={[styles.trailTitle, { color: item.color }]}>{item.title}</Text>
          </View>
          <Text style={[styles.trailNote, { color: colors.foreground }]}>{item.note}</Text>
          {(item.by || item.date) ? (
            <Text style={[styles.trailMeta, { color: colors.mutedForeground }]}>
              {[item.by, fmtDate(item.date, lang)].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TravauxPrivatifsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { t, lang } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const { showToast } = useToast();
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "super_admin";

  const [rows, setRows] = useState<TravauxPrivatif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Buildings available to the current user
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(false);

  // Modal states
  const [showSubmit, setShowSubmit] = useState(false);
  const [showSyndicReview, setShowSyndicReview] = useState<TravauxPrivatif | null>(null);
  const [showCommitteeReview, setShowCommitteeReview] = useState<TravauxPrivatif | null>(null);
  const [showVote, setShowVote] = useState<TravauxPrivatif | null>(null);
  const [showDecision, setShowDecision] = useState<TravauxPrivatif | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Submit form
  const [form, setForm] = useState({
    title: "", description: "", workType: "ac_unit", buildingId: "",
  });

  // Syndic review form
  const [syndicForm, setSyndicForm] = useState({
    reviewNote: "", bylawReference: "",
    requiresCommitteeReview: false, requiresGAVote: false,
  });

  // Committee review form
  const [committeeForm, setCommitteeForm] = useState({
    committeeNote: "", recommendation: "approve" as "approve" | "reject" | "escalate_vote",
  });

  // Vote form
  const [voteForm, setVoteForm] = useState({
    voteOutcome: "approved" as "approved" | "rejected" | "inconclusive",
    voteDate: new Date().toISOString().split("T")[0],
    voteSummary: "",
  });

  // Decision form
  const [decisionForm, setDecisionForm] = useState({
    decision: "approved" as "approved" | "rejected",
    justification: "",
  });

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setLoadError(false);
      const data = await apiRequest("/travaux-privatifs", "GET", undefined, token);
      setRows(data.data ?? []);
    } catch {
      if (!silent) setLoadError(true);
      else showToast({ type: "error", title: t("error"), message: t("privateWorksLoadErrorDescription") });
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [token, t]);

  const loadBuildings = useCallback(async () => {
    try {
      setBuildingsLoading(true);
      const data = await apiRequest("/buildings", "GET", undefined, token);
      const list: Building[] = (data.data ?? []).map((b: any) => ({ id: b.id, name: b.name, address: b.address }));
      setBuildings(list);
      // Pre-select first building so the form is valid on first open
      if (list.length > 0) setForm((p) => ({ ...p, buildingId: p.buildingId || list[0].id }));
    } catch { showToast({ type: "error", title: t("error"), message: t("privateWorksLoadBuildingsError") }); }
    finally { setBuildingsLoading(false); }
  }, [token, t]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.buildingId) { showToast({ type: "warning", title: t("privateWorksFieldRequired"), message: t("privateWorksBuildingSelectRequired") }); return; }
    if (!form.title.trim()) { showToast({ type: "warning", title: t("privateWorksFieldRequired"), message: t("privateWorksTitleValidation") }); return; }
    if (!form.description.trim()) { showToast({ type: "warning", title: t("privateWorksFieldRequired"), message: t("privateWorksDescriptionValidation") }); return; }
    try {
      setSubmitting(true);
      await apiRequest("/travaux-privatifs", "POST", form, token);
      setShowSubmit(false);
      setForm({ title: "", description: "", workType: "ac_unit", buildingId: "" });
      showToast({ type: "success", title: t("privateWorksSubmitted"), message: t("privateWorksSubmittedToast") });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: t("privateWorksLoadErrorDescription") });
    } finally { setSubmitting(false); }
  };

  // ── Syndic review ─────────────────────────────────────────────────────────

  const handleSyndicReview = async () => {
    if (!showSyndicReview) return;
    if (!syndicForm.reviewNote.trim()) { showToast({ type: "warning", title: t("privateWorksFieldRequired"), message: t("privateWorksReviewValidation") }); return; }
    try {
      setSubmitting(true);
      await apiRequest(`/travaux-privatifs/${showSyndicReview.id}/syndic-review`, "POST", syndicForm, token);
      setShowSyndicReview(null);
      setSyndicForm({ reviewNote: "", bylawReference: "", requiresCommitteeReview: false, requiresGAVote: false });
      showToast({ type: "success", title: t("privateWorksSyndicReviewTitle"), message: t("privateWorksReviewSavedToast") });
      load(true);
    } catch { showToast({ type: "error", title: t("error"), message: t("privateWorksLoadErrorDescription") }); }
    finally { setSubmitting(false); }
  };

  // ── Committee review ──────────────────────────────────────────────────────

  const handleCommitteeReview = async () => {
    if (!showCommitteeReview) return;
    if (!committeeForm.committeeNote.trim()) { showToast({ type: "warning", title: t("privateWorksFieldRequired"), message: t("privateWorksOpinionValidation") }); return; }
    try {
      setSubmitting(true);
      await apiRequest(`/travaux-privatifs/${showCommitteeReview.id}/committee-review`, "POST", committeeForm, token);
      setShowCommitteeReview(null);
      setCommitteeForm({ committeeNote: "", recommendation: "approve" });
      showToast({ type: "success", title: t("privateWorksCommitteeOpinion"), message: t("privateWorksOpinionSavedToast") });
      load(true);
    } catch { showToast({ type: "error", title: t("error"), message: t("privateWorksLoadErrorDescription") }); }
    finally { setSubmitting(false); }
  };

  // ── Vote ──────────────────────────────────────────────────────────────────

  const handleVote = async () => {
    if (!showVote) return;
    if (!voteForm.voteSummary.trim()) { showToast({ type: "warning", title: t("privateWorksFieldRequired"), message: t("privateWorksVoteSummaryValidation") }); return; }
    try {
      setSubmitting(true);
      await apiRequest(`/travaux-privatifs/${showVote.id}/vote`, "POST", voteForm, token);
      setShowVote(null);
      setVoteForm({ voteOutcome: "approved", voteDate: new Date().toISOString().split("T")[0], voteSummary: "" });
      showToast({ type: "success", title: t("privateWorksVoteResult"), message: t("privateWorksVoteSavedToast") });
      load(true);
    } catch { showToast({ type: "error", title: t("error"), message: t("privateWorksLoadErrorDescription") }); }
    finally { setSubmitting(false); }
  };

  // ── Decision ──────────────────────────────────────────────────────────────

  const handleDecision = async () => {
    if (!showDecision) return;
    if (!decisionForm.justification.trim() || decisionForm.justification.trim().length < 10) {
      showToast({ type: "warning", title: t("privateWorksFieldRequired"), message: t("privateWorksJustificationValidation") });
      return;
    }
    Alert.alert(
      t("confirm"),
      t("privateWorksDecisionConfirm").replace(
        "{decision}",
        decisionForm.decision === "approved" ? t("privateWorksApproveVerb") : t("privateWorksRejectVerb"),
      ),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("confirm"),
          style: decisionForm.decision === "rejected" ? "destructive" : "default",
          onPress: async () => {
            try {
              setSubmitting(true);
              await apiRequest(`/travaux-privatifs/${showDecision!.id}/decision`, "POST", {
                decision: decisionForm.decision,
                justification: decisionForm.justification,
              }, token);
              setShowDecision(null);
              setDecisionForm({ decision: "approved", justification: "" });
               showToast({ type: "success", title: t("privateWorksFinalDecision"), message: t("privateWorksDecisionSavedToast") });
              load(true);
            } catch { showToast({ type: "error", title: t("error"), message: t("privateWorksLoadErrorDescription") }); }
            finally { setSubmitting(false); }
          },
        },
      ],
    );
  };

  // ── Withdraw ──────────────────────────────────────────────────────────────

  const handleWithdraw = (row: TravauxPrivatif) => {
    Alert.alert(t("privateWorksWithdrawTitle"), t("privateWorksWithdrawConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("privateWorksWithdraw"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest(`/travaux-privatifs/${row.id}/withdraw`, "PUT", {}, token);
            load(true);
          } catch { showToast({ type: "error", title: t("error"), message: t("privateWorksLoadErrorDescription") }); }
        },
      },
    ]);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const pending = rows.filter((r) => !["approved", "rejected", "withdrawn"].includes(r.status)).length;
  const approved = rows.filter((r) => r.status === "approved").length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("privateWorks")}</Text>
          <Text style={styles.headerSub}>{t("privateWorksSubtitle")}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); loadBuildings(); setShowSubmit(true); }}
        >
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: t("privateWorksTotal"), value: rows.length, color: ACCENT },
          { label: t("privateWorksInProgress"), value: pending, color: "#3b82f6" },
          { label: t("privateWorksApprovedCount"), value: approved, color: "#10b981" },
          { label: t("privateWorksRejectedCount"), value: rows.filter((r) => r.status === "rejected").length, color: "#ef4444" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <LoadingState title={t("privateWorksLoadingTitle")} description={t("privateWorksLoadingDescription")} accentColor={ACCENT} />
      ) : loadError ? (
        <ErrorState
          title={t("privateWorksLoadErrorTitle")}
          description={t("privateWorksLoadErrorDescription")}
          retryLabel={t("retry")}
          onRetry={() => load()}
          accentColor={ACCENT}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
          showsVerticalScrollIndicator={false}
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: ACCENT + "18" }]}>
                <Feather name="edit-2" size={32} color={ACCENT} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("privateWorksEmptyTitle")}</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t("privateWorksEmptyDescription")}
              </Text>
              <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: ACCENT }]} onPress={() => { loadBuildings(); setShowSubmit(true); }}>
                <Text style={styles.emptyBtnText}>{t("privateWorksNewRequest")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            rows.map((row) => {
              const wt = WORK_TYPES[row.workType] ?? WORK_TYPES.other;
              const st = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.submitted;
              const isOpen = expanded === row.id;
              const isMyRequest = row.requestedById === user?.id;

              return (
                <TouchableOpacity
                  key={row.id}
                  activeOpacity={0.85}
                  onPress={() => { Haptics.selectionAsync(); setExpanded(isOpen ? null : row.id); }}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {/* Card header */}
                  <View style={styles.cardTop}>
                    <View style={[styles.wtIcon, { backgroundColor: ACCENT + "18" }]}>
                      <Feather name={wt.icon} size={20} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{row.title}</Text>
                      <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                        {workTypeLabel(t, wt.key)} · {row.requestedByName}{isMyRequest ? ` (${t("privateWorksMe")})` : ""}
                      </Text>
                    </View>
                    <View style={styles.badgeCol}>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.statusText, { color: st.color }]}>{statusLabel(t, row.status)}</Text>
                      </View>
                      <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} style={{ marginTop: 4 }} />
                    </View>
                  </View>

                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={isOpen ? undefined : 2}>
                    {row.description}
                  </Text>

                  {/* Date */}
                  <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
                    {t("privateWorksSubmittedOn")} {fmtDate(row.createdAt, lang)}
                  </Text>

                  {/* Expanded: step trail + decision history + actions */}
                  {isOpen && (
                    <View style={[styles.expanded, { borderTopColor: colors.border }]}>
                      <StepTrail row={row} colors={colors} t={t} />
                      <DecisionTrail row={row} colors={colors} t={t} lang={lang} />

                      {/* Action buttons */}
                      <View style={styles.actionRow}>
                        {/* Requester: withdraw */}
                        {isMyRequest && !["approved", "rejected", "withdrawn"].includes(row.status) && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: "#ef444415", borderColor: "#ef4444" }]}
                            onPress={() => handleWithdraw(row)}
                          >
                            <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>{t("privateWorksWithdraw")}</Text>
                          </TouchableOpacity>
                        )}

                        {/* Admin: syndic review */}
                        {isAdmin && row.status === "submitted" && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: "#3b82f615", borderColor: "#3b82f6" }]}
                            onPress={() => { setSyndicForm({ reviewNote: "", bylawReference: "", requiresCommitteeReview: false, requiresGAVote: false }); setShowSyndicReview(row); }}
                          >
                            <Feather name="eye" size={13} color="#3b82f6" />
                            <Text style={[styles.actionBtnText, { color: "#3b82f6" }]}>{t("privateWorksInitialReviewTitle")}</Text>
                          </TouchableOpacity>
                        )}

                        {/* Admin: committee review */}
                        {isAdmin && row.status === "committee_review" && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: "#8b5cf615", borderColor: "#8b5cf6" }]}
                            onPress={() => { setCommitteeForm({ committeeNote: "", recommendation: "approve" }); setShowCommitteeReview(row); }}
                          >
                            <Feather name="users" size={13} color="#8b5cf6" />
                            <Text style={[styles.actionBtnText, { color: "#8b5cf6" }]}>{t("privateWorksCommitteeTitle")}</Text>
                          </TouchableOpacity>
                        )}

                        {/* Admin: record vote */}
                        {isAdmin && row.status === "vote_required" && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b" }]}
                            onPress={() => { setVoteForm({ voteOutcome: "approved", voteDate: new Date().toISOString().split("T")[0], voteSummary: "" }); setShowVote(row); }}
                          >
                            <Feather name="check-square" size={13} color="#f59e0b" />
                            <Text style={[styles.actionBtnText, { color: "#f59e0b" }]}>{t("privateWorksVoteResult")}</Text>
                          </TouchableOpacity>
                        )}

                        {/* Admin: final decision */}
                        {isAdmin && row.status === "under_review" && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: ACCENT + "15", borderColor: ACCENT }]}
                            onPress={() => { setDecisionForm({ decision: "approved", justification: "" }); setShowDecision(row); }}
                          >
                            <Feather name="award" size={13} color={ACCENT} />
                            <Text style={[styles.actionBtnText, { color: ACCENT }]}>{t("privateWorksFinalDecision")}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Submit Modal ───────────────────────────────────────────────────── */}
      <Modal visible={showSubmit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSubmit(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("privateWorksNewRequestTitle")}</Text>
            <TouchableOpacity onPress={() => setShowSubmit(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <View style={[styles.infoBox, { backgroundColor: ACCENT + "12" }]}>
              <Feather name="info" size={14} color={ACCENT} />
              <Text style={[styles.infoText, { color: ACCENT }]}>
                {t("privateWorksApprovalNotice")}
              </Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksBuildingRequired")}</Text>
            {buildingsLoading ? (
              <ActivityIndicator color={ACCENT} size="small" style={{ marginVertical: 8 }} />
            ) : buildings.length === 0 ? (
              <View style={[styles.infoBox, { backgroundColor: "#ef444412" }]}>
                <Feather name="alert-circle" size={14} color="#ef4444" />
                <Text style={[styles.infoText, { color: "#ef4444" }]}>
                  {t("privateWorksAccessibleBuildingRequired")}
                </Text>
              </View>
            ) : (
              <View style={styles.buildingList}>
                {buildings.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.buildingBtn, { backgroundColor: form.buildingId === b.id ? ACCENT : colors.secondary, borderColor: form.buildingId === b.id ? ACCENT : colors.border }]}
                    onPress={() => setForm((p) => ({ ...p, buildingId: b.id }))}
                  >
                    <Feather name="home" size={14} color={form.buildingId === b.id ? "#fff" : ACCENT} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.buildingName, { color: form.buildingId === b.id ? "#fff" : colors.foreground }]}>{b.name}</Text>
                      {b.address ? <Text style={[styles.buildingAddr, { color: form.buildingId === b.id ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>{b.address}</Text> : null}
                    </View>
                    {form.buildingId === b.id && <Feather name="check-circle" size={16} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksTypeRequired")}</Text>
            <View style={styles.typeGrid}>
              {Object.entries(WORK_TYPES).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.typeBtn, { backgroundColor: form.workType === k ? ACCENT : colors.secondary, borderColor: form.workType === k ? ACCENT : colors.border }]}
                  onPress={() => setForm((p) => ({ ...p, workType: k }))}
                >
                  <Feather name={v.icon} size={14} color={form.workType === k ? "#fff" : ACCENT} />
                  <Text style={[styles.typeBtnText, { color: form.workType === k ? "#fff" : colors.foreground }]}>{workTypeLabel(t, v.key)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksTitleRequired")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("privateWorksTitlePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={form.title}
              onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
              maxLength={200}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksDescriptionRequired")}</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("privateWorksDescriptionPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              multiline numberOfLines={6} textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: ACCENT, opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSubmit} disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitText}>{t("privateWorksSubmit")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Syndic Review Modal ────────────────────────────────────────────── */}
      <Modal visible={!!showSyndicReview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSyndicReview(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("privateWorksInitialReviewTitle")}</Text>
            <TouchableOpacity onPress={() => setShowSyndicReview(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{showSyndicReview?.title}</Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginTop: 6 }]}>{showSyndicReview?.description}</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>{t("privateWorksBylawReference")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("privateWorksBylawPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={syndicForm.bylawReference}
              onChangeText={(v) => setSyndicForm((p) => ({ ...p, bylawReference: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksReviewNote")}</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("privateWorksReviewPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={syndicForm.reviewNote}
              onChangeText={(v) => setSyndicForm((p) => ({ ...p, reviewNote: v }))}
              multiline numberOfLines={5} textAlignVertical="top"
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksExtraSteps")}</Text>
            {([
              { key: "requiresCommitteeReview", labelKey: "privateWorksCommitteeReviewRequired", icon: "users" },
              { key: "requiresGAVote",          labelKey: "privateWorksGeneralMeetingVote", icon: "check-square" },
            ] as const).map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: syndicForm[item.key] ? ACCENT : colors.border }]}
                onPress={() => setSyndicForm((p) => ({ ...p, [item.key]: !p[item.key] }))}
              >
                <View style={[styles.toggleCheck, { borderColor: syndicForm[item.key] ? ACCENT : colors.border, backgroundColor: syndicForm[item.key] ? ACCENT : "transparent" }]}>
                  {syndicForm[item.key] && <Feather name="check" size={11} color="#fff" />}
                </View>
                <Feather name={item.icon} size={14} color={syndicForm[item.key] ? ACCENT : colors.mutedForeground} />
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t(item.labelKey)}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#3b82f6", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSyndicReview} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>{t("privateWorksSaveReview")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Committee Review Modal ─────────────────────────────────────────── */}
      <Modal visible={!!showCommitteeReview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCommitteeReview(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("privateWorksCommitteeTitle")}</Text>
            <TouchableOpacity onPress={() => setShowCommitteeReview(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{showCommitteeReview?.title}</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("privateWorksCommitteeRecommendation")}</Text>
            <View style={styles.recRow}>
              {([
                { k: "approve",       labelKey: "privateWorksFavorable", color: "#10b981" },
                { k: "reject",        labelKey: "privateWorksUnfavorable", color: "#ef4444" },
                { k: "escalate_vote", labelKey: "privateWorksSubmitToVote", color: "#f59e0b" },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.k}
                  style={[styles.recBtn, { backgroundColor: committeeForm.recommendation === opt.k ? opt.color : colors.secondary }]}
                  onPress={() => setCommitteeForm((p) => ({ ...p, recommendation: opt.k }))}
                >
                  <Text style={[styles.recBtnText, { color: committeeForm.recommendation === opt.k ? "#fff" : colors.foreground }]}>
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksCommitteeObservations")}</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("privateWorksCommitteePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={committeeForm.committeeNote}
              onChangeText={(v) => setCommitteeForm((p) => ({ ...p, committeeNote: v }))}
              multiline numberOfLines={5} textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#8b5cf6", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleCommitteeReview} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>{t("privateWorksSaveOpinion")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Vote Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={!!showVote} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowVote(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("privateWorksVoteTitle")}</Text>
            <TouchableOpacity onPress={() => setShowVote(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksVoteOutcome")}</Text>
            <View style={styles.recRow}>
              {([
                { k: "approved",     labelKey: "privateWorksApproved", color: "#10b981" },
                { k: "rejected",     labelKey: "privateWorksRejected", color: "#ef4444" },
                { k: "inconclusive", labelKey: "privateWorksInconclusive", color: "#6b7280" },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.k}
                  style={[styles.recBtn, { backgroundColor: voteForm.voteOutcome === opt.k ? opt.color : colors.secondary }]}
                  onPress={() => setVoteForm((p) => ({ ...p, voteOutcome: opt.k }))}
                >
                  <Text style={[styles.recBtnText, { color: voteForm.voteOutcome === opt.k ? "#fff" : colors.foreground }]}>
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksVoteDate")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={colors.mutedForeground}
              value={voteForm.voteDate}
              onChangeText={(v) => setVoteForm((p) => ({ ...p, voteDate: v }))}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksVoteSummary")}</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("privateWorksVotePlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={voteForm.voteSummary}
              onChangeText={(v) => setVoteForm((p) => ({ ...p, voteSummary: v }))}
              multiline numberOfLines={4} textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#f59e0b", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleVote} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>{t("privateWorksSaveVote")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Final Decision Modal ───────────────────────────────────────────── */}
      <Modal visible={!!showDecision} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDecision(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("privateWorksFinalDecision")}</Text>
            <TouchableOpacity onPress={() => setShowDecision(null)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <View style={[styles.infoBox, { backgroundColor: "#ef444412" }]}>
              <Feather name="alert-circle" size={14} color="#ef4444" />
              <Text style={[styles.infoText, { color: "#ef4444" }]}>
                {t("privateWorksFinalDecisionNotice")}
              </Text>
            </View>

            <Text style={[styles.cardTitle, { color: colors.foreground, marginTop: 8 }]}>{showDecision?.title}</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("privateWorksDecisionLabel")}</Text>
            <View style={styles.recRow}>
              {([
                { k: "approved", labelKey: "privateWorksApproveRequest", color: "#10b981" },
                { k: "rejected", labelKey: "privateWorksRejectRequest", color: "#ef4444" },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.k}
                  style={[styles.recBtn, { flex: 1, backgroundColor: decisionForm.decision === opt.k ? opt.color : colors.secondary }]}
                  onPress={() => setDecisionForm((p) => ({ ...p, decision: opt.k }))}
                >
                  <Feather name={opt.k === "approved" ? "check" : "x"} size={14} color={decisionForm.decision === opt.k ? "#fff" : opt.color} />
                  <Text style={[styles.recBtnText, { color: decisionForm.decision === opt.k ? "#fff" : colors.foreground }]}>
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("privateWorksOfficialJustification")}</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("privateWorksJustificationPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              value={decisionForm.justification}
              onChangeText={(v) => setDecisionForm((p) => ({ ...p, justification: v }))}
              multiline numberOfLines={6} textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: decisionForm.decision === "approved" ? "#10b981" : "#ef4444", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleDecision} disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitText}>{decisionForm.decision === "approved" ? t("privateWorksApproveRequest") : t("privateWorksRejectRequest")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Step trail micro-styles ──────────────────────────────────────────────────
const trail = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 0, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, marginStart: 4, marginEnd: 2 },
  line: { width: 14, height: 2, marginHorizontal: 2 },
  box: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 10, marginTop: 8 },
  txt: { fontSize: 12, fontFamily: "Inter_400Regular" },
});

// ─── Main styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: ACCENT },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  list: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  wtIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardDate: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  badgeCol: { alignItems: "flex-end", gap: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  expanded: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  trailCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  trailHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  trailTitle: { fontSize: 12, fontFamily: "Inter_700Bold" },
  trailNote: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  trailMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12 },
  infoText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  typeBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { height: 120, textAlignVertical: "top" },
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16, flexDirection: "row", justifyContent: "center", gap: 8 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  buildingList: { gap: 8 },
  buildingBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  buildingName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  buildingAddr: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 6 },
  toggleCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  toggleLabel: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  recRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 4 },
  recBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  recBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
