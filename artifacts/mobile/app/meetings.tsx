import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActivity } from "@/context/ActivityContext";
import { useAuth } from "@/context/AuthContext";
import { useData, type Meeting } from "@/context/DataContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import FilterTabs from "@/components/FilterTabs";

const TYPE_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; color: string }> = {
  board:             { icon: "briefcase",      color: "#7c3aed" },
  general:           { icon: "users",          color: "#3b82f6" },
  committee:         { icon: "layers",         color: "#10b981" },
  emergency:         { icon: "alert-triangle", color: "#ef4444" },
  ag_ordinaire:      { icon: "calendar",       color: "#3b82f6" },
  ag_extraordinaire: { icon: "alert-triangle", color: "#ef4444" },
  ag_constitutive:   { icon: "flag",           color: "#10b981" },
  ag_elective:       { icon: "award",          color: "#f59e0b" },
};
const DEFAULT_TYPE_ICON = { icon: "calendar" as const, color: "#6b7280" };

const STATUS_CONFIG_COLORS = {
  scheduled: "#3b82f6",
  completed: "#10b981",
  cancelled: "#ef4444",
};

type FilterType = "all" | "scheduled" | "completed";

export default function MeetingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { meetings, confirmMeetingAttendance, addMeeting, updateMeeting } = useData();
  const { logActivity } = useActivity();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { t } = useLanguage();
  const FAV_ID = "screen-meetings";
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const { isWide } = useBreakpoints();
  const isAdmin = user?.role !== "member";
  const [saving, setSaving] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newType, setNewType] = useState<Meeting["type"]>("board");
  const [newDesc, setNewDesc] = useState("");

  // Edit meeting state
  const [showEditMeeting, setShowEditMeeting] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const typeLabel = (key: string) => {
    const map: Record<string, string> = {
      board: t("meetTypeBoard"),
      general: t("meetTypeGeneral"),
      committee: t("meetTypeCommittee"),
      emergency: t("typeUrgence"),
      ag_ordinaire: t("meetTypeOrdinary"),
      ag_extraordinaire: t("meetTypeExtraordinary"),
      ag_constitutive: t("meetTypeConstitutive"),
      ag_elective: t("meetTypeElective"),
    };
    return map[key] ?? t("defaultMeetType");
  };

  const statusLabel = (key: string) => {
    const map: Record<string, string> = {
      scheduled: t("statusScheduled"),
      completed: t("statusCompleted"),
      cancelled: t("statusCancelled"),
    };
    return map[key] ?? t("statusInProgress");
  };

  const filtered = meetings.filter(
    (m) => filter === "all" || m.status === filter
  );
  const upcoming = meetings.filter((m) => m.status === "scheduled");

  const handleConfirm = (id: string, title: string) => {
    if (confirmed.has(id)) return;
    Alert.alert(t("confirmAttendanceTitle"), `${t("confirmAttendanceMsg")} "${title}"?`, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirm"),
        onPress: () => {
          setConfirmed((prev) => new Set(prev).add(id));
          confirmMeetingAttendance(id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          logActivity({ action: t("attendanceConfirmedLabel"), target: title, route: "/meetings", icon: "calendar", color: "#3b82f6" });
        },
      },
    ]);
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDate.trim() || saving) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ data: any }>("/meetings", "POST", {
        title: newTitle.trim(),
        date: newDate.trim(),
        time: newTime.trim() || "09:00",
        location: newLocation.trim() || t("locationTBD"),
        type: newType,
        description: newDesc.trim(),
      }, token);
      const row = res.data;
      addMeeting({
        id: row.id,
        title: row.title,
        date: row.date,
        time: row.time,
        location: row.location,
        type: (row.type ?? "board") as Meeting["type"],
        status: (row.status ?? "scheduled") as Meeting["status"],
        description: row.description,
        agenda: row.agenda ? [row.agenda] : [],
        attendees: 0,
        userConfirmed: false,
      });
      setShowCreate(false);
      setNewTitle(""); setNewDate(""); setNewTime("");
      setNewLocation(""); setNewDesc("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      logActivity({ action: t("meetingCreatedLog"), target: newTitle, route: "/meetings", icon: "calendar", color: "#3b82f6" });
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("cannotCreateMeeting"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editMeeting || !editTitle.trim() || saving) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ data: any }>(`/meetings/${editMeeting.id}`, "PUT", {
        title: editTitle.trim(),
        date: editDate.trim(),
        time: editTime.trim(),
        location: editLocation.trim(),
        description: editDesc.trim(),
      }, token);
      const row = res.data;
      const updated: Meeting = {
        ...editMeeting,
        title: row.title ?? editTitle,
        date: row.date ?? editDate,
        time: row.time ?? editTime,
        location: row.location ?? editLocation,
        description: row.description ?? editDesc,
      };
      updateMeeting(updated);
      if (selected?.id === updated.id) setSelected(updated);
      setShowEditMeeting(false);
      setEditMeeting(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("cannotEditMeeting"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: (isWide ? 0 : insets.top) + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("meetingsTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {upcoming.length} {t("upcomingMeetings")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => toggleFavorite({ id: FAV_ID, title: t("meetingsTitle"), icon: "calendar", color: "#3b82f6", route: "/meetings" })}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="star" size={20} color={isFavorite(FAV_ID) ? "#f59e0b" : colors.mutedForeground} />
        </TouchableOpacity>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Upcoming banner */}
      {upcoming.length > 0 && (
        <TouchableOpacity
          style={[styles.upcomingBanner, { backgroundColor: colors.primary }]}
          onPress={() => setSelected(upcoming[0]!)}
          activeOpacity={0.85}
        >
          <View style={[styles.upcomingIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Feather name="calendar" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.upcomingLabel}>{t("nextMeeting")}</Text>
            <Text style={styles.upcomingTitle} numberOfLines={1}>{upcoming[0]!.title}</Text>
            <Text style={styles.upcomingDate}>{upcoming[0]!.date} à {upcoming[0]!.time}</Text>
          </View>
          <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}

      <FilterTabs
        options={[
          { key: "all",       label: t("allFilter") },
          { key: "scheduled", label: t("upcomingFilter") },
          { key: "completed", label: t("completedFilter") },
        ]}
        value={filter}
        onChange={(k) => setFilter(k as FilterType)}
        accentColor={colors.primary}
      />

      <FlatList
        data={filtered}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="calendar" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noMeetings")}</Text>
          </View>
        }
        renderItem={({ item: m }) => {
          const tc = TYPE_CONFIG[m.type] ?? DEFAULT_TYPE_ICON;
          const scColor = STATUS_CONFIG_COLORS[m.status as keyof typeof STATUS_CONFIG_COLORS] ?? "#6b7280";
          const isConfirmed = confirmed.has(m.id);
          const isScheduled = m.status === "scheduled";
          const isEmergency = m.type === "emergency" || m.type === "ag_extraordinaire";

          return (
            <TouchableOpacity
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: isEmergency ? "#ef444440" : colors.border,
                  borderLeftColor: tc.color,
                },
              ]}
              onPress={() => setSelected(m)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <View style={[styles.meetIcon, { backgroundColor: tc.color + "15" }]}>
                  <Feather name={tc.icon} size={20} color={tc.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.meetTitle, { color: colors.foreground }]} numberOfLines={1}>{m.title}</Text>
                  <Text style={[styles.meetType, { color: tc.color }]}>{typeLabel(m.type)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: scColor + "15" }]}>
                  <View style={[styles.statusDot, { backgroundColor: scColor }]} />
                  <Text style={[styles.statusLabel, { color: scColor }]}>{statusLabel(m.status)}</Text>
                </View>
              </View>

              <View style={[styles.infoRow, { backgroundColor: colors.muted }]}>
                <View style={styles.infoItem}>
                  <Feather name="calendar" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{m.date}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Feather name="clock" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{m.time}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Feather name="users" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{m.attendees} {t("participants")}</Text>
                </View>
              </View>

              <View style={styles.locationRow}>
                <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]} numberOfLines={1}>{m.location}</Text>
              </View>

              {m.agenda && m.agenda.length > 0 ? (
                <View style={[styles.agendaPreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.agendaLabel, { color: colors.primary }]}>{t("agendaLabel")}</Text>
                  {m.agenda.slice(0, 2).map((item, i) => (
                    <View key={i} style={styles.agendaItem}>
                      <View style={[styles.agendaBullet, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.agendaText, { color: colors.foreground }]} numberOfLines={1}>{item}</Text>
                    </View>
                  ))}
                  {m.agenda.length > 2 ? (
                    <Text style={[styles.agendaMore, { color: colors.primary }]}>+{m.agenda.length - 2} {t("moreAgendaPoints")}</Text>
                  ) : null}
                </View>
              ) : null}

              {isScheduled ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
                    onPress={() => setSelected(m)}
                  >
                    <Feather name="list" size={14} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t("fullAgenda")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, {
                      backgroundColor: isConfirmed ? colors.success + "20" : colors.primary,
                      borderColor: isConfirmed ? colors.success : "transparent",
                      borderWidth: isConfirmed ? 1 : 0,
                    }]}
                    onPress={() => handleConfirm(m.id, m.title)}
                    disabled={isConfirmed}
                  >
                    <Feather name={isConfirmed ? "check-circle" : "user-check"} size={14} color={isConfirmed ? colors.success : "#fff"} />
                    <Text style={[styles.actionBtnText, { color: isConfirmed ? colors.success : "#fff" }]}>
                      {isConfirmed ? t("attendanceConfirmedLabel") : t("confirmMyAttendance")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : m.status === "completed" ? (
                <TouchableOpacity
                  style={[styles.pvBtn, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "08" }]}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert(t("pvDownloadedTitle"), t("pvDownloadedMsg"));
                  }}
                >
                  <Feather name="file-text" size={14} color={colors.primary} />
                  <Text style={[styles.pvBtnText, { color: colors.primary }]}>{t("downloadPVBtn")}</Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />

      {/* Meeting detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected ? (
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {selected.title}
                </Text>
                <Text style={[styles.modalSub, { color: (TYPE_CONFIG[selected.type] ?? DEFAULT_TYPE_ICON).color }]}>
                  {typeLabel(selected.type)}
                </Text>
              </View>
              {isAdmin ? (
                <TouchableOpacity
                  style={[styles.editMeetBtn, { backgroundColor: colors.secondary }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEditMeeting(selected);
                    setEditTitle(selected.title);
                    setEditDate(selected.date);
                    setEditTime(selected.time);
                    setEditLocation(selected.location);
                    setEditDesc(selected.description ?? "");
                    setShowEditMeeting(true);
                  }}
                >
                  <Feather name="edit-2" size={15} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              {/* Info row */}
              <View style={[styles.detailInfoRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { icon: "calendar" as const, value: selected.date },
                  { icon: "clock" as const, value: selected.time },
                  { icon: "users" as const, value: `${selected.attendees} ${t("participants")}` },
                ].map((item) => (
                  <View key={item.icon} style={styles.detailInfoItem}>
                    <Feather name={item.icon} size={14} color={colors.primary} />
                    <Text style={[styles.detailInfoText, { color: colors.foreground }]}>{item.value}</Text>
                  </View>
                ))}
              </View>

              {/* Location */}
              <View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="map-pin" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.locationCardLabel, { color: colors.mutedForeground }]}>{t("locationLabel")}</Text>
                  <Text style={[styles.locationCardValue, { color: colors.foreground }]}>{selected.location}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.mapBtn, { backgroundColor: colors.primary + "15" }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(selected?.location ?? "")}`).catch(() =>
                      Alert.alert(t("error"), "Impossible d'ouvrir l'application Cartes.")
                    );
                  }}
                >
                  <Feather name="navigation" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Description */}
              {selected.description ? (
                <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.descLabel, { color: colors.foreground }]}>{t("descriptionLabel")}</Text>
                  <Text style={[styles.descText, { color: colors.mutedForeground }]}>{selected.description}</Text>
                </View>
              ) : null}

              {/* Agenda */}
              {selected.agenda && selected.agenda.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.agendaFullTitle, { color: colors.foreground }]}>{t("agendaLabel")}</Text>
                  {selected.agenda.map((item, i) => (
                    <View key={i} style={[styles.agendaFullItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.agendaNumber, { backgroundColor: colors.primary }]}>
                        <Text style={styles.agendaNumberText}>{i + 1}</Text>
                      </View>
                      <Text style={[styles.agendaFullText, { color: colors.foreground }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Attendance count */}
              <View style={[styles.attendanceCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <View style={[styles.attendeeAvatar, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="users" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attendanceTitleInline, { color: colors.foreground }]}>
                    {selected.attendees} {t("participants")}
                  </Text>
                  {selected.userConfirmed ? (
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.success, marginTop: 2 }}>
                      ✓ {t("presenceConfirmed")}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                      {t("confirmMyAttendance")}
                    </Text>
                  )}
                </View>
              </View>

              {/* Actions */}
              {selected.status === "scheduled" ? (
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, {
                      backgroundColor: confirmed.has(selected.id) ? colors.success + "15" : colors.primary,
                      borderColor: confirmed.has(selected.id) ? colors.success : "transparent",
                      borderWidth: confirmed.has(selected.id) ? 1 : 0,
                    }]}
                    onPress={() => handleConfirm(selected.id, selected.title)}
                    disabled={confirmed.has(selected.id)}
                  >
                    <Feather name={confirmed.has(selected.id) ? "check-circle" : "user-check"} size={16} color={confirmed.has(selected.id) ? colors.success : "#fff"} />
                    <Text style={[styles.confirmBtnText, { color: confirmed.has(selected.id) ? colors.success : "#fff" }]}>
                      {confirmed.has(selected.id) ? t("attendanceConfirmedLabel") : t("confirmMyAttendance")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.calBtn, { borderColor: colors.primary + "40", backgroundColor: colors.primary + "08" }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const [d, m2, y] = (selected?.date ?? "01/01/2026").split("/");
                      const isoDate = `${y}${m2}${d}`;
                      Linking.openURL(`https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(selected?.title ?? "")}&dates=${isoDate}/${isoDate}&details=${encodeURIComponent(selected?.description ?? "")}&location=${encodeURIComponent(selected?.location ?? "")}`).catch(() =>
                        Alert.alert(t("calendarTitle"), `"${selected?.title}" ${selected?.date} ${selected?.time}.`)
                      );
                    }}
                  >
                    <Feather name="calendar" size={16} color={colors.primary} />
                    <Text style={[styles.calBtnText, { color: colors.primary }]}>{t("calendar")}</Text>
                  </TouchableOpacity>
                </View>
              ) : selected.status === "completed" ? (
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert(t("pvDownloadedTitle"), t("pvDownloadedMsg"));
                  }}
                >
                  <Feather name="file-text" size={16} color="#fff" />
                  <Text style={[styles.confirmBtnText, { color: "#fff" }]}>{t("downloadPVBtn")}</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* Create meeting modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("createMeeting")}</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            {/* Type selector */}
            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("meetingTypeLabel")}</Text>
              <View style={styles.typeGrid}>
                {(Object.entries(TYPE_CONFIG) as [Meeting["type"], typeof TYPE_CONFIG[keyof typeof TYPE_CONFIG]][]).map(([key, cfg]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: newType === key ? cfg.color : colors.background,
                        borderColor: newType === key ? cfg.color : colors.border,
                      },
                    ]}
                    onPress={() => setNewType(key)}
                  >
                    <Feather name={cfg.icon} size={14} color={newType === key ? "#fff" : colors.mutedForeground} />
                    <Text style={[styles.typeChipText, { color: newType === key ? "#fff" : colors.mutedForeground }]}>
                      {typeLabel(key)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {[
              { label: t("meetingTitleLabel"), value: newTitle, setter: setNewTitle, placeholder: "Ex: Réunion mensuelle du bureau" },
              { label: t("meetingDateLabel"), value: newDate, setter: setNewDate, placeholder: "2026-06-15" },
              { label: t("meetingTimeLabel"), value: newTime, setter: setNewTime, placeholder: "10:00" },
              { label: t("locationLabel"), value: newLocation, setter: setNewLocation, placeholder: "Siège du syndicat, Casablanca" },
              { label: t("meetingDescLabel"), value: newDesc, setter: setNewDesc, placeholder: "Ordre du jour et détails..." },
            ].map((field) => (
              <View key={field.label} style={{ gap: 6 }}>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{field.label}</Text>
                <TextInput
                  style={[
                    styles.fieldInput,
                    { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground },
                    field.label === t("meetingDescLabel") ? { minHeight: 80, textAlignVertical: "top" } : null,
                  ]}
                  value={field.value}
                  onChangeText={field.setter}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  multiline={field.label === t("meetingDescLabel")}
                />
              </View>
            ))}

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: (newTitle.trim() && newDate.trim() && !saving) ? colors.primary : colors.muted }]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || !newDate.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <>
                  <Feather name="calendar" size={16} color={newTitle.trim() && newDate.trim() ? "#fff" : colors.mutedForeground} />
                  <Text style={[styles.confirmBtnText, { color: newTitle.trim() && newDate.trim() ? "#fff" : colors.mutedForeground }]}>
                    {t("save")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit meeting modal */}
      <Modal visible={showEditMeeting} transparent animationType="slide" onRequestClose={() => setShowEditMeeting(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 16 }} />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>{t("edit")}</Text>
              <TouchableOpacity onPress={() => setShowEditMeeting(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
              {[
                { label: t("meetingTitleLabel"), value: editTitle, setter: setEditTitle, placeholder: "Titre de la réunion" },
                { label: t("meetingDateLabel"), value: editDate, setter: setEditDate, placeholder: "15/06/2026" },
                { label: t("meetingTimeLabel"), value: editTime, setter: setEditTime, placeholder: "14:00" },
                { label: t("locationLabel"), value: editLocation, setter: setEditLocation, placeholder: "Siège du syndicat" },
                { label: t("meetingDescLabel"), value: editDesc, setter: setEditDesc, placeholder: "Ordre du jour et description..." },
              ].map((f) => (
                <View key={f.label} style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 }}>{f.label}</Text>
                  <TextInput
                    style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, minHeight: f.label === t("meetingDescLabel") ? 72 : undefined }}
                    value={f.value}
                    onChangeText={f.setter}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    multiline={f.label === t("meetingDescLabel")}
                  />
                </View>
              ))}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}
                  onPress={() => setShowEditMeeting(false)}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground }}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: saving ? colors.muted : colors.primary, alignItems: "center" }}
                  onPress={handleEdit}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : (
                    <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" }}>{t("save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
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
  createBtn: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  upcomingBanner: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  upcomingIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  upcomingLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.75)", marginBottom: 2 },
  upcomingTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  upcomingDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  empty: { alignItems: "center", gap: 12, marginTop: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 18, borderWidth: 1, borderLeftWidth: 4, padding: 16, gap: 12 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  meetIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  meetTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  meetType: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  infoRow: { flexDirection: "row", borderRadius: 10, padding: 10, gap: 12, flexWrap: "wrap" },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  infoText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  agendaPreview: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6 },
  agendaLabel: { fontSize: 11, fontFamily: "Inter_700Bold", marginBottom: 2 },
  agendaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  agendaBullet: { width: 5, height: 5, borderRadius: 3 },
  agendaText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  agendaMore: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 11, borderRadius: 12 },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pvBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  pvBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", flex: 1, marginLeft: 0 },
  modalSub: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  editMeetBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detailInfoRow: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  detailInfoItem: { flex: 1, alignItems: "center", gap: 6 },
  detailInfoText: { fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  locationCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  locationCardLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  locationCardValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  mapBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  descCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  descLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  agendaFullTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  agendaFullItem: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  agendaNumber: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  agendaNumberText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  agendaFullText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  attendanceTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  attendanceTitleInline: { fontSize: 14, fontFamily: "Inter_700Bold" },
  attendanceCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  attendeeRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  attendeeAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  attendeeInitials: { fontSize: 12, fontFamily: "Inter_700Bold" },
  attendeeName: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  allAttendeesBtn: { alignItems: "center", padding: 12 },
  allAttendeesBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 14 },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  calBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  calBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
});
