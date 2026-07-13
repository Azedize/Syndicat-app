/**
 * Mon Bail & Loyer — Tenant lease information screen.
 *
 * Displays the current tenant's lease details fetched from
 * GET /locataires/my-lease (matched server-side by the tenant's account email).
 */
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { locataires, type ApiTenantLease } from "@/services/api";

interface InfoRowProps {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
}

function InfoRow({ label, value, icon, color = "#7c3aed" }: InfoRowProps) {
  const colors = useColors();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.infoIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Non renseignée";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatMAD(value: string | null): string {
  if (!value) return "— MAD";
  const n = Number(value);
  return isNaN(n) ? "— MAD" : `${n.toLocaleString("fr-FR")} MAD`;
}

export default function MonBailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [lease, setLease] = useState<ApiTenantLease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    locataires.myLease()
      .then((res) => { if (!cancelled) setLease(res.data); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Impossible de charger votre bail"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !lease) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mon Bail & Loyer</Text>
        </View>
        <View style={[styles.centered, { flex: 1, gap: 12, padding: 24 }]}>
          <Feather name="file-text" size={40} color={colors.mutedForeground} />
          <Text style={[styles.infoNoteText, { color: colors.mutedForeground, textAlign: "center" }]}>
            {error ?? "Aucun bail n'est encore associé à votre compte. Contactez votre syndic si vous pensez qu'il s'agit d'une erreur."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Mon Bail & Loyer</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Tenant identity card */}
        <View style={[styles.card, { backgroundColor: colors.primary }]}>
          <View style={styles.cardAvatar}>
            <Text style={styles.cardAvatarText}>
              {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{user?.name ?? "—"}</Text>
            <Text style={styles.cardRole}>Locataire</Text>
          </View>
          <View style={[styles.activeBadge]}>
            <Feather name={lease.status === "active" ? "check-circle" : "clock"} size={12} color="#fff" />
            <Text style={styles.activeBadgeText}>
              {lease.status === "active" ? "Actif" : lease.status === "pending" ? "En attente" : lease.status === "expired" ? "Expiré" : lease.status ?? "—"}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>INFORMATIONS DU BAIL</Text>
          <InfoRow label="Type de bail" value="Location résidentielle" icon="file-text" color="#3b82f6" />
          <InfoRow label="Date de début" value={formatDate(lease.leaseStart)} icon="calendar" color="#10b981" />
          <InfoRow label="Date de fin" value={formatDate(lease.leaseEnd)} icon="calendar" color="#f59e0b" />
          <InfoRow label="Loyer mensuel" value={formatMAD(lease.monthlyRent)} icon="credit-card" color="#7c3aed" />
          <InfoRow label="Caution versée" value={formatMAD(lease.depositAmount)} icon="shield" color="#6366f1" />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>APPARTEMENT</Text>
          <InfoRow label="Résidence" value={lease.buildingName ?? "Non renseignée"} icon="home" color="#7c3aed" />
          <InfoRow label="Numéro de lot" value={lease.lotNumber ?? "Non renseigné"} icon="grid" color="#3b82f6" />
          <InfoRow label="Étage" value={lease.floor != null ? String(lease.floor) : "Non renseigné"} icon="layers" color="#10b981" />
        </View>

        {(lease.emergencyContact || lease.emergencyPhone) && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CONTACT D'URGENCE</Text>
            <InfoRow label="Nom" value={lease.emergencyContact ?? "—"} icon="user" color="#ef4444" />
            <InfoRow label="Téléphone" value={lease.emergencyPhone ?? "—"} icon="phone" color="#ef4444" />
          </View>
        )}

        <View style={[styles.infoNote, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="info" size={14} color={colors.primary} />
          <Text style={[styles.infoNoteText, { color: colors.mutedForeground }]}>
            Pour toute question concernant votre bail, contactez votre syndic via le chat ou ouvrez une demande d'intervention.
          </Text>
        </View>

        {/* Quick actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/chat" as any)}
            activeOpacity={0.82}
          >
            <Feather name="message-circle" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Contacter le Syndic</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => router.push("/documents" as any)}
            activeOpacity={0.82}
          >
            <Feather name="folder" size={16} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Mes Documents</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center" },
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
  card: {
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  cardAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  cardName: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  cardRole: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  activeBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
