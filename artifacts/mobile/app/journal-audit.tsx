import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RoleGuard from "@/components/RoleGuard";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { getToken } from "@/services/api";

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  syndicateId?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  createdAt: string;
}

const ACTION_CONFIG: Record<string, { color: string; icon: keyof typeof Feather.glyphMap }> = {
  vote: { color: "#f59e0b", icon: "check-square" },
  pay_cotisation: { color: "#10b981", icon: "credit-card" },
  approve_member: { color: "#10b981", icon: "user-check" },
  reject_member: { color: "#ef4444", icon: "user-x" },
  create_election: { color: "#7c3aed", icon: "layers" },
  add_member: { color: "#3b82f6", icon: "user-plus" },
  add_transaction: { color: "#10b981", icon: "dollar-sign" },
  validate_product: { color: "#10b981", icon: "package" },
  resolve_ticket: { color: "#6366f1", icon: "check-circle" },
  login: { color: "#3b82f6", icon: "log-in" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { color: "#6b7280", icon: "activity" as const };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    vote: "Vote enregistré",
    pay_cotisation: "Cotisation payée",
    approve_member: "Membre approuvé",
    reject_member: "Membre rejeté",
    create_election: "Élection créée",
    add_member: "Membre ajouté",
    add_transaction: "Transaction ajoutée",
    validate_product: "Produit validé",
    resolve_ticket: "Ticket résolu",
    login: "Connexion",
  };
  return labels[action] ?? action.replace(/_/g, " ");
}

const ENTITY_FILTERS = ["Tous", "élection", "membre", "cotisation", "transaction", "produit"];

export default function JournalAuditScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <JournalAuditScreenInner />
    </RoleGuard>
  );
}

function JournalAuditScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entityFilter, setEntityFilter] = useState("Tous");
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      setError("");
      const token = await getToken();
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;
      const resp = await fetch(`${baseUrl}/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setLogs(data.data ?? []);
    } catch (e: any) {
      setError("Impossible de charger les journaux — " + (e.message ?? "erreur réseau"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const onRefresh = () => { setRefreshing(true); fetchLogs(); };

  const filtered = entityFilter === "Tous"
    ? logs
    : logs.filter((l) => l.entity.toLowerCase().includes(entityFilter.toLowerCase()));

  const isSuperAdmin = user?.role === "super_admin";
  const isSyndicateAdmin = user?.role === "syndicate_admin";

  if (!isSuperAdmin && !isSyndicateAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={22} color="#fff" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Journal d'Audit</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>Accès réservé aux administrateurs</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Journal d'Audit</Text>
          <Text style={styles.headerSub}>{filtered.length} entrée(s) — {isSuperAdmin ? "Plateforme globale" : "Votre syndicat"}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRefresh(); }}
          style={styles.refreshBtn}
        >
          <Feather name="refresh-cw" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Entity filter pills */}
      <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={ENTITY_FILTERS}
          keyExtractor={(k) => k}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
          renderItem={({ item }) => {
            const active = entityFilter === item;
            return (
              <TouchableOpacity
                style={[styles.filterChip, { backgroundColor: active ? colors.primary : colors.background, borderColor: active ? colors.primary : colors.border }]}
                onPress={() => { setEntityFilter(item); Haptics.selectionAsync(); }}
              >
                <Text style={[styles.filterLabel, { color: active ? "#fff" : colors.mutedForeground }]}>{item.charAt(0).toUpperCase() + item.slice(1)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Chargement des journaux...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setLoading(true); fetchLogs(); }}
          >
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="shield" size={44} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune entrée</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Le journal d'audit est vide pour ce filtre.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
          renderItem={({ item: log }) => {
            const cfg = getActionConfig(log.action);
            return (
              <View style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: cfg.color }]}>
                <View style={[styles.logIcon, { backgroundColor: cfg.color + "18" }]}>
                  <Feather name={cfg.icon} size={16} color={cfg.color} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={[styles.actionLabel, { color: colors.foreground }]}>{actionLabel(log.action)}</Text>
                    <View style={[styles.entityBadge, { backgroundColor: cfg.color + "15" }]}>
                      <Text style={[styles.entityText, { color: cfg.color }]}>{log.entity}</Text>
                    </View>
                  </View>
                  <Text style={[styles.userName, { color: colors.mutedForeground }]}>
                    <Feather name="user" size={10} color={colors.mutedForeground} /> {log.userName}
                    {log.syndicateId ? ` • Syndicat ${log.syndicateId.slice(0, 8)}` : ""}
                  </Text>
                  {log.details ? (
                    <Text style={[styles.details, { color: colors.mutedForeground }]} numberOfLines={2}>{log.details}</Text>
                  ) : null}
                </View>
                <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatDate(log.createdAt)}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },
  refreshBtn: { padding: 6 },
  filterRow: { borderBottomWidth: 1 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  logCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  actionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  entityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  entityText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 11, fontFamily: "Inter_400Regular" },
  details: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  timestamp: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "right", minWidth: 70 },
});
