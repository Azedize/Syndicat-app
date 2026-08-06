import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";
import { useToast } from "@/context/ToastContext";

type AGType = "ag_ordinaire" | "ag_extraordinaire" | "ag_constitutive" | "ag_elective" | "general";
type AGStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

interface AGResolution {
  id: string;
  number: number;
  title: string;
  description?: string;
  requiredMajority: string;
  tantiemesFor: number;
  tantiemesAgainst: number;
  tantiemesAbstain: number;
  result: "pending" | "adopted" | "rejected";
}

interface AG {
  id: string;
  title: string;
  date?: string;
  time?: string;
  location?: string;
  type?: string;
  description?: string;
  agenda?: string;
  status: string;
  createdBy?: string;
  attendeesCount: number;
  userAttending: boolean;
  resolutionsCount: number;
  adoptedResolutions: number;
  rejectedResolutions: number;
  resolutions: AGResolution[];
}

// L'Assemblée Générale est un droit de gouvernance des copropriétaires (Loi 18-00) ;
// les locataires n'y participent pas et ne doivent pas voir son contenu.
export default function AssembleeGeneraleScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "president", "secretary", "committee_member", "member"]}>
      <AssembleeGeneraleScreenInner />
    </RoleGuard>
  );
}

function AssembleeGeneraleScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const { t } = useLanguage();

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin"
    || user?.role === "president" || user?.role === "secretary";
  const { showToast } = useToast();

  const [ags, setAgs] = useState<AG[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<AG | null>(null);
  const [pvText, setPvText] = useState<string | null>(null);
  const [showPv, setShowPv] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddResolution, setShowAddResolution] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState<AGResolution | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "10:00",
    location: "",
    type: "ag_ordinaire" as AGType,
    agenda: "",
    quorumRequis: "50",
    membresConvoques: "",
  });

  // Resolution form
  const [resForm, setResForm] = useState({
    title: "",
    description: "",
    requiredMajority: "simple",
  });

  // Vote form
  const [voteForm, setVoteForm] = useState({
    tantiemesFor: "",
    tantiemesAgainst: "",
    tantiemesAbstain: "0",
    totalTantiemes: "1000",
  });

  // Derived labels — defined inside the component so they pick up t()
  const typeLabel = (key: string): string => ({
    ag_ordinaire:      t("agOrdinaryLabel"),
    ag_extraordinaire: t("agExtraordinaryLabel"),
    ag_constitutive:   t("agConstitutiveLabel"),
    ag_elective:       t("agElectiveLabel"),
    general:           t("agGeneralLabel"),
  }[key] ?? key);

  const typeColor = (key: string): string => ({
    ag_ordinaire:      "#3b82f6",
    ag_extraordinaire: "#ef4444",
    ag_constitutive:   "#10b981",
    ag_elective:       "#f59e0b",
    general:           "#6366f1",
  }[key] ?? "#6366f1");

  const typeIcon = (key: string): keyof typeof Feather.glyphMap => ({
    ag_ordinaire:      "calendar",
    ag_extraordinaire: "alert-triangle",
    ag_constitutive:   "flag",
    ag_elective:       "award",
    general:           "users",
  }[key] ?? "calendar") as keyof typeof Feather.glyphMap;

  const statusLabel = (key: string): string => ({
    scheduled:   t("agScheduledLabel"),
    in_progress: t("agInProgressLabel"),
    completed:   t("agCompletedLabel"),
    cancelled:   t("agCancelledLabel"),
  }[key] ?? key);

  const statusColor = (key: string): string => ({
    scheduled:   "#6b7280",
    in_progress: "#10b981",
    completed:   "#3b82f6",
    cancelled:   "#ef4444",
  }[key] ?? "#6b7280");

  const statusIcon = (key: string): keyof typeof Feather.glyphMap => ({
    scheduled:   "clock",
    in_progress: "radio",
    completed:   "check-circle",
    cancelled:   "x-circle",
  }[key] ?? "clock") as keyof typeof Feather.glyphMap;

  const majorityLabel = (key: string): string => ({
    simple:    t("agSimpleMajority"),
    absolute:  t("agAbsoluteMajority"),
    qualified: t("agQualifiedMajority"),
    unanimite: t("agUnanimity"),
  }[key] ?? key);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(false); }
      const qs = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const data = await apiRequest(`/ag-meetings${qs}`, "GET", undefined, token);
      setAgs(data.data ?? []);
    } catch {
      if (!silent) setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, filterStatus]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleAttend = async (ag: AG) => {
    try {
      const result = await apiRequest(`/ag-meetings/${ag.id}/attend`, "POST", undefined, token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("agPresenceTitle"), message: result.message ?? t("agPresenceSuccess") });
      load(true);
      if (selected?.id === ag.id) {
        setSelected((prev) => prev ? { ...prev, userAttending: result.attending ?? !prev.userAttending } : null);
      }
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("agPresenceError") });
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.date.trim()) return;
    try {
      setSubmitting(true);
      await apiRequest("/ag-meetings", "POST", {
        title: form.title.trim(),
        date: form.date.trim(),
        time: form.time.trim(),
        location: form.location.trim(),
        type: form.type,
        agenda: form.agenda.trim(),
        quorumRequis: parseInt(form.quorumRequis) || 50,
        membresConvoques: parseInt(form.membresConvoques) || 0,
      }, token);
      setShowCreate(false);
      setForm({ title: "", date: "", time: "10:00", location: "", type: "ag_ordinaire", agenda: "", quorumRequis: "50", membresConvoques: "" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", message: t("agCreateSuccess") });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("agCreateError") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (ag: AG, status: AGStatus) => {
    const labels: Record<AGStatus, string> = {
      scheduled:   t("agStatusScheduled"),
      in_progress: t("agStatusStarted"),
      completed:   t("agStatusClosed"),
      cancelled:   t("agStatusCancelled"),
    };
    Alert.alert(
      t("agChangeStatusTitle"),
      `${t("agMarkAs")} ${labels[status]} ?`,
      [
        { text: t("agCancelBtn"), style: "cancel" },
        {
          text: t("agConfirmBtn"),
          onPress: async () => {
            try {
              await apiRequest(`/ag-meetings/${ag.id}/status`, "PUT", { status }, token);
              load(true);
              setSelected(null);
            } catch (e: any) {
              showToast({ type: "error", title: t("error"), message: e.message ?? t("agStatusError") });
            }
          },
        },
      ]
    );
  };

  const handleAddResolution = async () => {
    if (!resForm.title.trim() || !selected) return;
    try {
      setSubmitting(true);
      await apiRequest(`/ag-meetings/${selected.id}/resolutions`, "POST", {
        title: resForm.title.trim(),
        description: resForm.description.trim(),
        requiredMajority: resForm.requiredMajority,
      }, token);
      setShowAddResolution(false);
      setResForm({ title: "", description: "", requiredMajority: "simple" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", message: t("agResolutionAdded") });
      const refreshed = await apiRequest(`/ag-meetings/${selected.id}`, "GET", undefined, token);
      setSelected(refreshed.data);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("agResolutionError") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async () => {
    if (!showVoteModal || !selected) return;
    try {
      setSubmitting(true);
      const result = await apiRequest(
        `/ag-meetings/${selected.id}/resolutions/${showVoteModal.id}/vote`,
        "PUT",
        {
          tantiemesFor: parseInt(voteForm.tantiemesFor) || 0,
          tantiemesAgainst: parseInt(voteForm.tantiemesAgainst) || 0,
          tantiemesAbstain: parseInt(voteForm.tantiemesAbstain) || 0,
          totalTantiemes: parseInt(voteForm.totalTantiemes) || 1000,
        },
        token
      );
      setShowVoteModal(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: t("agVoteRecorded"), message: result.message ?? "" });
      const refreshed = await apiRequest(`/ag-meetings/${selected.id}`, "GET", undefined, token);
      setSelected(refreshed.data);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("agVoteError") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGeneratePV = async (ag: AG) => {
    try {
      const result = await apiRequest(`/ag-meetings/${ag.id}/pv`, "GET", undefined, token);
      setPvText(result.data?.pvText ?? "");
      setShowPv(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("agPVError") });
    }
  };

  const daysUntil = (dateStr?: string) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  };

  const prochaine = ags.find((a) => a.status === "scheduled");
  const displayed = filterStatus === "all" ? ags : ags.filter((a) => a.status === filterStatus);

  const FILTERS = [
    { key: "all",         label: t("agFilterAll") },
    { key: "scheduled",   label: t("agFilterScheduled") },
    { key: "in_progress", label: t("agFilterInProgress") },
    { key: "completed",   label: t("agFilterCompleted") },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title={t("assemblee")}
        subtitle={`${ags.length} ${t("assemblee").toLowerCase()}`}
        color="#6366f1"
        stats={[
          { label: t("agFilterScheduled"),   value: ags.filter((a) => a.status === "scheduled").length,   color: "#6b7280" },
          { label: t("agFilterInProgress"),  value: ags.filter((a) => a.status === "in_progress").length, color: "#10b981" },
          { label: t("agFilterCompleted"),   value: ags.filter((a) => a.status === "completed").length,   color: "#3b82f6" },
          { label: t("resolutions"),         value: ags.reduce((sum, a) => sum + a.adoptedResolutions, 0), color: "#6366f1" },
        ]}
        action={isAdmin ? { icon: "plus", onPress: () => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } } : undefined}
      />

      {/* Next AG banner */}
      {prochaine ? (
        <TouchableOpacity
          style={[s.banner, { backgroundColor: "#6366f1" }]}
          onPress={() => { setSelected(prochaine); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          activeOpacity={0.88}
        >
          <View style={[s.bannerIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Feather name="calendar" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bannerLabel}>{t("nextAG")}</Text>
            <Text style={s.bannerTitle} numberOfLines={1}>{prochaine.title}</Text>
            <Text style={s.bannerSub}>
              {prochaine.date ?? t("agDateTBD")}
              {prochaine.time ? ` à ${prochaine.time}` : ""}
              {daysUntil(prochaine.date) !== null ? ` — J-${daysUntil(prochaine.date)}` : ""}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      ) : null}

      <FilterChips
        options={FILTERS}
        value={filterStatus}
        onChange={setFilterStatus}
        accentColor="#6366f1"
      />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#6366f1" size="large" />
          <Text style={[s.stateText, { color: colors.mutedForeground }]}>{t("agLoadingMsg")}</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <View style={[s.stateIcon, { backgroundColor: "#ef444415" }]}>
            <Feather name="wifi-off" size={32} color="#ef4444" />
          </View>
          <Text style={[s.stateTitle, { color: colors.foreground }]}>{t("error")}</Text>
          <Text style={[s.stateText, { color: colors.mutedForeground }]}>{t("agLoadError")}</Text>
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: "#6366f1" }]} onPress={() => load()}>
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={s.retryText}>{t("retryBtn")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={[s.stateIcon, { backgroundColor: "#6366f115" }]}>
                <Feather name="calendar" size={32} color="#6366f1" />
              </View>
              <Text style={[s.stateTitle, { color: colors.foreground }]}>{t("agNoData")}</Text>
              {isAdmin && (
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: "#6366f1" }]} onPress={() => setShowCreate(true)}>
                  <Feather name="plus" size={14} color="#fff" />
                  <Text style={s.emptyBtnText}>{t("agScheduleBtn")}</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: ag }) => {
            const tColor = typeColor(ag.type ?? "general");
            const tLabel = typeLabel(ag.type ?? "general");
            const tIcon = typeIcon(ag.type ?? "general");
            const sLabel = statusLabel(ag.status);
            const sColor = statusColor(ag.status);
            const sIcon = statusIcon(ag.status);
            const days = daysUntil(ag.date);
            const isUpcoming = ag.status === "scheduled" && days !== null && days <= 30 && days >= 0;

            return (
              <TouchableOpacity
                style={[s.card, { backgroundColor: colors.card, borderColor: isUpcoming ? "#6366f130" : colors.border, borderLeftWidth: 4, borderLeftColor: tColor }]}
                onPress={() => { setSelected(ag); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.82}
              >
                <View style={s.cardTop}>
                  <View style={[s.cardIcon, { backgroundColor: tColor + "15" }]}>
                    <Feather name={tIcon} size={18} color={tColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{ag.title}</Text>
                    <View style={s.cardMeta}>
                      <Feather name="calendar" size={11} color={colors.mutedForeground} />
                      <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>{ag.date ?? t("agDateTBD")}</Text>
                      {ag.time ? (
                        <>
                          <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>•</Text>
                          <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>{ag.time}</Text>
                        </>
                      ) : null}
                    </View>
                    {ag.location ? (
                      <View style={s.cardMeta}>
                        <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                        <Text style={[s.cardMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>{ag.location}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={[s.badge, { backgroundColor: sColor + "18" }]}>
                      <Feather name={sIcon} size={10} color={sColor} />
                      <Text style={[s.badgeText, { color: sColor }]}>{sLabel}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: tColor + "12" }]}>
                      <Text style={[s.badgeText, { color: tColor }]}>{tLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={[s.cardFooter, { borderTopColor: colors.border }]}>
                  <View style={s.cardFooterItem}>
                    <Feather name="users" size={11} color={colors.mutedForeground} />
                    <Text style={[s.cardFooterText, { color: colors.mutedForeground }]}>
                      {ag.attendeesCount} {t("agPresencesLabel")}
                    </Text>
                  </View>
                  <View style={s.cardFooterItem}>
                    <Feather name="file-text" size={11} color={colors.mutedForeground} />
                    <Text style={[s.cardFooterText, { color: colors.mutedForeground }]}>
                      {ag.adoptedResolutions}/{ag.resolutionsCount} {t("agResolutionsAdoptedFmt")}
                    </Text>
                  </View>
                  {ag.userAttending ? (
                    <View style={[s.badge, { backgroundColor: "#10b98118" }]}>
                      <Feather name="check" size={10} color="#10b981" />
                      <Text style={[s.badgeText, { color: "#10b981" }]}>{t("agRegisteredStatus")}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── AG Detail Modal ─────────────────────────────────────────────── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (() => {
          const tColor = typeColor(selected.type ?? "general");
          const tLabel = typeLabel(selected.type ?? "general");
          const sLabel = statusLabel(selected.status);

          return (
            <View style={[s.modal, { backgroundColor: colors.background }]}>
              <View style={[s.modalHeader, { backgroundColor: tColor, paddingTop: Platform.OS === "ios" ? 16 : 8 }]}>
                <TouchableOpacity onPress={() => setSelected(null)} style={s.modalBack}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1, marginStart: 12 }}>
                  <Text style={s.modalTitle} numberOfLines={2}>{selected.title}</Text>
                  <Text style={s.modalSub}>{tLabel} — {sLabel}</Text>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                {/* Info card */}
                <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "calendar" as const, label: t("agDateLabel"), value: `${selected.date ?? "—"}${selected.time ? " à " + selected.time : ""}` },
                    { icon: "map-pin" as const, label: t("locationLabel"), value: selected.location ?? "—" },
                    { icon: "users" as const, label: t("agPresencesConfirmedLabel"), value: `${selected.attendeesCount}` },
                    { icon: "check-circle" as const, label: t("agResolutionsAdoptedLabel"), value: `${selected.adoptedResolutions} / ${selected.resolutionsCount}` },
                  ].map((row, i) => (
                    <View key={row.label}>
                      {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                      <View style={s.infoRow}>
                        <View style={s.infoLabelRow}>
                          <Feather name={row.icon} size={13} color={tColor} />
                          <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                        </View>
                        <Text style={[s.infoValue, { color: colors.foreground }]}>{row.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Agenda */}
                {selected.agenda ? (
                  <View style={[s.agendaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t("agOrderOfDayLabel")}</Text>
                    <Text style={[s.agendaText, { color: colors.mutedForeground }]}>{selected.agenda}</Text>
                  </View>
                ) : null}

                {/* Resolutions */}
                <View>
                  <View style={s.sectionHeader}>
                    <Text style={[s.sectionTitle, { color: colors.foreground }]}>
                      {t("resolutions")} ({selected.resolutions.length})
                    </Text>
                    {isAdmin && selected.status !== "completed" && selected.status !== "cancelled" && (
                      <TouchableOpacity
                        style={[s.smallBtn, { backgroundColor: tColor }]}
                        onPress={() => { setShowAddResolution(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Feather name="plus" size={13} color="#fff" />
                        <Text style={s.smallBtnText}>{t("addTeamMember").split(" ")[0]}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {selected.resolutions.length === 0 ? (
                    <View style={[s.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[s.emptyCardText, { color: colors.mutedForeground }]}>{t("agNoResolutions")}</Text>
                    </View>
                  ) : (
                    selected.resolutions.map((res) => {
                      const resColor = res.result === "adopted" ? "#10b981" : res.result === "rejected" ? "#ef4444" : "#f59e0b";
                      const totalVoix = res.tantiemesFor + res.tantiemesAgainst + res.tantiemesAbstain;
                      const pctFor = totalVoix > 0 ? Math.round((res.tantiemesFor / totalVoix) * 100) : 0;
                      const resLabel = res.result === "adopted"
                        ? t("agResolutionAdoptedLabel")
                        : res.result === "rejected"
                        ? t("agResolutionRejectedLabel")
                        : t("agResolutionPendingLabel");

                      return (
                        <View key={res.id} style={[s.resCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: resColor }]}>
                          <View style={s.resHeader}>
                            <View style={[s.resNum, { backgroundColor: resColor + "18" }]}>
                              <Text style={[s.resNumText, { color: resColor }]}>{res.number}</Text>
                            </View>
                            <Text style={[s.resTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>{res.title}</Text>
                            <View style={[s.badge, { backgroundColor: resColor + "18" }]}>
                              <Text style={[s.badgeText, { color: resColor }]}>{resLabel}</Text>
                            </View>
                          </View>

                          {res.description ? (
                            <Text style={[s.resDesc, { color: colors.mutedForeground }]}>{res.description}</Text>
                          ) : null}

                          <Text style={[s.resMajority, { color: colors.mutedForeground }]}>
                            {t("agMajorityRequiredLabel")} {majorityLabel(res.requiredMajority)}
                          </Text>

                          {totalVoix > 0 ? (
                            <View style={{ gap: 6, marginTop: 8 }}>
                              <View style={[s.progressBg, { backgroundColor: colors.border }]}>
                                <View style={[s.progressFill, { width: `${pctFor}%` as any, backgroundColor: "#10b981" }]} />
                              </View>
                              <View style={s.voteRow}>
                                <Text style={[s.voteLabel, { color: "#10b981" }]}>{t("votesFor")}: {res.tantiemesFor}</Text>
                                <Text style={[s.voteLabel, { color: "#ef4444" }]}>{t("votesAgainst")}: {res.tantiemesAgainst}</Text>
                                <Text style={[s.voteLabel, { color: "#6b7280" }]}>{t("abstentions")}: {res.tantiemesAbstain}</Text>
                              </View>
                            </View>
                          ) : null}

                          {isAdmin && selected.status !== "cancelled" && (
                            <TouchableOpacity
                              style={[s.voteBtn, { backgroundColor: tColor + "15", borderColor: tColor + "30" }]}
                              onPress={() => {
                                setVoteForm({ tantiemesFor: String(res.tantiemesFor), tantiemesAgainst: String(res.tantiemesAgainst), tantiemesAbstain: String(res.tantiemesAbstain), totalTantiemes: "1000" });
                                setShowVoteModal(res);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                            >
                              <Feather name="check-square" size={13} color={tColor} />
                              <Text style={[s.voteBtnText, { color: tColor }]}>{t("agRegisterVotesBtn")}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>

                {/* Actions */}
                <View style={s.actionsGroup}>
                  {selected.status === "scheduled" && (
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: selected.userAttending ? "#10b981" : tColor }]}
                      onPress={() => handleAttend(selected)}
                    >
                      <Feather name={selected.userAttending ? "user-check" : "user-plus"} size={16} color="#fff" />
                      <Text style={s.actionBtnText}>
                        {selected.userAttending ? t("agPresenceConfirmedStatus") : t("agConfirmPresenceBtn")}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {isAdmin && selected.status !== "cancelled" && (
                    <View style={s.adminActions}>
                      {selected.status === "scheduled" && (
                        <TouchableOpacity
                          style={[s.adminBtn, { backgroundColor: "#10b98115", borderColor: "#10b98130" }]}
                          onPress={() => handleStatusChange(selected, "in_progress")}
                        >
                          <Feather name="play" size={14} color="#10b981" />
                          <Text style={[s.adminBtnText, { color: "#10b981" }]}>{t("agStartAGBtn")}</Text>
                        </TouchableOpacity>
                      )}
                      {selected.status === "in_progress" && (
                        <TouchableOpacity
                          style={[s.adminBtn, { backgroundColor: "#3b82f615", borderColor: "#3b82f630" }]}
                          onPress={() => handleStatusChange(selected, "completed")}
                        >
                          <Feather name="check-circle" size={14} color="#3b82f6" />
                          <Text style={[s.adminBtnText, { color: "#3b82f6" }]}>{t("agCloseAGBtn")}</Text>
                        </TouchableOpacity>
                      )}
                      {selected.status === "completed" && (
                        <TouchableOpacity
                          style={[s.adminBtn, { backgroundColor: "#6366f115", borderColor: "#6366f130" }]}
                          onPress={() => handleGeneratePV(selected)}
                        >
                          <Feather name="file-text" size={14} color="#6366f1" />
                          <Text style={[s.adminBtnText, { color: "#6366f1" }]}>{t("agGeneratePVBtn")}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[s.adminBtn, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}
                        onPress={() => handleStatusChange(selected, "cancelled")}
                      >
                        <Feather name="x-circle" size={14} color="#ef4444" />
                        <Text style={[s.adminBtnText, { color: "#ef4444" }]}>{t("agCancelAGBtn")}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* ── Create AG Modal ────────────────────────────────────────────── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { backgroundColor: "#6366f1", paddingTop: Platform.OS === "ios" ? 16 : 8 }]}>
            <TouchableOpacity onPress={() => setShowCreate(false)} style={s.modalBack}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={[s.modalTitle, { marginStart: 12 }]}>{t("agPlanTitle")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {/* Type selector */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("agTypeLabel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(["ag_ordinaire", "ag_extraordinaire", "ag_elective", "ag_constitutive"] as AGType[]).map((k) => {
                const kColor = typeColor(k);
                const kLabel = typeLabel(k);
                const kIcon = typeIcon(k);
                return (
                  <TouchableOpacity
                    key={k}
                    style={[s.typeChip, { backgroundColor: form.type === k ? kColor : colors.secondary, borderColor: form.type === k ? kColor : colors.border }]}
                    onPress={() => setForm((p) => ({ ...p, type: k }))}
                  >
                    <Feather name={kIcon} size={12} color={form.type === k ? "#fff" : colors.mutedForeground} />
                    <Text style={[s.typeChipText, { color: form.type === k ? "#fff" : colors.foreground }]}>{kLabel}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {[
              { label: t("agTitleFieldLabel"),      key: "title"           as const, placeholder: "AG Ordinaire Annuelle 2026…", numeric: false },
              { label: t("agDateRequired"),         key: "date"            as const, placeholder: "2026-09-15", numeric: false },
              { label: t("timeLabel"),              key: "time"            as const, placeholder: "10:00", numeric: false },
              { label: t("locationLabel"),          key: "location"        as const, placeholder: "Salle de réunion, Résidence…", numeric: false },
              { label: t("agQuorumFieldLabel"),     key: "quorumRequis"    as const, placeholder: "50", numeric: true },
              { label: t("agMembersInvitedLabel"),  key: "membresConvoques"as const, placeholder: "24", numeric: true },
            ].map((field) => (
              <View key={field.key} style={{ gap: 6 }}>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form[field.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [field.key]: v }))}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={field.numeric ? "numeric" : "default"}
                />
              </View>
            ))}

            <View style={{ gap: 6 }}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("agOrderOfDayLabel")}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, height: 100, textAlignVertical: "top" }]}
                value={form.agenda}
                onChangeText={(v) => setForm((p) => ({ ...p, agenda: v }))}
                placeholder={"1. Ouverture\n2. Approbation du budget\n3. Questions diverses"}
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: form.title.trim() && form.date.trim() ? "#6366f1" : colors.muted, opacity: submitting ? 0.7 : 1 }]}
              onPress={handleCreate}
              disabled={!form.title.trim() || !form.date.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="calendar" size={16} color="#fff" />
                  <Text style={s.submitText}>{t("agPlanBtn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Add Resolution Modal ───────────────────────────────────────── */}
      <Modal visible={showAddResolution} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddResolution(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { backgroundColor: "#6366f1", paddingTop: Platform.OS === "ios" ? 16 : 8 }]}>
            <TouchableOpacity onPress={() => setShowAddResolution(false)} style={s.modalBack}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={[s.modalTitle, { marginStart: 12 }]}>{t("agNewResolutionTitle")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            <View style={{ gap: 6 }}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("agResTitleLabel")}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={resForm.title}
                onChangeText={(v) => setResForm((p) => ({ ...p, title: v }))}
                placeholder="Approbation du budget prévisionnel 2027"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("agResDescLabel")}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, height: 80, textAlignVertical: "top" }]}
                value={resForm.description}
                onChangeText={(v) => setResForm((p) => ({ ...p, description: v }))}
                placeholder="Détails de la résolution…"
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{t("agResMajorityLabel")}</Text>
            {(["simple", "absolute", "qualified", "unanimite"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.majorityRow, { backgroundColor: resForm.requiredMajority === m ? "#6366f110" : colors.card, borderColor: resForm.requiredMajority === m ? "#6366f1" : colors.border }]}
                onPress={() => setResForm((p) => ({ ...p, requiredMajority: m }))}
              >
                <View style={[s.radioOuter, { borderColor: resForm.requiredMajority === m ? "#6366f1" : colors.border }]}>
                  {resForm.requiredMajority === m && <View style={[s.radioInner, { backgroundColor: "#6366f1" }]} />}
                </View>
                <Text style={[s.majorityLabel, { color: colors.foreground }]}>{majorityLabel(m)}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: resForm.title.trim() ? "#6366f1" : colors.muted, opacity: submitting ? 0.7 : 1 }]}
              onPress={handleAddResolution}
              disabled={!resForm.title.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="file-plus" size={16} color="#fff" />
                  <Text style={s.submitText}>{t("agAddResolutionBtn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Vote Modal ─────────────────────────────────────────────────── */}
      <Modal visible={!!showVoteModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowVoteModal(null)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { backgroundColor: "#6366f1", paddingTop: Platform.OS === "ios" ? 16 : 8 }]}>
            <TouchableOpacity onPress={() => setShowVoteModal(null)} style={s.modalBack}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginStart: 12 }}>
              <Text style={s.modalTitle} numberOfLines={1}>{t("agRegisterVotesTitle")}</Text>
              {showVoteModal && <Text style={s.modalSub} numberOfLines={1}>{showVoteModal.title}</Text>}
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {[
              { label: t("agTantFor"),     key: "tantiemesFor"     as const, color: "#10b981" },
              { label: t("agTantAgainst"), key: "tantiemesAgainst" as const, color: "#ef4444" },
              { label: t("agTantAbstain"), key: "tantiemesAbstain" as const, color: "#6b7280" },
              { label: t("agTantTotal"),   key: "totalTantiemes"   as const, color: "#6366f1" },
            ].map((field) => (
              <View key={field.key} style={{ gap: 6 }}>
                <Text style={[s.fieldLabel, { color: field.color }]}>{field.label}</Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.card, borderColor: field.color + "40", color: colors.foreground, borderWidth: 1.5 }]}
                  value={voteForm[field.key]}
                  onChangeText={(v) => setVoteForm((p) => ({ ...p, [field.key]: v }))}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
              </View>
            ))}

            {showVoteModal && (
              <View style={[s.majorityInfo, { backgroundColor: "#6366f110", borderColor: "#6366f130" }]}>
                <Feather name="info" size={14} color="#6366f1" />
                <Text style={[s.majorityInfoText, { color: "#6366f1" }]}>
                  {t("agMajorityInfo")} {majorityLabel(showVoteModal.requiredMajority)}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: "#6366f1", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleVote}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="check-square" size={16} color="#fff" />
                  <Text style={s.submitText}>{t("agRegisterResultBtn")}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── PV Modal ───────────────────────────────────────────────────── */}
      <Modal visible={showPv} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPv(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { backgroundColor: "#6366f1", paddingTop: Platform.OS === "ios" ? 16 : 8 }]}>
            <TouchableOpacity onPress={() => setShowPv(false)} style={s.modalBack}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={[s.modalTitle, { marginStart: 12 }]}>{t("agPVTitle")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <View style={[s.pvContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.pvText, { color: colors.foreground }]}>{pvText ?? ""}</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  banner: { flexDirection: "row", alignItems: "center", margin: 14, borderRadius: 16, padding: 14, gap: 12 },
  bannerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bannerLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.8)", letterSpacing: 1, marginBottom: 2 },
  bannerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  bannerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  stateIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  stateTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  stateText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, marginTop: 4 },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  empty: { alignItems: "center", gap: 14, paddingVertical: 60 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  cardMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  cardFooterItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardFooterText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 20, paddingBottom: 16 },
  modalBack: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff", flex: 1 },
  modalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  infoCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  infoLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  sep: { height: StyleSheet.hairlineWidth },
  agendaCard: { borderRadius: 16, borderWidth: 1, padding: 14 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  agendaText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 6 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  smallBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center" },
  emptyCardText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  resCard: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, padding: 12, gap: 8, marginBottom: 8 },
  resHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  resNum: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  resNumText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  resTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  resDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  resMajority: { fontSize: 11, fontFamily: "Inter_400Regular" },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  voteRow: { flexDirection: "row", gap: 12 },
  voteLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  voteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 9, borderRadius: 10, borderWidth: 1 },
  voteBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  actionsGroup: { gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  adminActions: { gap: 8 },
  adminBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  adminBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  majorityRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 9, height: 9, borderRadius: 4.5 },
  majorityLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  majorityInfo: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  majorityInfoText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 16, marginTop: 4 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  pvContainer: { borderRadius: 12, borderWidth: 1, padding: 16 },
  pvText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 20 },
  agDateLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
