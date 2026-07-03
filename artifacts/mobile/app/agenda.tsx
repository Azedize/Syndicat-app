import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  SectionList,
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

type EventType = "meeting" | "election" | "formation" | "action" | "echeance" | "reunion_bureau";

const TYPE_CONFIG: Record<EventType, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  meeting: { label: "Réunion", color: "#3b82f6", icon: "users" },
  election: { label: "Élection", color: "#f59e0b", icon: "check-square" },
  formation: { label: "Formation", color: "#8b5cf6", icon: "book-open" },
  action: { label: "Action syndicale", color: "#ef4444", icon: "zap" },
  echeance: { label: "Échéance", color: "#10b981", icon: "credit-card" },
  reunion_bureau: { label: "Bureau", color: "#7c3aed", icon: "briefcase" },
};

interface AgendaEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;
  time?: string;
  endTime?: string;
  location?: string;
  description: string;
  status: "upcoming" | "today" | "completed" | "cancelled";
  participants?: number;
  mandatory?: boolean;
  organizer?: string;
}

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const DAY_NAMES_LONG = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const STATIC_EVENTS: AgendaEvent[] = [
  { id: "ev1", title: "Sit-in devant le Ministère de l'Éducation", type: "action", date: "2026-05-27", time: "09:00", endTime: "13:00", location: "Avenue Mohammed V, Rabat", description: "Action revendicative pour exiger la reprise des négociations sur les grilles salariales. Présence de toutes les sections régionales demandée.", status: "upcoming", participants: 450, mandatory: true, organizer: "Bureau National" },
  { id: "ev2", title: "Formation — Leadership & Management Syndical", type: "formation", date: "2026-05-29", time: "09:30", endTime: "16:30", location: "Centre Syndical, Fès", description: "Session de formation destinée aux responsables de sections. Thèmes : gestion des équipes, prise de décision, mobilisation des membres.", status: "upcoming", participants: 35, mandatory: false, organizer: "Commission Formation" },
  { id: "ev3", title: "Réunion mensuelle du Bureau National", type: "reunion_bureau", date: "2026-06-02", time: "10:00", endTime: "14:00", location: "Siège SNE, Rabat", description: "Ordre du jour : bilan du mois de mai, préparation AG de juin, résultats négociations ministérielles, validation budget Q3.", status: "upcoming", participants: 12, mandatory: true, organizer: "Secrétariat Général" },
  { id: "ev4", title: "Assemblée Générale Ordinaire — Juin 2026", type: "meeting", date: "2026-06-15", time: "09:00", endTime: "17:00", location: "Salle des conférences Kenzi Tower, Casablanca", description: "AG annuelle ordinaire. Points : rapport moral, rapport financier, bilan des activités, élection de 3 postes vacants, programme 2026-2027.", status: "upcoming", participants: 280, mandatory: false, organizer: "Bureau National" },
  { id: "ev5", title: "Formation — Droit Syndical Avancé", type: "formation", date: "2026-06-05", time: "09:00", endTime: "16:00", location: "Salle de conférence SNE, Rabat", description: "Formation approfondie sur les droits syndicaux, conventions collectives, négociation et gestion des conflits individuels et collectifs.", status: "upcoming", participants: 28, mandatory: false, organizer: "Commission Juridique" },
  { id: "ev6", title: "Conférence de Presse — Bilan Social 2026", type: "action", date: "2026-06-08", time: "11:00", endTime: "12:30", location: "Maison de la Presse, Rabat", description: "Point de presse pour présenter le bilan social du syndicat, les avancées obtenues et les revendications pour l'année syndicale 2026-2027.", status: "upcoming", participants: 15, mandatory: false, organizer: "Bureau Communication" },
  { id: "ev7", title: "Atelier — Communication Syndicale Digitale", type: "formation", date: "2026-06-12", time: "14:00", endTime: "18:00", location: "Centre de Formation, Casablanca", description: "Atelier pratique sur les réseaux sociaux, la communication de crise, la rédaction de communiqués de presse et les outils numériques.", status: "upcoming", participants: 22, mandatory: false, organizer: "Commission Formation" },
  { id: "ev8", title: "Réunion Commission Juridique", type: "reunion_bureau", date: "2026-06-10", time: "14:00", endTime: "16:00", location: "Siège SNE, Rabat", description: "Révision des dossiers juridiques en cours, préparation des recours, analyse de la nouvelle réglementation sur le droit syndical.", status: "upcoming", participants: 6, mandatory: true, organizer: "Commission Juridique" },
  { id: "ev9", title: "Rassemblement National — Défense des Droits", type: "action", date: "2026-06-20", time: "10:00", endTime: "14:00", location: "Place du Parlement, Rabat", description: "Grande manifestation nationale pour la défense des droits acquis des travailleurs de l'éducation. Mobilisation intersyndicale nationale.", status: "upcoming", participants: 2000, mandatory: false, organizer: "Intersyndicale nationale" },
  { id: "ev10", title: "Séminaire — Finances & Trésorerie", type: "formation", date: "2026-07-03", time: "10:00", endTime: "17:00", location: "Hôtel Kenzi Tower, Casablanca", description: "Séminaire national destiné aux trésoriers et responsables financiers. Modules : comptabilité syndicale, audits, rapport financier annuel.", status: "upcoming", participants: 40, mandatory: false, organizer: "Commission Financière" },
  { id: "ev11", title: "Grève Sectorielle — 48 heures", type: "action", date: "2026-07-15", time: "07:00", location: "Secteur Education Nationale", description: "Action de grève de 48 heures reconductible en réponse au blocage des négociations salariales. Appel national à la mobilisation.", status: "upcoming", participants: 15000, mandatory: false, organizer: "Bureau National" },
  { id: "ev12", title: "Réunion Bureau Régional Casablanca", type: "reunion_bureau", date: "2026-07-08", time: "15:00", endTime: "17:00", location: "Section Casablanca", description: "Bilan du premier semestre 2026, préparation rentrée septembre, désignation délégués pour AG de septembre.", status: "upcoming", participants: 18, mandatory: true, organizer: "Bureau Régional Casa" },
  // Past events
  { id: "ev13", title: "Élection — Délégué Régional Fès", type: "election", date: "2026-05-10", time: "08:00", endTime: "18:00", location: "Section Fès", description: "Élection du délégué régional de la section de Fès. 3 candidats en lice pour 1 poste.", status: "completed", participants: 87, mandatory: false, organizer: "Commission Électorale" },
  { id: "ev14", title: "Réunion de section — Section Rabat", type: "meeting", date: "2026-05-18", time: "16:30", endTime: "18:00", location: "Lycée Hassan II, Rabat", description: "Réunion mensuelle de la section de Rabat. Points : bilan financier, suivi des dossiers membres, annonce des formations.", status: "completed", participants: 45, mandatory: false, organizer: "Délégué Rabat" },
];

type FilterType = "all" | EventType;
type ViewMode = "list" | "timeline";

export default function AgendaScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { meetings, elections } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [filter, setFilter] = useState<FilterType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selected, setSelected] = useState<AgendaEvent | null>(null);
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(false);

  const today = new Date();

  const dataEvents: AgendaEvent[] = [
    ...meetings.map((m) => ({
      id: m.id,
      title: m.title,
      type: "meeting" as EventType,
      date: m.date,
      time: m.time,
      location: m.location,
      description: m.description ?? "",
      status: new Date(m.date) >= today ? "upcoming" as const : "completed" as const,
      organizer: "Bureau",
    })),
    ...elections.map((e) => ({
      id: e.id,
      title: e.title,
      type: "election" as EventType,
      date: e.startDate,
      description: e.description ?? "",
      status: new Date(e.startDate) >= today ? "upcoming" as const : "completed" as const,
      organizer: "Commission Électorale",
    })),
  ];

  const allEvents = [...STATIC_EVENTS, ...dataEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const filtered = allEvents.filter((ev) => {
    const matchFilter = filter === "all" || ev.type === filter;
    const matchUpcoming = !showUpcomingOnly || ev.status === "upcoming" || ev.status === "today";
    return matchFilter && matchUpcoming;
  });

  // Group by month
  const grouped = filtered.reduce<Record<string, AgendaEvent[]>>((acc, ev) => {
    const d = new Date(ev.date);
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([title, data]) => ({ title, data }));

  const upcomingCount = allEvents.filter((ev) => ev.status === "upcoming").length;
  const thisWeekCount = allEvents.filter((ev) => {
    const evDate = new Date(ev.date);
    const diff = (evDate.getTime() - today.getTime()) / 86400000;
    return diff >= 0 && diff <= 7;
  }).length;

  const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "meeting", label: "Réunions" },
    { key: "election", label: "Élections" },
    { key: "formation", label: "Formations" },
    { key: "action", label: "Actions" },
    { key: "reunion_bureau", label: "Bureau" },
  ];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${DAY_NAMES_LONG[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  };

  const getDaysUntil = (dateStr: string) => {
    const diff = Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Demain";
    if (diff < 0) return `Il y a ${Math.abs(diff)}j`;
    return `Dans ${diff}j`;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Programme Syndical</Text>
            <Text style={styles.headerSub}>Agenda & Planning des événements</Text>
          </View>
          <TouchableOpacity
            style={styles.viewBtn}
            onPress={() => { setViewMode(viewMode === "list" ? "timeline" : "list"); Haptics.selectionAsync(); }}
          >
            <Feather name={viewMode === "list" ? "align-left" : "columns"} size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.viewBtn}
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Calendrier synchronisé", "L'agenda syndical a été ajouté à votre calendrier personnel."); }}
          >
            <Feather name="calendar" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          {[
            { icon: "calendar" as const, val: allEvents.length, label: "Événements", color: "#fff" },
            { icon: "clock" as const, val: upcomingCount, label: "À venir", color: "#fde68a" },
            { icon: "zap" as const, val: thisWeekCount, label: "Cette semaine", color: "#6ee7b7" },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Feather name={s.icon} size={13} color={s.color} />
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Quick filters row */}
      <View style={[styles.quickFilters, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.upcomingToggle, {
            backgroundColor: showUpcomingOnly ? colors.primary + "15" : colors.muted,
            borderColor: showUpcomingOnly ? colors.primary : colors.border,
          }]}
          onPress={() => { setShowUpcomingOnly(!showUpcomingOnly); Haptics.selectionAsync(); }}
        >
          <Feather name="clock" size={13} color={showUpcomingOnly ? colors.primary : colors.mutedForeground} />
          <Text style={[styles.upcomingToggleText, { color: showUpcomingOnly ? colors.primary : colors.mutedForeground }]}>À venir seulement</Text>
        </TouchableOpacity>
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.chipContent}
      >
        {FILTER_OPTIONS.map((opt) => {
          const cfg = opt.key !== "all" ? TYPE_CONFIG[opt.key as EventType] : null;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.chip, {
                backgroundColor: filter === opt.key ? (cfg?.color ?? colors.primary) : colors.muted,
              }]}
              onPress={() => { setFilter(opt.key); Haptics.selectionAsync(); }}
            >
              {cfg && <Feather name={cfg.icon} size={12} color={filter === opt.key ? "#fff" : colors.mutedForeground} />}
              <Text style={[styles.chipText, { color: filter === opt.key ? "#fff" : colors.mutedForeground }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="calendar" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Aucun événement trouvé</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <View style={[styles.sectionHeaderInner, { backgroundColor: colors.primary + "15" }]}>
              <Feather name="calendar" size={13} color={colors.primary} />
              <Text style={[styles.sectionHeaderText, { color: colors.primary }]}>{section.title}</Text>
              <View style={[styles.sectionCount, { backgroundColor: colors.primary }]}>
                <Text style={styles.sectionCountText}>{section.data.length}</Text>
              </View>
            </View>
          </View>
        )}
        renderItem={({ item: ev }) => {
          const typeCfg = TYPE_CONFIG[ev.type];
          const daysUntil = getDaysUntil(ev.date);
          const isCompleted = ev.status === "completed";
          const isPast = new Date(ev.date) < today;
          const isUrgent = !isPast && Math.ceil((new Date(ev.date).getTime() - today.getTime()) / 86400000) <= 3;

          return (
            <TouchableOpacity
              style={[styles.eventCard, {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: isCompleted ? 0.75 : 1,
              }]}
              onPress={() => { setSelected(ev); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              {/* Left timeline line */}
              <View style={[styles.timelineSide, { backgroundColor: typeCfg.color }]} />

              <View style={{ flex: 1, padding: 14, paddingLeft: 0, gap: 8 }}>
                {/* Top row */}
                <View style={styles.cardTop}>
                  <View style={[styles.typeIcon, { backgroundColor: typeCfg.color + "15" }]}>
                    <Feather name={typeCfg.icon} size={16} color={typeCfg.color} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.badgeRow}>
                      <View style={[styles.typeBadge, { backgroundColor: typeCfg.color + "15" }]}>
                        <Text style={[styles.typeBadgeText, { color: typeCfg.color }]}>{typeCfg.label}</Text>
                      </View>
                      {ev.mandatory && (
                        <View style={[styles.mandatoryBadge, { backgroundColor: "#ef444415" }]}>
                          <Feather name="alert-circle" size={10} color="#ef4444" />
                          <Text style={styles.mandatoryText}>Obligatoire</Text>
                        </View>
                      )}
                      {isCompleted && (
                        <View style={[styles.typeBadge, { backgroundColor: "#10b98115" }]}>
                          <Text style={[styles.typeBadgeText, { color: "#10b981" }]}>Terminé</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.eventTitle, { color: colors.foreground }]}>{ev.title}</Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[styles.daysUntil, { color: isUrgent ? "#ef4444" : isCompleted ? "#10b981" : colors.primary }]}>
                      {daysUntil}
                    </Text>
                    <View style={[styles.dateBubble, { backgroundColor: typeCfg.color + "10" }]}>
                      <Text style={[styles.dateBubbleText, { color: typeCfg.color }]}>
                        {new Date(ev.date).getDate()} {MONTH_NAMES[new Date(ev.date).getMonth()].slice(0, 3)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Meta */}
                <View style={styles.metaRow}>
                  {ev.time && (
                    <View style={styles.metaItem}>
                      <Feather name="clock" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                        {ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}
                      </Text>
                    </View>
                  )}
                  {ev.location && (
                    <View style={styles.metaItem}>
                      <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{ev.location}</Text>
                    </View>
                  )}
                  {ev.participants && (
                    <View style={styles.metaItem}>
                      <Feather name="users" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{ev.participants.toLocaleString()}</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.eventDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{ev.description}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (() => {
          const ev = selected;
          const typeCfg = TYPE_CONFIG[ev.type];
          const daysUntil = getDaysUntil(ev.date);
          const isPast = new Date(ev.date) < today;
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: typeCfg.color }]}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <View style={[styles.modalTypeBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                    <Feather name={typeCfg.icon} size={12} color="#fff" />
                    <Text style={styles.modalTypeBadgeText}>{typeCfg.label}</Text>
                  </View>
                  <Text style={styles.modalTitle}>{ev.title}</Text>
                </View>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
                {/* Date highlight */}
                <View style={[styles.dateHighlight, { backgroundColor: typeCfg.color + "10", borderColor: typeCfg.color + "30" }]}>
                  <View style={styles.dateHighlightLeft}>
                    <Text style={[styles.dateHighlightDay, { color: typeCfg.color }]}>{new Date(ev.date).getDate()}</Text>
                    <Text style={[styles.dateHighlightMonth, { color: typeCfg.color }]}>
                      {MONTH_NAMES[new Date(ev.date).getMonth()]} {new Date(ev.date).getFullYear()}
                    </Text>
                    <Text style={[styles.dateHighlightDow, { color: colors.mutedForeground }]}>{formatDate(ev.date)}</Text>
                  </View>
                  <View style={styles.dateHighlightRight}>
                    <Text style={[styles.countdownLabel, { color: typeCfg.color }]}>{daysUntil}</Text>
                    {ev.time && (
                      <View style={styles.timeRow}>
                        <Feather name="clock" size={14} color={typeCfg.color} />
                        <Text style={[styles.timeText, { color: typeCfg.color }]}>
                          {ev.time}{ev.endTime ? ` – ${ev.endTime}` : ""}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Info */}
                <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {[
                    ev.location && { icon: "map-pin" as const, label: "Lieu", value: ev.location },
                    ev.organizer && { icon: "briefcase" as const, label: "Organisateur", value: ev.organizer },
                    ev.participants && { icon: "users" as const, label: "Participants", value: `${ev.participants.toLocaleString()} personnes` },
                    { icon: "info" as const, label: "Statut", value: isPast ? "Terminé" : ev.mandatory ? "Obligatoire" : "Facultatif" },
                  ].filter(Boolean).map((item: any, i, arr) => (
                    <View key={item.label}>
                      {i > 0 && <View style={[styles.infoSep, { backgroundColor: colors.border }]} />}
                      <View style={styles.infoRow}>
                        <View style={[styles.infoIcon, { backgroundColor: typeCfg.color + "15" }]}>
                          <Feather name={item.icon} size={13} color={typeCfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                          <Text style={[styles.infoValue, { color: colors.foreground }]}>{item.value}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={[styles.descTitle, { color: colors.foreground }]}>Description</Text>
                  <Text style={[styles.descText, { color: colors.mutedForeground }]}>{ev.description}</Text>
                </View>

                <View style={styles.modalActions}>
                  {!isPast && (
                    <TouchableOpacity
                      style={[styles.modalActionBtn, { backgroundColor: typeCfg.color }]}
                      onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Participation confirmée", "Votre présence à cet événement a été enregistrée avec succès."); setSelected(null); }}
                    >
                      <Feather name="check" size={18} color="#fff" />
                      <Text style={styles.modalActionBtnText}>Confirmer ma participation</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.modalActionBtn, { backgroundColor: colors.muted }]}
                    onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("Ajouté au calendrier", "L'événement a été ajouté à votre calendrier personnel."); }}
                  >
                    <Feather name="calendar" size={18} color={colors.foreground} />
                    <Text style={[styles.modalActionBtnText, { color: colors.foreground }]}>Ajouter au calendrier</Text>
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  viewBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsStrip: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, padding: 12 },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  quickFilters: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  upcomingToggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  upcomingToggleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  chipBar: { flexShrink: 0, borderBottomWidth: 1 },
  chipContent: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexShrink: 0 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 8 },
  sectionHeaderInner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, alignSelf: "flex-start" },
  sectionHeaderText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  sectionCount: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  sectionCountText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  eventCard: { flexDirection: "row", marginHorizontal: 16, marginBottom: 10, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  timelineSide: { width: 4 },
  cardTop: { flexDirection: "row", gap: 10 },
  typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  mandatoryBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  mandatoryText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#ef4444" },
  eventTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  daysUntil: { fontSize: 11, fontFamily: "Inter_700Bold" },
  dateBubble: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  dateBubbleText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  eventDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  empty: { alignItems: "center", justifyContent: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { padding: 20, paddingTop: 50, flexDirection: "row", alignItems: "flex-start", gap: 14 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff", marginTop: 8, lineHeight: 24 },
  modalTypeBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: "flex-start" },
  modalTypeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  dateHighlight: { flexDirection: "row", padding: 20, borderRadius: 16, borderWidth: 1, alignItems: "center" },
  dateHighlightLeft: { flex: 1 },
  dateHighlightDay: { fontSize: 48, fontFamily: "Inter_700Bold", lineHeight: 54 },
  dateHighlightMonth: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  dateHighlightDow: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  dateHighlightRight: { alignItems: "flex-end", gap: 8 },
  countdownLabel: { fontSize: 16, fontFamily: "Inter_700Bold" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  infoSep: { height: 1, marginHorizontal: 14 },
  descTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  descText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  modalActions: { gap: 10 },
  modalActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, borderRadius: 14 },
  modalActionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
});
