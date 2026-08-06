import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useLanguage } from "@/context/LanguageContext";
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

const STATUS_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  active:  "check-circle",
  expired: "alert-circle",
  pending: "clock",
};

const STATUS_COLORS: Record<string, string> = {
  active:  "#10b981",
  expired: "#ef4444",
  pending: "#f59e0b",
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
  const { t } = useLanguage();
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
      showToast({ type: "error", title: t("error"), message: e.message ?? t("errorGeneric") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: Tenant["status"]) => {
    try {
      await apiRequest(`/locataires/${id}`, "PUT", { status }, token);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: t("error"), message: e.message ?? t("errorGeneric") });
    }
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      active:  t("statusActive"),
      expired: t("statusExpired"),
      pending: t("statusPending"),
    };
    return map[status] ?? status;
  };

  const filtered = tenants.filter((ten) => {
    const matchSearch = !search ||
      ten.name.toLowerCase().includes(search.toLowerCase()) ||
      (ten.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (ten.lotNumber ?? "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || ten.status === filter;
    return matchSearch && matchFilter;
  });

  const FILTERS = [
    { key: "all",     label: t("all") },
    { key: "active",  label: t("statusActive") },
    { key: "pending", label: t("statusPending") },
    { key: "expired", label: t("statusExpired") },
  ];

  const activeCount   = tenants.filter((ten) => ten.status === "active").length;
  const expiringCount = tenants.filter((ten) => {
    if (!ten.leaseEnd) return false;
    const daysLeft = Math.ceil((new Date(ten.leaseEnd).getTime() - Date.now()) / 86400000);
    return daysLeft <= 30 && daysLeft >= 0;
  }).length;

  // Skeleton loading card
  const SkeletonCard = () => (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.cardTop}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.secondary }} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ height: 14, width: "55%", backgroundColor: colors.secondary, borderRadius: 7 }} />
          <View style={{ height: 11, width: "70%", backgroundColor: colors.secondary, borderRadius: 6 }} />
          <View style={{ height: 11, width: "45%", backgroundColor: colors.secondary, borderRadius: 6 }} />
        </View>
        <View style={{ gap: 8, alignItems: "flex-end" }}>
          <View style={{ height: 22, width: 55, backgroundColor: colors.secondary, borderRadius: 8 }} />
          <View style={{ height: 13, width: 80, backgroundColor: colors.secondary, borderRadius: 6 }} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title={t("locatairesTitle")}
        subtitle={`${tenants.length} ${t("locatairesTitle").toLowerCase()}`}
        color="#06b6d4"
        stats={[
          { label: t("statusActive"),   value: activeCount,    color: "#10b981" },
          { label: t("expiringLabel"),  value: expiringCount,  color: "#f59e0b" },
          { label: t("total"),          value: tenants.length, color: "#06b6d4" },
        ]}
        action={isAdmin ? { icon: "plus", onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); } } : undefined}
      />

      <View style={[s.searchRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder={`${t("name")}, ${t("email")}, lot...`}
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
        <FlatList
          data={[1, 2, 3, 4]}
          keyExtractor={(k) => String(k)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          renderItem={() => <SkeletonCard />}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(ten) => ten.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#06b6d4" />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="user-check" size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t("noTenantFound")}</Text>
              <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t("noTenants")}</Text>
            </View>
          }
          renderItem={({ item: ten }) => {
            const color = STATUS_COLORS[ten.status] ?? "#6b7280";
            const icon  = STATUS_ICONS[ten.status] ?? "clock";
            const label = getStatusLabel(ten.status);
            const daysLeft = ten.leaseEnd
              ? Math.ceil((new Date(ten.leaseEnd).getTime() - Date.now()) / 86400000)
              : null;
            const isExpiring = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;

            return (
              <TouchableOpacity
                style={[s.card, { backgroundColor: colors.card, borderColor: isExpiring ? "#f59e0b40" : colors.border, borderLeftWidth: isExpiring ? 4 : 1, borderLeftColor: isExpiring ? "#f59e0b" : colors.border }]}
                onPress={() => setSelected(ten)}
                activeOpacity={0.8}
              >
                <View style={s.cardTop}>
                  <View style={[s.avatar, { backgroundColor: "#06b6d418" }]}>
                    <Text style={[s.avatarText, { color: "#06b6d4" }]}>
                      {ten.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.name, { color: colors.foreground }]}>{ten.name}</Text>
                    {ten.email ? <Text style={[s.meta, { color: colors.mutedForeground }]}>{ten.email}</Text> : null}
                    {ten.lotNumber ? (
                      <View style={s.lotRow}>
                        <Feather name="home" size={11} color={colors.mutedForeground} />
                        <Text style={[s.meta, { color: colors.mutedForeground }]}>Lot {ten.lotNumber}</Text>
                        {ten.buildingName ? <Text style={[s.meta, { color: colors.mutedForeground }]}>• {ten.buildingName}</Text> : null}
                      </View>
                    ) : null}
                    {ten.leaseEnd ? (
                      <Text style={[s.meta, { color: isExpiring ? "#f59e0b" : colors.mutedForeground }]}>
                        {t("leaseExpiry")} {ten.leaseEnd}{isExpiring ? ` (${daysLeft}j)` : ""}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <View style={[s.badge, { backgroundColor: color + "18" }]}>
                      <Feather name={icon} size={10} color={color} />
                      <Text style={[s.badgeText, { color }]}>{label}</Text>
                    </View>
                    {ten.monthlyRent ? (
                      <Text style={[s.rent, { color: colors.foreground }]}>{ten.monthlyRent.toLocaleString("fr-MA")} MAD/m</Text>
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
                  { label: t("email"),             value: selected.email ?? "—" },
                  { label: t("phone"),             value: selected.phone ?? "—" },
                  { label: t("tenantLotLabel"),    value: selected.lotNumber ? `Lot ${selected.lotNumber}` : "—" },
                  { label: t("tenantBuilding"),    value: selected.buildingName ?? "—" },
                  { label: t("tenantLeaseStart"),  value: selected.leaseStart ?? "—" },
                  { label: t("tenantLeaseEnd"),    value: selected.leaseEnd ?? "—" },
                  { label: t("monthlyRentLabel"),  value: selected.monthlyRent ? `${selected.monthlyRent.toLocaleString("fr-MA")} MAD` : "—" },
                  { label: t("tenantDeposit"),     value: selected.depositAmount ? `${selected.depositAmount.toLocaleString("fr-MA")} MAD` : "—" },
                  { label: t("tenantEmergencyContact"), value: selected.emergencyContact ?? "—" },
                  { label: t("tenantEmergencyPhone"),   value: selected.emergencyPhone ?? "—" },
                  { label: t("tenantStatus"),      value: getStatusLabel(selected.status) },
                  { label: t("tenantNotes"),       value: selected.notes ?? "—" },
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
                    const color = STATUS_COLORS[st];
                    const icon  = STATUS_ICONS[st];
                    const label = getStatusLabel(st);
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[s.actionBtn, { backgroundColor: color + "15", borderColor: color + "30" }]}
                        onPress={() => { handleStatusChange(selected.id, st); setSelected(null); }}
                      >
                        <Feather name={icon} size={14} color={color} />
                        <Text style={[s.actionBtnText, { color }]}>{t("markTenantLabel")} {label}</Text>
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
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{t("newTenantTitle")}</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {[
              { label: t("tenantFullName"),      key: "name"             as const, placeholder: "Mohammed Benali" },
              { label: t("email"),               key: "email"            as const, placeholder: "m.benali@email.com" },
              { label: t("phone"),               key: "phone"            as const, placeholder: "+212 6XX XXX XXX" },
              { label: t("tenantLotId"),         key: "lotId"            as const, placeholder: "ID du lot occupé" },
              { label: t("leaseStartLabel"),     key: "leaseStart"       as const, placeholder: "2025-01-01" },
              { label: t("leaseEndLabel"),       key: "leaseEnd"         as const, placeholder: "2026-01-01" },
              { label: t("monthlyRentLabel"),    key: "monthlyRent"      as const, placeholder: "5000" },
              { label: t("depositLabel"),        key: "depositAmount"    as const, placeholder: "10000" },
              { label: t("emergencyContactLabel"), key: "emergencyContact" as const, placeholder: "Nom du contact" },
              { label: t("emergencyPhoneLabel"), key: "emergencyPhone"   as const, placeholder: "+212 6XX XXX XXX" },
              { label: t("notes"),               key: "notes"            as const, placeholder: "Informations complémentaires..." },
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
                <><Feather name="user-check" size={16} color="#fff" /><Text style={s.submitText}>{t("registerTenantBtn")}</Text></>
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
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
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
