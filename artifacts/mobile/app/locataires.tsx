import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";
import RoleGuard from "@/components/RoleGuard";

type Tenant = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  lotId: string;
  lotNumber?: string;
  buildingId: string;
  buildingName?: string;
  leaseStart?: string;
  leaseEnd?: string;
  monthlyRent?: number;
  depositAmount?: number;
  status: "active" | "expired" | "pending";
  notes?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  createdAt?: string;
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: keyof typeof Feather.glyphMap }> = {
  active:  { color: "#10b981", label: "Actif",       icon: "check-circle" },
  expired: { color: "#ef4444", label: "Expiré",      icon: "alert-circle" },
  pending: { color: "#f59e0b", label: "En attente",  icon: "clock" },
};

export default function LocatairesScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin"]}>
      <LocatairesScreenInner />
    </RoleGuard>
  );
}

function LocatairesScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "", email: "", phone: "", lotId: "",
    leaseStart: "", leaseEnd: "", monthlyRent: "",
    depositAmount: "", emergencyContact: "", emergencyPhone: "", notes: "",
  });

  // President and secretary manage tenant relations (lease reviews, notices).
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "president" || user?.role === "secretary";

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const data = await apiRequest(`/locataires${qs}`, "GET", undefined, token);
      setTenants(data.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      setSubmitting(true);
      await apiRequest("/locataires", "POST", {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        lotId: form.lotId.trim() || undefined,
        leaseStart: form.leaseStart || undefined,
        leaseEnd: form.leaseEnd || undefined,
        monthlyRent: form.monthlyRent ? parseFloat(form.monthlyRent) : undefined,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
        emergencyContact: form.emergencyContact.trim() || undefined,
        emergencyPhone: form.emergencyPhone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }, token);
      setShowAdd(false);
      setForm({ name: "", email: "", phone: "", lotId: "", leaseStart: "", leaseEnd: "", monthlyRent: "", depositAmount: "", emergencyContact: "", emergencyPhone: "", notes: "" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible d'ajouter le locataire" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: Tenant["status"]) => {
    try {
      await apiRequest(`/locataires/${id}`, "PUT", { status }, token);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible de mettre à jour" });
    }
  };

  const filtered = tenants.filter((t) => {
    const matchSearch = !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (t.lotNumber ?? "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || t.status === filter;
    return matchSearch && matchFilter;
  });

  const FILTERS = [
    { key: "all", label: "Tous" },
    { key: "active", label: "Actifs" },
    { key: "pending", label: "En attente" },
    { key: "expired", label: "Expirés" },
  ];

  const activeCount = tenants.filter((t) => t.status === "active").length;
  const expiringCount = tenants.filter((t) => {
    if (!t.leaseEnd) return false;
    const daysLeft = Math.ceil((new Date(t.leaseEnd).getTime() - Date.now()) / 86400000);
    return daysLeft <= 30 && daysLeft >= 0;
  }).length;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title="Locataires"
        subtitle={`${tenants.length} locataire(s) enregistré(s)`}
        color="#06b6d4"
        stats={[
          { label: "Actifs",          value: activeCount,    color: "#10b981" },
          { label: "Expirant bientôt",value: expiringCount, color: "#f59e0b" },
          { label: "Total",           value: tenants.length, color: "#06b6d4" },
        ]}
        action={isAdmin ? { icon: "plus", onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); } } : undefined}
      />

      <View style={[s.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder="Nom, email, lot..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search ? <TouchableOpacity onPress={() => setSearch("")}><Feather name="x" size={15} color={colors.mutedForeground} /></TouchableOpacity> : null}
        </View>
      </View>

      <FilterChips
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        accentColor="#06b6d4"
      />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#06b6d4" size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="user-check" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Aucun locataire trouvé</Text>
            </View>
          }
          renderItem={({ item: t }) => {
            const sc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.pending;
            const daysLeft = t.leaseEnd
              ? Math.ceil((new Date(t.leaseEnd).getTime() - Date.now()) / 86400000)
              : null;
            const isExpiring = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;

            return (
              <TouchableOpacity
                style={[s.card, { backgroundColor: colors.card, borderColor: isExpiring ? "#f59e0b40" : colors.border, borderLeftWidth: isExpiring ? 4 : 1, borderLeftColor: isExpiring ? "#f59e0b" : colors.border }]}
                onPress={() => setSelected(t)}
                activeOpacity={0.8}
              >
                <View style={s.cardTop}>
                  <View style={[s.avatar, { backgroundColor: "#06b6d418" }]}>
                    <Text style={[s.avatarText, { color: "#06b6d4" }]}>
                      {t.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.name, { color: colors.foreground }]}>{t.name}</Text>
                    {t.email ? <Text style={[s.meta, { color: colors.mutedForeground }]}>{t.email}</Text> : null}
                    {t.lotNumber ? (
                      <View style={s.lotRow}>
                        <Feather name="home" size={11} color={colors.mutedForeground} />
                        <Text style={[s.meta, { color: colors.mutedForeground }]}>Lot {t.lotNumber}</Text>
                        {t.buildingName ? <Text style={[s.meta, { color: colors.mutedForeground }]}>• {t.buildingName}</Text> : null}
                      </View>
                    ) : null}
                    {t.leaseEnd ? (
                      <Text style={[s.meta, { color: isExpiring ? "#f59e0b" : colors.mutedForeground }]}>
                        Bail jusqu'au {t.leaseEnd}{isExpiring ? ` (${daysLeft}j)` : ""}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={[s.badge, { backgroundColor: sc.color + "18" }]}>
                      <Feather name={sc.icon} size={10} color={sc.color} />
                      <Text style={[s.badgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                    {t.monthlyRent ? (
                      <Text style={[s.rent, { color: colors.foreground }]}>{t.monthlyRent.toLocaleString("fr-MA")} MAD/m</Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={[s.modal, { backgroundColor: colors.background }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.modalTitle, { color: colors.foreground }]} numberOfLines={1}>{selected.name}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
              <View style={[s.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {[
                  { label: "Email", value: selected.email ?? "—" },
                  { label: "Téléphone", value: selected.phone ?? "—" },
                  { label: "Lot", value: selected.lotNumber ? `Lot ${selected.lotNumber}` : "—" },
                  { label: "Immeuble", value: selected.buildingName ?? "—" },
                  { label: "Début du bail", value: selected.leaseStart ?? "—" },
                  { label: "Fin du bail", value: selected.leaseEnd ?? "—" },
                  { label: "Loyer mensuel", value: selected.monthlyRent ? `${selected.monthlyRent.toLocaleString("fr-MA")} MAD` : "—" },
                  { label: "Dépôt de garantie", value: selected.depositAmount ? `${selected.depositAmount.toLocaleString("fr-MA")} MAD` : "—" },
                  { label: "Contact urgence", value: selected.emergencyContact ?? "—" },
                  { label: "Tel. urgence", value: selected.emergencyPhone ?? "—" },
                  { label: "Statut", value: STATUS_CONFIG[selected.status]?.label ?? selected.status },
                  { label: "Notes", value: selected.notes ?? "—" },
                ].map((row, i) => (
                  <View key={row.label}>
                    {i > 0 && <View style={[s.sep, { backgroundColor: colors.border }]} />}
                    <View style={s.detailRow}>
                      <Text style={[s.detailLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
                      <Text style={[s.detailValue, { color: colors.foreground }]} numberOfLines={2}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {isAdmin && (
                <View style={s.actionsRow}>
                  {(["active", "pending", "expired"] as Tenant["status"][]).map((st) => {
                    if (st === selected.status) return null;
                    const c = STATUS_CONFIG[st];
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[s.actionBtn, { backgroundColor: c.color + "15", borderColor: c.color + "30" }]}
                        onPress={() => { handleStatusChange(selected.id, st); setSelected(null); }}
                      >
                        <Feather name={c.icon} size={14} color={c.color} />
                        <Text style={[s.actionBtnText, { color: c.color }]}>Marquer {c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>Nouveau locataire</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {[
              { label: "Nom complet *", key: "name" as const, placeholder: "Mohammed Benali" },
              { label: "Email", key: "email" as const, placeholder: "m.benali@email.com" },
              { label: "Téléphone", key: "phone" as const, placeholder: "+212 6XX XXX XXX" },
              { label: "ID du Lot", key: "lotId" as const, placeholder: "ID du lot occupé" },
              { label: "Début du bail (AAAA-MM-JJ)", key: "leaseStart" as const, placeholder: "2025-01-01" },
              { label: "Fin du bail (AAAA-MM-JJ)", key: "leaseEnd" as const, placeholder: "2026-01-01" },
              { label: "Loyer mensuel (MAD)", key: "monthlyRent" as const, placeholder: "5000" },
              { label: "Dépôt de garantie (MAD)", key: "depositAmount" as const, placeholder: "10000" },
              { label: "Contact d'urgence", key: "emergencyContact" as const, placeholder: "Nom du contact" },
              { label: "Téléphone d'urgence", key: "emergencyPhone" as const, placeholder: "+212 6XX XXX XXX" },
              { label: "Notes", key: "notes" as const, placeholder: "Informations complémentaires..." },
            ].map((field) => (
              <View key={field.key} style={{ gap: 6 }}>
                <Text style={[s.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
                <TextInput
                  style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={form[field.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [field.key]: v }))}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={["monthlyRent", "depositAmount"].includes(field.key) ? "numeric" : "default"}
                  multiline={field.key === "notes"}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: form.name.trim() ? "#06b6d4" : colors.muted, opacity: submitting ? 0.7 : 1 }]}
              onPress={handleAdd}
              disabled={!form.name.trim() || submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Feather name="user-check" size={16} color="#fff" /><Text style={s.submitText}>Enregistrer le locataire</Text></>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  searchRow: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  card: { borderRadius: 16, borderWidth: 1, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  name: { fontSize: 15, fontFamily: "Inter_700Bold" },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  lotRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  rent: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  detailCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", paddingHorizontal: 16 },
  sep: { height: StyleSheet.hairlineWidth },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, gap: 12 },
  detailLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1.5, textAlign: "right" },
  actionsRow: { gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, padding: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
