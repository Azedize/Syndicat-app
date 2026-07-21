import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface SyndicateCardData {
  id: string;
  name: string;
  abbreviation?: string | null;
  legalForm?: string | null;
  city?: string | null;
  region?: string | null;
  registrationNumber?: string | null;
  buildingsCount?: number;
  membersCount?: number;
  status: "healthy" | "warning" | "critical" | "active" | "inactive";
  createdAt?: string | null;
  logoColor?: string | null;
  logoUrl?: string | null;
  adminName?: string | null;
}

const HEALTH_CONFIG = {
  healthy: { label: "Sain", color: "#10b981", bg: "#10b98118", icon: "check-circle" as const },
  warning: { label: "Attention", color: "#f59e0b", bg: "#f59e0b18", icon: "alert-triangle" as const },
  critical: { label: "Critique", color: "#ef4444", bg: "#ef444418", icon: "alert-circle" as const },
  active: { label: "Actif", color: "#10b981", bg: "#10b98118", icon: "check-circle" as const },
  inactive: { label: "Inactif", color: "#9ca3af", bg: "#9ca3af18", icon: "minus-circle" as const },
};

interface SyndicateCardProps {
  data: SyndicateCardData;
  onPress?: () => void;
}

export default function SyndicateCard({ data, onPress }: SyndicateCardProps) {
  const colors = useColors();
  const statusKey = data.status in HEALTH_CONFIG ? data.status : "active";
  const hc = HEALTH_CONFIG[statusKey as keyof typeof HEALTH_CONFIG];
  const logoColor = data.logoColor ?? "#2563EB";
  const abbr = data.abbreviation ?? data.name.slice(0, 3).toUpperCase();

  const formattedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString("fr-MA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor:
            data.status === "critical"
              ? "#ef444440"
              : data.status === "warning"
              ? "#f59e0b30"
              : colors.border,
        },
      ]}
      onPress={() => {
        if (onPress) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      activeOpacity={0.8}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={[styles.logo, { backgroundColor: data.logoUrl ? "transparent" : logoColor }]}>
          {data.logoUrl ? (
            <Image source={{ uri: data.logoUrl }} style={styles.logoImg} />
          ) : (
            <Text style={styles.logoText}>{abbr}</Text>
          )}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
            {data.name}
          </Text>
          {data.legalForm ? (
            <Text style={[styles.legalForm, { color: colors.primary }]} numberOfLines={1}>
              {data.legalForm}
            </Text>
          ) : null}
          {data.city || data.region ? (
            <Text style={[styles.location, { color: colors.mutedForeground }]} numberOfLines={1}>
              <Feather name="map-pin" size={10} color={colors.mutedForeground} />
              {" "}
              {[data.city, data.region].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </View>
        <View style={[styles.badge, { backgroundColor: hc.bg }]}>
          <Feather name={hc.icon} size={11} color={hc.color} />
          <Text style={[styles.badgeText, { color: hc.color }]}>{hc.label}</Text>
        </View>
      </View>

      {/* Metrics row */}
      <View style={[styles.metricsRow, { borderColor: colors.border }]}>
        {[
          {
            icon: "home" as const,
            label: "Immeubles",
            value: (data.buildingsCount ?? 0).toString(),
            color: "#3b82f6",
          },
          {
            icon: "users" as const,
            label: "Membres",
            value: (data.membersCount ?? 0).toLocaleString(),
            color: colors.primary,
          },
          {
            icon: "hash" as const,
            label: "N° Enreg.",
            value: data.registrationNumber ? data.registrationNumber.slice(0, 12) : "—",
            color: colors.foreground,
          },
        ].map((m, i, arr) => (
          <View
            key={m.label}
            style={[
              styles.metricCell,
              i < arr.length - 1 ? { borderRightWidth: 1, borderRightColor: colors.border } : null,
            ]}
          >
            <View style={[styles.metricIcon, { backgroundColor: m.color + "18" }]}>
              <Feather name={m.icon} size={12} color={m.color} />
            </View>
            <Text style={[styles.metricVal, { color: m.color }]} numberOfLines={1}>
              {m.value}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* Footer row */}
      <View style={styles.footer}>
        {data.adminName ? (
          <>
            <Feather name="user" size={11} color={colors.mutedForeground} />
            <Text style={[styles.footerText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {data.adminName}
            </Text>
          </>
        ) : null}
        {formattedDate ? (
          <>
            {data.adminName ? (
              <Text style={[styles.footerDot, { color: colors.mutedForeground }]}>·</Text>
            ) : null}
            <Feather name="calendar" size={11} color={colors.mutedForeground} />
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>{formattedDate}</Text>
          </>
        ) : null}
        <View style={{ flex: 1 }} />
        <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  logoImg: { width: 46, height: 46, borderRadius: 14 },
  logoText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  name: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  legalForm: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  location: { fontSize: 10, fontFamily: "Inter_400Regular" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    flexShrink: 0,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  metricsRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  metricCell: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 3 },
  metricIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  metricVal: { fontSize: 12, fontFamily: "Inter_700Bold" },
  metricLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  footer: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  footerDot: { fontSize: 11 },
});
