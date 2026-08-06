import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useData } from "@/context/DataContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

type FilterType = "all" | "meeting" | "election" | "cotisation";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: FilterType;
  status: string;
  location?: string;
  description?: string;
  color: string;
  icon: keyof typeof Feather.glyphMap;
}

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { meetings, elections, cotisations } = useData();
  const { isWide } = useBreakpoints();
  const { t } = useLanguage();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [filter, setFilter] = useState<FilterType>("all");

  const TYPE_COLORS: Record<FilterType, string> = {
    all: colors.primary,
    meeting: "#3b82f6",
    election: "#f59e0b",
    cotisation: "#10b981",
  };

  const allEvents: CalendarEvent[] = [
    ...meetings.map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      time: m.time,
      type: "meeting" as FilterType,
      status: m.status,
      location: m.location,
      description: m.description,
      color: "#3b82f6",
      icon: "calendar" as const,
    })),
    ...elections.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.startDate,
      type: "election" as FilterType,
      status: e.status,
      description: e.description,
      color: "#f59e0b",
      icon: "check-square" as const,
    })),
    ...cotisations
      .filter((c) => c.status !== "paid")
      .map((c) => ({
        id: c.id,
        title: c.label,
        date: c.dueDate,
        type: "cotisation" as FilterType,
        status: c.status,
        description: `Échéance: ${c.dueDate} — ${c.amount} MAD`,
        color: "#10b981",
        icon: "credit-card" as const,
      })),
  ];

  const filteredEvents = filter === "all" ? allEvents : allEvents.filter((e) => e.type === filter);

  const eventsForDay = (day: number) =>
    filteredEvents.filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth && d.getDate() === day;
    });

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : [];

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const prevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDay(null);
  };

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    scheduled: { label: t("calStatusScheduled"), color: "#3b82f6" },
    completed: { label: t("calStatusCompleted"), color: "#10b981" },
    cancelled: { label: t("calStatusCancelled"), color: "#ef4444" },
    open: { label: t("calStatusOpen"), color: "#f59e0b" },
    upcoming: { label: t("calStatusUpcoming"), color: "#6366f1" },
    closed: { label: t("calStatusClosed"), color: "#6b7280" },
    pending: { label: t("calStatusPending"), color: "#f59e0b" },
    overdue: { label: t("calStatusOverdue"), color: "#ef4444" },
    paid: { label: t("calStatusPaid"), color: "#10b981" },
  };

  const upcomingEvents = filteredEvents
    .filter((e) => new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("calTitle")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {allEvents.length} {t("calEventsCount")}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {(["all", "meeting", "election", "cotisation"] as FilterType[]).map((f) => {
            const labels: Record<FilterType, string> = { all: t("calFilterAll"), meeting: t("calFilterMeetings"), election: t("calFilterElections"), cotisation: t("calFilterCotisations") };
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, {
                  backgroundColor: filter === f ? TYPE_COLORS[f] : colors.muted,
                }]}
                onPress={() => { setFilter(f); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.filterText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>
                  {labels[f]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Month navigator */}
        <View style={[styles.monthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity onPress={prevMonth} style={styles.monthBtn}>
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.foreground }]}>
            {[t("calMonthJan"),t("calMonthFeb"),t("calMonthMar"),t("calMonthApr"),t("calMonthMay"),t("calMonthJun"),t("calMonthJul"),t("calMonthAug"),t("calMonthSep"),t("calMonthOct"),t("calMonthNov"),t("calMonthDec")][currentMonth]} {currentYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.monthBtn}>
            <Feather name="chevron-right" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Day names */}
        <View style={[styles.dayNames, { backgroundColor: colors.card }]}>
          {DAY_NAMES.map((d) => (
            <Text key={d} style={[styles.dayName, { color: colors.mutedForeground }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={[styles.grid, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.gridCell} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dayEvents = eventsForDay(day);
            const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
            const isSelected = day === selectedDay;
            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.gridCell,
                  isSelected && { backgroundColor: colors.primary + "20" },
                  isToday && { borderRadius: 10, borderColor: colors.primary, borderWidth: 1.5 },
                ]}
                onPress={() => { setSelectedDay(day); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[
                  styles.dayNum,
                  { color: isToday ? colors.primary : colors.foreground },
                  isToday && { fontFamily: "Inter_700Bold" },
                ]}>
                  {day}
                </Text>
                {dayEvents.length > 0 && (
                  <View style={styles.eventDots}>
                    {dayEvents.slice(0, 3).map((ev, idx) => (
                      <View key={idx} style={[styles.eventDot, { backgroundColor: ev.color }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected day events */}
        {selectedDay !== null && (
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {selectedDay} {[t("calMonthJan"),t("calMonthFeb"),t("calMonthMar"),t("calMonthApr"),t("calMonthMay"),t("calMonthJun"),t("calMonthJul"),t("calMonthAug"),t("calMonthSep"),t("calMonthOct"),t("calMonthNov"),t("calMonthDec")][currentMonth]} {currentYear}
              {selectedDayEvents.length === 0 && ` ${t("calNoEventsDay")}`}
            </Text>
            {selectedDayEvents.map((ev) => (
              <View key={ev.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: ev.color }]}>
                <View style={[styles.eventIconBox, { backgroundColor: ev.color + "18" }]}>
                  <Feather name={ev.icon} size={18} color={ev.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: colors.foreground }]}>{ev.title}</Text>
                  {ev.location && (
                    <View style={styles.eventMeta}>
                      <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.eventMetaText, { color: colors.mutedForeground }]}>{ev.location}</Text>
                    </View>
                  )}
                  {ev.time && (
                    <View style={styles.eventMeta}>
                      <Feather name="clock" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.eventMetaText, { color: colors.mutedForeground }]}>{ev.time}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_CONFIG[ev.status]?.color ?? "#6b7280") + "18" }]}>
                  <Text style={[styles.statusText, { color: STATUS_CONFIG[ev.status]?.color ?? "#6b7280" }]}>
                    {STATUS_CONFIG[ev.status]?.label ?? ev.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Upcoming events */}
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("calUpcomingSection")}</Text>
          {upcomingEvents.length === 0 ? (
            <Text style={[styles.noEvents, { color: colors.mutedForeground }]}>{t("calNoEventsUpcoming")}</Text>
          ) : (
            upcomingEvents.map((ev) => {
              const monthNames = [t("calMonthJan"),t("calMonthFeb"),t("calMonthMar"),t("calMonthApr"),t("calMonthMay"),t("calMonthJun"),t("calMonthJul"),t("calMonthAug"),t("calMonthSep"),t("calMonthOct"),t("calMonthNov"),t("calMonthDec")];
              const d = new Date(ev.date);
              const dayStr = `${d.getDate()} ${monthNames[d.getMonth()].slice(0, 3)}`;
              return (
                <View key={ev.id} style={[styles.upcomingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.upcomingDate, { backgroundColor: ev.color + "15" }]}>
                    <Text style={[styles.upcomingDateText, { color: ev.color }]}>{dayStr}</Text>
                  </View>
                  <View style={[styles.upcomingDot, { backgroundColor: ev.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.upcomingTitle, { color: colors.foreground }]} numberOfLines={1}>{ev.title}</Text>
                    <Text style={[styles.upcomingType, { color: colors.mutedForeground }]}>
                      {{ meeting: t("calTypeReunion"), election: t("calTypeElection"), cotisation: t("calTypeCotisation"), all: "" }[ev.type]}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexShrink: 0 },
  filterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 16, borderRadius: 14, padding: 12, borderWidth: 1, marginBottom: 8 },
  monthBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  dayNames: { flexDirection: "row", paddingHorizontal: 16 },
  dayName: { flex: 1, textAlign: "center", fontSize: 11, fontFamily: "Inter_600SemiBold", paddingVertical: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 16, borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  gridCell: { width: "14.285714%", alignItems: "center", paddingVertical: 6, gap: 2 },
  dayNum: { fontSize: 13, fontFamily: "Inter_500Medium" },
  eventDots: { flexDirection: "row", gap: 2 },
  eventDot: { width: 5, height: 5, borderRadius: 3 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 4 },
  eventCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4 },
  eventIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  eventMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  noEvents: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 16 },
  upcomingCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  upcomingDate: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignItems: "center" },
  upcomingDateText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  upcomingDot: { width: 8, height: 8, borderRadius: 4 },
  upcomingTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  upcomingType: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});
