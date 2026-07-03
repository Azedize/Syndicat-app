import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Member } from "@/context/DataContext";

interface MemberCardProps {
  member: Member;
  onPress?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  inactive: "#6b7280",
  pending: "#f59e0b",
};

const COTISATION_COLORS: Record<string, string> = {
  paid: "#10b981",
  pending: "#f59e0b",
  overdue: "#ef4444",
};

const COTISATION_LABELS: Record<string, string> = {
  paid: "Payée",
  pending: "En attente",
  overdue: "En retard",
};

export default function MemberCard({ member, onPress }: MemberCardProps) {
  const colors = useColors();
  const initials = member.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const statusColor = STATUS_COLORS[member.status] ?? "#6b7280";
  const cotColor = COTISATION_COLORS[member.cotisationStatus] ?? "#6b7280";
  const cotLabel = COTISATION_LABELS[member.cotisationStatus] ?? member.cotisationStatus;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
        <Text style={[styles.initials, { color: colors.primary }]}>{initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {member.name}
        </Text>
        <Text style={[styles.profession, { color: colors.mutedForeground }]} numberOfLines={1}>
          {member.profession}
        </Text>
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: statusColor + "18" }]}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {member.status === "active" ? "Actif" : member.status === "inactive" ? "Inactif" : "En attente"}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: cotColor + "18" }]}>
            <Text style={[styles.badgeText, { color: cotColor }]}>{cotLabel}</Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  profession: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  badges: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});
