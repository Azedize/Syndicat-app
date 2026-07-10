/**
 * État des Lieux — Tenant property inspection record screen.
 *
 * Displays entry/exit inspection reports linked to the tenant's lot.
 * Phase 9: Placeholder pending /tenants/:id/etat-des-lieux API endpoint.
 */
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface InspectionCardProps {
  type: "entrée" | "sortie";
  date: string;
  status: "conforme" | "réserves" | "en_attente";
  color: string;
}

function InspectionCard({ type, date, status, color }: InspectionCardProps) {
  const colors = useColors();
  const statusLabel = status === "conforme" ? "Conforme" : status === "réserves" ? "Avec réserves" : "En attente";
  const statusColor = status === "conforme" ? "#10b981" : status === "réserves" ? "#f59e0b" : "#6b7280";
  return (
    <View style={[styles.inspCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.inspIcon, { backgroundColor: color + "18" }]}>
        <Feather name={type === "entrée" ? "log-in" : "log-out"} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.inspTitle, { color: colors.foreground }]}>État des lieux d'{type}</Text>
        <Text style={[styles.inspDate, { color: colors.mutedForeground }]}>{date}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusColor + "18" }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

export default function EtatDesLieuxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>État des Lieux</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: colors.primary }]}>
          <Feather name="clipboard" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Inspection de votre logement</Text>
            <Text style={styles.bannerSubtitle}>
              Les états des lieux documentent l'état de votre appartement à l'entrée et à la sortie du bail.
            </Text>
          </View>
        </View>

        {/* Placeholder inspection cards */}
        <View style={{ gap: 10 }}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HISTORIQUE</Text>
          <InspectionCard type="entrée" date="À compléter" status="en_attente" color="#3b82f6" />
          <InspectionCard type="sortie" date="—" status="en_attente" color="#f59e0b" />
        </View>

        <View style={[styles.infoNote, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.primary} />
          <Text style={[styles.infoNoteText, { color: colors.mutedForeground }]}>
            Votre syndic complétera les détails de l'état des lieux. Pour toute contestation,
            contactez-le directement via le chat ou signalez un incident.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/sinistres" as any)}
            activeOpacity={0.82}
          >
            <Feather name="alert-triangle" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Signaler un Incident</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => router.push("/chat" as any)}
            activeOpacity={0.82}
          >
            <Feather name="message-circle" size={16} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Contacter le Syndic</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  body: { padding: 16, gap: 16 },
  infoBanner: {
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  bannerTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff", marginBottom: 4 },
  bannerSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", lineHeight: 18 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  inspCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  inspIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  inspTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inspDate: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  infoNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  actions: { gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
