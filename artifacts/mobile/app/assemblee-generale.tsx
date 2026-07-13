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
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";

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

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  ag_ordinaire:       { label: "AG Ordinaire",      color: "#3b82f6", icon: "calendar" },
  ag_extraordinaire:  { label: "AG Extraordinaire", color: "#ef4444", icon: "alert-triangle" },
  ag_constitutive:    { label: "AG Constitutive",   color: "#10b981", icon: "flag" },
  ag_elective:        { label: "AG Élective",       color: "#f59e0b", icon: "award" },
  general:            { label: "AG Générale",        color: "#6366f1", icon: "users" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  scheduled:   { label: "Planifiée",   color: "#6b7280", icon: "clock" },
  in_progress: { label: "En cours",    color: "#10b981", icon: "radio" },
  completed:   { label: "Terminée",    color: "#3b82f6", icon: "check-circle" },
  cancelled:   { label: "Annulée",     color: "#ef4444", icon: "x-circle" },
};

const MAJORITY_LABELS: Record<string, string> = {
  simple:     "Majorité simple",
  absolute:   "Majorité absolue",
  qualified:  "Majorité qualifiée (2/3)",
  unanimite:  "Unanimité",
};

export default function AssembleeGeneraleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  const [ags, setAgs] = useState<AG[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = filterStatus !== "all" ? `?status=${filterStatus}` : "";
      const data = await apiRequest(`/ag-meetings${qs}`, "GET", undefined, token);
      setAgs(data.data ?? []);
    } catch (e) {
      console.error(e);
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
      Alert.alert("Présence", result.message ?? "Statut de présence mis à jour");
      load(true);
      if (selected?.id === ag.id) {
        setSelected((prev) => prev ? { ...prev, userAttending: result.attending ?? !prev.userAttending } : null);
      }
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de confirmer la présence");
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
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de créer l'AG");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (ag: AG, status: AGStatus) => {
    const labels: Record<AGStatus, string> = {
      scheduled: "planifiée", in_progress: "démarrée",
      completed: "clôturée", cancelled: "annulée",
    };
    Alert.alert(
      "Changer le statut",
      `Marquer cette AG comme ${labels[status]} ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            try {
              await apiRequest(`/ag-meetings/${ag.id}/status`, "PUT", { status }, token);
              load(true);
              setSelected(null);
            } catch (e: any) {
              Alert.alert("Erreur", e.message);
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
      // Reload selected AG detail
      const refreshed = await apiRequest(`/ag-meetings/${selected.id}`, "GET", undefined, token);
      setSelected(refreshed.data);
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible d'ajouter la résolution");
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
      Alert.alert("Vote enregistré", result.message ?? "Résultat de vote enregistré");
      const refreshed = await apiRequest(`/ag-meetings/${selected.id}`, "GET", undefined, token);
      setSelected(refreshed.data);
      load(true);
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible d'enregistrer le vote");
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
      Alert.alert("Erreur", e.message ?? "Impossible de générer le PV");
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
    { key: "all", label: "Toutes" },
    { key: "scheduled", label: "Planifiées" },
    { key: "in_progress", label: "En cours" },
    { key: "completed", label: "Terminées" },
  ];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title="Assemblée Générale"
        subtitle={`${ags.length} assemblée(s)`}
        color="#6366f1"
        stats={[
          { label: "Planifiées",  value: ags.filter((a) => a.status === "scheduled").length,   color: "#6b7280" },
          { label: "En cours",    value: ags.filter((a) => a.status === "in_progress").length, color: "#10b981" },
          { label: "Terminées",   value: ags.filter((a) => a.status === "completed").length,   color: "#3b82f6" },
          { label: "Résolutions", value: ags.reduce((sum, a) => sum + a.adoptedResolutions, 0), color: "#6366f1" },
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
            <Text style={s.bannerLabel}>PROCHAINE AG</Text>
            <Text style={s.bannerTitle} numberOfLines={1}>{prochaine.title}</Text>
            <Text style={s.bannerSub}>
              {prochaine.date ?? "Date TBD"}{prochaine.time ? ` à ${prochaine.time}` : ""}
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
        <View style={s.center}><ActivityIndicator color="#6366f1" size="large" /></View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="calendar" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Aucune assemblée générale</Text>
              {isAdmin && (
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: "#6366f1" }]} onPress={() => setShowCreate(true)}>
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Planifier une AG</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item: ag }) => {
            const tc = TYPE_CONFIG[ag.type ?? "general"] ?? TYPE_CONFIG.general;
            const sc = STATUS_CONFIG[ag.status] ?? STATUS_CONFIG.scheduled;
            const days = daysUntil(ag.date);
            const isUpcoming = ag.status === "scheduled" && days !== null && days <= 30 && days >= 0;

            return (
              <TouchableOpacity
                style={[s.card, { backgroundColor: colors.card, borderColor: isUpcoming ? "#6366f130" : colors.border, borderLeftWidth: 4, borderLeftColor: tc.color }]}
                onPress={() => { setSelected(ag); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.82}
              >
                <View style={s.cardTop}>
                  <View style={[s.cardIcon, { backgroundColor: tc.color + "15" }]}>
                    <Feather name={tc.icon} size={18} color={tc.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{ag.title}</Text>
                    <View style={s.cardMeta}>
                      <Feather name="calendar" size={11} color={colors.mutedForeground} />
                      <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>{ag.date ?? "Date TBD"}</Text>
                      {ag.time ? <><Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>•</Text>
                        <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>{ag.time}</Text></> : null}
                    </View>
                    {ag.location ? (
                      <View style={s.cardMeta}>
                        <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                        <Text style={[s.cardMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>{ag.location}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={[s.badge, { backgroundColor: sc.color + "18" }]}>
                      <Feather name={sc.icon} size={10} color={sc.color} />
                      <Text style={[s.badgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: tc.color + "12" }]}>
                      <Text style={[s.badgeText, { color: tc.color }]}>{tc.label}</Text>
                    </View>
                  </View>
                </View>

                <View style={[s.cardFooter, { borderTopColor: colors.border }]}>
                  <View style={s.cardFooterItem}>
                    <Feather name="users" size={11} color={colors.mutedForeground} />
                    <Text style={[s.cardFooterText, { color: colors.mutedForeground }]}>{ag.attendeesCount} présences</Text>
                  </View>
                  <View style={s.cardFooterItem}>
                    <Feather name="file-text" size={11} color={colors.mutedForeground} />
                    <Text style={[s.cardFooterText, { color: colors.mutedForeground }]}>
                      {ag.adoptedResolutions}/{ag.resolutionsCount} résolutions adoptées
                    </Text>
                  </View>
                  {ag.userAttending ? (
                    <View style={[s.badge, { backgroundColor: "#10b98118" }]}>
                      <Feather name="check" size={10} color="#10b981" />
                      <Text style={[s.badgeText, { color: "#10b981" }]}>Inscrit</Text>
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
          const tc = TYPE_CONFIG[selected.type ?? "general"] ?? TYPE_CONFIG.general;
          const sc = STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.scheduled;

          return (
            <View style={[s.modal, { backgroundColor: colors.background }]}>
              <View style={[s.modalHeader, { backgroundColor: tc.color, paddingTop: Platform.OS === "ios" ? 16 : 8 }]}>
                <TouchableOpacity onPress={() => setSelected(null)} style={s.modalBack}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1, marginStart: 12 }}>
                  <Text style={s.modalTitle} numberOfLines={2}>{selected.title}</Text>
                  <Text style={s.modalSub}>{tc.label} — {sc.label}</Text>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                {/* Info card */}
                <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    { icon: "calendar" as const, label: "Date", value: `${selected.date ?? "—"}${selected.time ? " à " + selected.time : ""}` },
                    { icon: "map-pin" as const, label: "Lieu", value: selected.location ?? "—" },
                    { icon: "users" as const, label: "Présences confirmées", value: `${selected.attendeesCount}` },
                    { icon: "check-circle" as const, label: "Résolutions adoptées", value: `${selected.adoptedResolutions} / ${selected.resolutionsCount}` },
                  ].map((row, i) => (
                    <View key={row.label}>
                      {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                      <View style={s.infoRow}>
                        <View style={s.infoLabelRow}>
                          <Feather name={row.icon} size={13} color={tc.color} />
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
                    <Text style={[s.sectionTitle, { color: colors.foreground }]}>Ordre du jour</Text>
                    <Text style={[s.agendaText, { color: colors.mutedForeground }]}>{selected.agenda}</Text>
                  </View>
                ) : null}

                {/* Resolutions */}
                <View>
                  <View style={s.sectionHeader}>
                    <Text style={[s.sectionTitle, { color: colors.foreground }]}>
                      Résolutions ({selected.resolutions.length})
                    </Text>
                    {isAdmin && selected.status !== "completed" && selected.status !== "cancelled" && (
                      <TouchableOpacity
                        style={[s.smallBtn, { backgroundColor: tc.color }]}
                        onPress={() => { setShowAddResolution(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      >
                        <Feather name="plus" size={13} color="#fff" />
                        <Text style={s.smallBtnText}>Ajouter</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {selected.resolutions.length === 0 ? (
                    <View style={[s.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[s.emptyCardText, { color: colors.mutedForeground }]}>Aucune résolution pour cette AG</Text>
                    </View>
                  ) : (
                    selected.resolutions.map((res) => {
                      const resColor = res.result === "adopted" ? "#10b981" : res.result === "rejected" ? "#ef4444" : "#f59e0b";
                      const totalVoix = res.tantiemesFor + res.tantiemesAgainst + res.tantiemesAbstain;
                      const pctFor = totalVoix > 0 ? Math.round((res.tantiemesFor / totalVoix) * 100) : 0;

                      return (
                        <View key={res.id} style={[s.resCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: resColor }]}>
                          <View style={s.resHeader}>
                            <View style={[s.resNum, { backgroundColor: resColor + "18" }]}>
                              <Text style={[s.resNumText, { color: resColor }]}>{res.number}</Text>
                            </View>
                            <Text style={[s.resTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>{res.title}</Text>
                            <View style={[s.badge, { backgroundColor: resColor + "18" }]}>
                              <Text style={[s.badgeText, { color: resColor }]}>
                                {res.result === "adopted" ? "Adoptée" : res.result === "rejected" ? "Rejetée" : "En attente"}
                              </Text>
                            </View>
                          </View>

                          {res.description ? (
                            <Text style={[s.resDesc, { color: colors.mutedForeground }]}>{res.description}</Text>
                          ) : null}

                          <Text style={[s.resMajority, { color: colors.mutedForeground }]}>
                            Majorité requise: {MAJORITY_LABELS[res.requiredMajority] ?? res.requiredMajority}
                          </Text>

                          {totalVoix > 0 ? (
                            <View style={{ gap: 6, marginTop: 8 }}>
                              <View style={[s.progressBg, { backgroundColor: colors.border }]}>
                                <View style={[s.progressFill, { width: `${pctFor}%` as any, backgroundColor: "#10b981" }]} />
                              </View>
                              <View style={s.voteRow}>
                                <Text style={[s.voteLabel, { color: "#10b981" }]}>Pour: {res.tantiemesFor}</Text>
                                <Text style={[s.voteLabel, { color: "#ef4444" }]}>Contre: {res.tantiemesAgainst}</Text>
                                <Text style={[s.voteLabel, { color: "#6b7280" }]}>Abstentions: {res.tantiemesAbstain}</Text>
                              </View>
                            </View>
                          ) : null}

                          {isAdmin && selected.status !== "cancelled" && (
                            <TouchableOpacity
                              style={[s.voteBtn, { backgroundColor: tc.color + "15", borderColor: tc.color + "30" }]}
                              onPress={() => {
                                setVoteForm({ tantiemesFor: String(res.tantiemesFor), tantiemesAgainst: String(res.tantiemesAgainst), tantiemesAbstain: String(res.tantiemesAbstain), totalTantiemes: "1000" });
                                setShowVoteModal(res);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                            >
                              <Feather name="check-square" size={13} color={tc.color} />
                              <Text style={[s.voteBtnText, { color: tc.color }]}>Enregistrer les votes</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>

                {/* Actions */}
                <View style={s.actionsGroup}>
                  {/* Attend button */}
                  {selected.status === "scheduled" && (
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: selected.userAttending ? "#10b981" : tc.color }]}
                      onPress={() => handleAttend(selected)}
                    >
                      <Feather name={selected.userAttending ? "user-check" : "user-plus"} size={16} color="#fff" />
                      <Text style={s.actionBtnText}>
                        {selected.userAttending ? "Présence confirmée ✓" : "Confirmer ma présence"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Admin actions */}
                  {isAdmin && selected.status !== "cancelled" && (
                    <View style={s.adminActions}>
                      {selected.status === "scheduled" && (
                        <TouchableOpacity
                          style={[s.adminBtn, { backgroundColor: "#10b98115", borderColor: "#10b98130" }]}
                          onPress={() => handleStatusChange(selected, "in_progress")}
                        >
                          <Feather name="play" size={14} color="#10b981" />
                          <Text style={[s.adminBtnText, { color: "#10b981" }]}>Démarrer l'AG</Text>
                        </TouchableOpacity>
                      )}
                      {selected.status === "in_progress" && (
                        <TouchableOpacity
                          style={[s.adminBtn, { backgroundColor: "#3b82f615", borderColor: "#3b82f630" }]}
                          onPress={() => handleStatusChange(selected, "completed")}
                        >
                          <Feather name="check-circle" size={14} color="#3b82f6" />
                          <Text style={[s.adminBtnText, { color: "#3b82f6" }]}>Clôturer l'AG</Text>
                        </TouchableOpacity>
                      )}
                      {(selected.status === "completed") && (
                        <TouchableOpacity
                          style={[s.adminBtn, { backgroundColor: "#6366f115", borderColor: "#6366f130" }]}
                          onPress={() => handleGeneratePV(selected)}
                        >
                          <Feather name="file-text" size={14} color="#6366f1" />
                          <Text style={[s.adminBtnText, { color: "#6366f1" }]}>Générer le PV</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[s.adminBtn, { backgroundColor: "#ef444415", borderColor: "#ef444430" }]}
                        onPress={() => handleStatusChange(selected, "cancelled")}
                      >
                        <Feather name="x-circle" size={14} color="#ef4444" />
                        <Text style={[s.adminBtnText, { color: "#ef4444" }]}>Annuler l'AG</Text>
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
            <Text style={[s.modalTitle, { marginStart: 12 }]}>Planifier une AG</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {/* Type selector */}
            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Type d'assemblée</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(["ag_ordinaire", "ag_extraordinaire", "ag_elective", "ag_constitutive"] as AGType[]).map((t) => {
                const tc = TYPE_CONFIG[t];
                return (
                  <TouchableOpacity
                    key={t}
                    style={[s.typeChip, { backgroundColor: form.type === t ? tc.color : colors.secondary, borderColor: form.type === t ? tc.color : colors.border }]}
                    onPress={() => setForm((p) => ({ ...p, type: t }))}
                  >
                    <Feather name={tc.icon} size={12} color={form.type === t ? "#fff" : colors.mutedForeground} />
                    <Text style={[s.typeChipText, { color: form.type === t ? "#fff" : colors.foreground }]}>{tc.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {[
              { label: "Titre de l'AG *", key: "title" as const, placeholder: "AG Ordinaire Annuelle 2026 — Résidence..." },
              { label: "Date (AAAA-MM-JJ) *", key: "date" as const, placeholder: "2026-09-15" },
              { label: "Heure", key: "time" as const, placeholder: "10:00" },
              { label: "Lieu", key: "location" as const, placeholder: "Salle de réunion, Résidence..." },
              { label: "Quorum requis (%)", key: "quorumRequis" as const, placeholder: "50" },
              { label: "Copropriétaires convoqués", key: "membresConvoques" as const, placeholder: "24" },
            ].map((field) => (
              <View key={field.key} style={{ gap: 6 }}>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form[field.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [field.key]: v }))}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={["quorumRequis", "membresConvoques"].includes(field.key) ? "numeric" : "default"}
                />
              </View>
            ))}

            <View style={{ gap: 6 }}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Ordre du jour</Text>
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
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Feather name="calendar" size={16} color="#fff" /><Text style={s.submitText}>Planifier l'assemblée</Text></>
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
            <Text style={[s.modalTitle, { marginStart: 12 }]}>Nouvelle résolution</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            <View style={{ gap: 6 }}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Titre de la résolution *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={resForm.title}
                onChangeText={(v) => setResForm((p) => ({ ...p, title: v }))}
                placeholder="Approbation du budget prévisionnel 2027"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, height: 80, textAlignVertical: "top" }]}
                value={resForm.description}
                onChangeText={(v) => setResForm((p) => ({ ...p, description: v }))}
                placeholder="Détails de la résolution..."
                placeholderTextColor={colors.mutedForeground}
                multiline
              />
            </View>

            <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>Majorité requise</Text>
            {(["simple", "absolute", "qualified", "unanimite"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[s.majorityRow, { backgroundColor: resForm.requiredMajority === m ? "#6366f110" : colors.card, borderColor: resForm.requiredMajority === m ? "#6366f1" : colors.border }]}
                onPress={() => setResForm((p) => ({ ...p, requiredMajority: m }))}
              >
                <View style={[s.radioOuter, { borderColor: resForm.requiredMajority === m ? "#6366f1" : colors.border }]}>
                  {resForm.requiredMajority === m && <View style={[s.radioInner, { backgroundColor: "#6366f1" }]} />}
                </View>
                <Text style={[s.majorityLabel, { color: colors.foreground }]}>{MAJORITY_LABELS[m]}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: resForm.title.trim() ? "#6366f1" : colors.muted, opacity: submitting ? 0.7 : 1 }]}
              onPress={handleAddResolution}
              disabled={!resForm.title.trim() || submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Feather name="file-plus" size={16} color="#fff" /><Text style={s.submitText}>Ajouter la résolution</Text></>
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
              <Text style={s.modalTitle} numberOfLines={1}>Enregistrer les votes</Text>
              {showVoteModal && <Text style={s.modalSub} numberOfLines={1}>{showVoteModal.title}</Text>}
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {[
              { label: "Tantiemes POUR ✓", key: "tantiemesFor" as const, color: "#10b981" },
              { label: "Tantiemes CONTRE ✗", key: "tantiemesAgainst" as const, color: "#ef4444" },
              { label: "Abstentions", key: "tantiemesAbstain" as const, color: "#6b7280" },
              { label: "Total tantiemes (base)", key: "totalTantiemes" as const, color: "#6366f1" },
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
                  Majorité requise: {MAJORITY_LABELS[showVoteModal.requiredMajority] ?? showVoteModal.requiredMajority}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: "#6366f1", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleVote}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Feather name="check-square" size={16} color="#fff" /><Text style={s.submitText}>Enregistrer le résultat</Text></>
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
            <Text style={[s.modalTitle, { marginStart: 12 }]}>Procès-Verbal</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
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
});
