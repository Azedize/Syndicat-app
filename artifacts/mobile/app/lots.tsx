import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  RefreshControl,
  TextInput,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import FilterChips from "@/components/FilterChips";
import StatisticsHeader from "@/components/StatisticsHeader";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";

// Unit types accepted by the API (routes/lots.ts LOT_TYPES).
const CREATE_TYPES = ["appartement", "duplex", "studio", "villa", "bureau", "commerce", "local", "parking", "cave", "box", "terrain", "autre"];
const FLOORLESS = new Set(["parking", "cave", "box", "terrain", "villa"]);
const L_STR = {
  create: { fr: "Créer un lot", en: "Create unit", ar: "إنشاء وحدة", es: "Crear lote" },
  search: { fr: "Rechercher : référence, propriétaire, locataire, titre foncier", en: "Search: reference, owner, tenant, land title", ar: "بحث: المرجع، المالك، المكتري", es: "Buscar: referencia, propietario, inquilino" },
  building: { fr: "Immeuble *", en: "Building *", ar: "العمارة *", es: "Edificio *" },
  reference: { fr: "Référence du lot *", en: "Unit reference *", ar: "مرجع الوحدة *", es: "Referencia *" },
  type: { fr: "Type *", en: "Type *", ar: "النوع *", es: "Tipo *" },
  floor: { fr: "Étage", en: "Floor", ar: "الطابق", es: "Planta" },
  floorRequired: { fr: "Étage obligatoire pour ce type de lot", en: "Floor required for this unit type", ar: "الطابق إلزامي لهذا النوع", es: "Planta obligatoria" },
  surface: { fr: "Surface m² (facultatif)", en: "Area m² (optional)", ar: "المساحة (اختياري)", es: "Superficie (opcional)" },
  tantiemes: { fr: "Tantièmes *", en: "Shares (tantièmes) *", ar: "الأنصبة *", es: "Cuotas *" },
  owner: { fr: "Propriétaire (facultatif, 100 %)", en: "Owner (optional, 100 %)", ar: "المالك (اختياري)", es: "Propietario (opcional)" },
  noOwner: { fr: "Aucun", en: "None", ar: "لا أحد", es: "Ninguno" },
  save: { fr: "Créer", en: "Create", ar: "إنشاء", es: "Crear" },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  required: { fr: "Obligatoire", en: "Required", ar: "إلزامي", es: "Obligatorio" },
  invalid: { fr: "Valeur invalide", en: "Invalid value", ar: "قيمة غير صالحة", es: "Valor no válido" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  created: { fr: "Lot créé", en: "Unit created", ar: "تم إنشاء الوحدة", es: "Lote creado" },
  rented: { fr: "Loué", en: "Rented", ar: "مكترى", es: "Alquilado" },
  archived: { fr: "Archivés", en: "Archived", ar: "مؤرشفة", es: "Archivados" },
} as const;

const LOT_TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  appartement: "home",
  bureau: "briefcase",
  commerce: "shopping-bag",
  parking: "truck",
  cave: "archive",
  local: "box",
};

const LOT_TYPE_COLORS: Record<string, string> = {
  appartement: "#2563EB",
  bureau: "#3b82f6",
  commerce: "#f59e0b",
  parking: "#6b7280",
  cave: "#92400e",
  local: "#10b981",
};

const STATUS_COLORS: Record<string, string> = {
  occupied: "#10b981",
  rented: "#8b5cf6",
  vacant: "#f59e0b",
  for_sale: "#3b82f6",
  for_rent: "#8b5cf6",
};

type Lot = {
  id: string;
  number: string;
  type: string;
  floor: number;
  surfaceM2?: number;
  tantiemes: number;
  buildingId: string;
  status: string;
  owner?: { id: string; name: string; email: string; phone: string } | null;
  tenant?: any;
  chargeStats?: { pending: number; overdue: number; pendingAmount: number };
};

export default function LotsScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "secretary", "president", "treasurer", "committee_member"]}>
      <LotsScreenInner />
    </RoleGuard>
  );
}

function LotsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { lang, t } = useLanguage();
  const ls = (k: keyof typeof L_STR) => (L_STR[k] as Record<string, string>)[lang] ?? L_STR[k].fr;
  const canCreate = user?.role === "syndicate_admin" || user?.role === "secretary";
  const { isWide } = useBreakpoints();
  const params = useLocalSearchParams<{
    buildingId?: string;
    buildingName?: string;
  }>();

  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ buildingId: "", number: "", type: "appartement", floor: "", surfaceM2: "", tantiemes: "", ownerId: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(h);
  }, [query]);

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLoadError(false);
        }
        // Search and filters run on the server (whole register, not a page).
        const qs = new URLSearchParams({ limit: "200" });
        if (params.buildingId) qs.set("buildingId", params.buildingId);
        if (debouncedQuery) qs.set("q", debouncedQuery);
        if (filter === "archived") qs.set("archived", "only");
        else if (["vacant", "rented", "occupied"].includes(filter)) qs.set("status", filter);
        else if (filter !== "all") qs.set("type", filter);
        const data = await apiRequest(`/lots?${qs.toString()}`, "GET", undefined, token);
        setLots(data.data ?? []);
        setTotal(Number(data.total ?? (data.data ?? []).length));
        setStatusCounts(data.statusCounts ?? {});
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, params.buildingId, debouncedQuery, filter],
  );

  const openCreate = async () => {
    setForm({ buildingId: params.buildingId ?? "", number: "", type: "appartement", floor: "", surfaceM2: "", tantiemes: "", ownerId: "" });
    setFormErrors({});
    setCreateOpen(true);
    try {
      const [b, m] = await Promise.all([
        apiRequest<{ data: any[] }>("/buildings", "GET", undefined, token),
        apiRequest<{ data: any[] }>("/members?limit=200", "GET", undefined, token),
      ]);
      setBuildings((b.data ?? []).map((x) => ({ id: x.id, name: x.name })));
      setOwners((m.data ?? []).map((x) => ({ id: x.id, name: x.name })));
      if (!params.buildingId && (b.data ?? []).length === 1) setForm((f) => ({ ...f, buildingId: b.data[0].id }));
    } catch {
      setBuildings([]);
    }
  };

  const submitCreate = async () => {
    if (creating) return;
    // Same rules as the API, shown before submitting.
    const errors: Record<string, string> = {};
    if (!form.buildingId) errors.buildingId = ls("required");
    if (!form.number.trim()) errors.number = ls("required");
    if (!FLOORLESS.has(form.type) && form.floor.trim() === "") errors.floor = ls("floorRequired");
    if (form.floor.trim() !== "" && !Number.isInteger(Number(form.floor))) errors.floor = ls("invalid");
    if (form.surfaceM2.trim() !== "" && !(Number(form.surfaceM2.replace(",", ".")) > 0)) errors.surfaceM2 = ls("invalid");
    if (form.tantiemes.trim() === "" || !Number.isInteger(Number(form.tantiemes)) || Number(form.tantiemes) < 0) errors.tantiemes = ls("invalid");
    setFormErrors(errors);
    if (Object.keys(errors).length) return;
    setCreating(true);
    try {
      const created = await apiRequest<any>(
        "/lots",
        "POST",
        {
          buildingId: form.buildingId,
          number: form.number.trim(),
          type: form.type,
          ...(form.floor.trim() !== "" ? { floor: Number(form.floor) } : {}),
          ...(form.surfaceM2.trim() !== "" ? { surfaceM2: form.surfaceM2.replace(",", ".") } : {}),
          tantiemes: Number(form.tantiemes),
          ...(form.ownerId ? { ownerId: form.ownerId } : {}),
        },
        token,
      );
      setCreateOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load(true);
      router.push({ pathname: "/lot-detail", params: { id: created.id ?? created.data?.id } } as any);
    } catch (e: any) {
      // Server reason: duplicate reference, building of another syndicate…
      if (e?.code === "LOT_REFERENCE_EXISTS") setFormErrors({ number: e.message });
      else Alert.alert(ls("error"), e?.message || ls("invalid"));
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  // The list is already filtered by the server.
  const filtered = lots;

  const stats = {
    total,
    occupied: (statusCounts.occupied ?? 0) + (statusCounts.rented ?? 0),
    vacant: statusCounts.vacant ?? 0,
    overdue: lots.filter((l) => (l.chargeStats?.overdue ?? 0) > 0).length,
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      occupied: t("lotStatusOccupied"),
      rented: ls("rented"),
      vacant: t("lotStatusVacant"),
      for_sale: t("lotStatusForSale"),
      for_rent: t("lotStatusForRent"),
    };
    return map[status] ?? status;
  };

  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "es"
        ? "es-ES"
        : lang === "en"
          ? "en-GB"
          : "fr-FR";
  const formatMad = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "MAD",
      maximumFractionDigits: 2,
    }).format(value);
  const getLotTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      appartement: t("lotTypeApartment"),
      bureau: t("lotTypeOffice"),
      commerce: t("lotTypeCommerce"),
      parking: t("lotTypeParking"),
      cave: t("lotTypeStorage"),
      local: t("lotTypeHousing"),
    };
    return map[type] ?? type;
  };

  const FILTERS = [
    { key: "all", label: t("all") },
    { key: "appartement", label: t("filterApts") },
    { key: "bureau", label: t("filterOffices") },
    { key: "commerce", label: t("filterCommerce") },
    { key: "parking", label: t("filterParkings") },
    { key: "vacant", label: t("filterVacant") },
    { key: "rented", label: ls("rented") },
    { key: "archived", label: ls("archived") },
  ];

  // Skeleton loading card
  const SkeletonCard = () => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardMain}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.secondary,
          }}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View
              style={{
                height: 15,
                width: "40%",
                backgroundColor: colors.secondary,
                borderRadius: 7,
              }}
            />
            <View
              style={{
                height: 18,
                width: 60,
                backgroundColor: colors.secondary,
                borderRadius: 9,
              }}
            />
          </View>
          <View
            style={{
              height: 11,
              width: "60%",
              backgroundColor: colors.secondary,
              borderRadius: 6,
            }}
          />
        </View>
      </View>
      <View style={[styles.personRow, { borderTopColor: colors.border }]}>
        <View
          style={{
            height: 12,
            width: "55%",
            backgroundColor: colors.secondary,
            borderRadius: 6,
          }}
        />
      </View>
      <View style={[styles.chargeRow, { borderTopColor: colors.border }]}>
        <View
          style={{
            height: 12,
            width: "30%",
            backgroundColor: colors.secondary,
            borderRadius: 6,
          }}
        />
        <View
          style={{
            height: 22,
            width: 70,
            backgroundColor: colors.secondary,
            borderRadius: 10,
          }}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title={t("lotsTitle")}
        subtitle={params.buildingName ?? t("allBuildings")}
        color={colors.primary}
        stats={[
          { label: t("total"), value: stats.total, color: colors.primary },
          { label: t("lotsOccupied"), value: stats.occupied, color: "#10b981" },
          { label: t("lotsVacant"), value: stats.vacant, color: "#f59e0b" },
          { label: t("lotsOverdue"), value: stats.overdue, color: "#ef4444" },
        ]}
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
        <TextInput
          style={[formStyles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          placeholder={ls("search")}
          placeholderTextColor={colors.mutedForeground}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {canCreate && <ActionButton label={ls("create")} icon="plus" onPress={openCreate} />}
      </View>

      <FilterChips
        options={FILTERS}
        value={filter}
        onChange={setFilter}
        accentColor={colors.primary}
      />

      {loading ? (
        <LoadingState
          title={t("lotsLoadingTitle")}
          description={t("lotsLoadingDescription")}
          accentColor={colors.primary}
        />
      ) : loadError ? (
        <ErrorState
          title={t("lotsUnavailableTitle")}
          description={t("lotsUnavailableDescription")}
          retryLabel={t("retry")}
          onRetry={() => void load()}
          accentColor={colors.primary}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: isWide ? 32 : insets.bottom + 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="grid" size={36} color={colors.mutedForeground} />
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                {t("noLotsFound")}
              </Text>
              <Text
                style={[styles.emptyHint, { color: colors.mutedForeground }]}
              >
                {t("noLots")}
              </Text>
            </View>
          ) : (
            filtered.map((lot) => {
              const tc = LOT_TYPE_COLORS[lot.type] ?? "#6b7280";
              const ti = LOT_TYPE_ICONS[lot.type] ?? "home";
              const sc = STATUS_COLORS[lot.status] ?? "#6b7280";
              const hasOverdue = (lot.chargeStats?.overdue ?? 0) > 0;
              const pendingAmt = lot.chargeStats?.pendingAmount ?? 0;

              return (
                <TouchableOpacity
                  key={lot.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: hasOverdue ? "#ef444440" : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({ pathname: "/lot-detail", params: { id: lot.id } } as any);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardMain}>
                    <View
                      style={[styles.lotIcon, { backgroundColor: tc + "18" }]}
                    >
                      <Feather name={ti} size={20} color={tc} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardRow}>
                        <Text
                          style={[
                            styles.lotNumber,
                            { color: colors.foreground },
                          ]}
                        >
                          {t("lotLabel")} {lot.number}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: sc + "18" },
                          ]}
                        >
                          <Text style={[styles.statusText, { color: sc }]}>
                            {getStatusLabel(lot.status)}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.lotType,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {getLotTypeLabel(lot.type)} — {t("floor")} {lot.floor}
                        {lot.surfaceM2 ? ` — ${lot.surfaceM2} m²` : ""}
                      </Text>
                    </View>
                  </View>

                  {/* Owner / Tenant */}
                  <View
                    style={[
                      styles.personRow,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    {lot.owner ? (
                      <View style={styles.personCell}>
                        <Feather name="user" size={13} color={colors.primary} />
                        <Text
                          style={[
                            styles.personLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {t("ownerLabel")}:{" "}
                          <Text
                            style={{
                              color: colors.foreground,
                              fontFamily: "Inter_500Medium",
                            }}
                          >
                            {lot.owner.name}
                          </Text>
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.personCell}>
                        <Feather name="user-x" size={13} color="#f59e0b" />
                        <Text
                          style={[styles.personLabel, { color: "#f59e0b" }]}
                        >
                          {t("noOwnerRegistered")}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Charge status */}
                  <View
                    style={[
                      styles.chargeRow,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <View style={styles.chargeInfo}>
                      <Feather
                        name="percent"
                        size={12}
                        color={colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.chargeText,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {lot.tantiemes} ‰ ({t("tantiemes").toLowerCase()})
                      </Text>
                    </View>
                    {pendingAmt > 0 ? (
                      <View
                        style={[
                          styles.amtBadge,
                          {
                            backgroundColor: hasOverdue
                              ? "#ef444418"
                              : "#f59e0b18",
                          },
                        ]}
                      >
                        <Feather
                          name="alert-circle"
                          size={11}
                          color={hasOverdue ? "#ef4444" : "#f59e0b"}
                        />
                        <Text
                          style={[
                            styles.amtText,
                            { color: hasOverdue ? "#ef4444" : "#f59e0b" },
                          ]}
                        >
                          {formatMad(pendingAmt)} {t("amountDue").toLowerCase()}
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.amtBadge,
                          { backgroundColor: "#10b98118" },
                        ]}
                      >
                        <Feather
                          name="check-circle"
                          size={11}
                          color="#10b981"
                        />
                        <Text style={[styles.amtText, { color: "#10b981" }]}>
                          {t("upToDate")}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Create unit */}
      <FormSheet visible={createOpen} title={ls("create")} onClose={() => setCreateOpen(false)} closeLabel={ls("cancel")}>
        <FieldLabel label={ls("building")} error={formErrors.buildingId} />
        <ChoiceChips value={form.buildingId} onChange={(k) => setForm((f) => ({ ...f, buildingId: k }))} options={buildings.map((b) => ({ key: b.id, label: b.name }))} />
        <FieldLabel label={ls("reference")} error={formErrors.number} />
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: formErrors.number ? "#ef4444" : colors.border, color: colors.foreground }]} autoCapitalize="characters" value={form.number} onChangeText={(v) => setForm((f) => ({ ...f, number: v }))} />
        <FieldLabel label={ls("type")} />
        <ChoiceChips value={form.type} onChange={(k) => setForm((f) => ({ ...f, type: k }))} options={CREATE_TYPES.map((k) => ({ key: k, label: getLotTypeLabel(k) }))} />
        <FieldLabel label={`${ls("floor")}${FLOORLESS.has(form.type) ? "" : " *"}`} error={formErrors.floor} />
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: formErrors.floor ? "#ef4444" : colors.border, color: colors.foreground }]} keyboardType="numbers-and-punctuation" value={form.floor} onChangeText={(v) => setForm((f) => ({ ...f, floor: v }))} />
        <FieldLabel label={ls("surface")} error={formErrors.surfaceM2} />
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} keyboardType="decimal-pad" value={form.surfaceM2} onChangeText={(v) => setForm((f) => ({ ...f, surfaceM2: v }))} />
        <FieldLabel label={ls("tantiemes")} error={formErrors.tantiemes} />
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: formErrors.tantiemes ? "#ef4444" : colors.border, color: colors.foreground }]} keyboardType="number-pad" value={form.tantiemes} onChangeText={(v) => setForm((f) => ({ ...f, tantiemes: v }))} />
        <FieldLabel label={ls("owner")} />
        <ChoiceChips value={form.ownerId} onChange={(k) => setForm((f) => ({ ...f, ownerId: k }))} options={[{ key: "", label: ls("noOwner") }, ...owners.map((o) => ({ key: o.id, label: o.name }))]} />
        <ActionButton label={ls("save")} icon="check" onPress={submitCreate} busy={creating} />
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalHero: {
    alignItems: "center",
    gap: 10,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  modalHeroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeroTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  detailCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  detailLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sep2: { height: StyleSheet.hairlineWidth },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    paddingTop: 10,
    paddingBottom: 2,
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  lotIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lotNumber: { fontSize: 15, fontFamily: "Inter_700Bold" },
  lotType: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  personCell: { flexDirection: "row", alignItems: "center", gap: 6 },
  personLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  chargeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chargeInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  chargeText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  amtBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  amtText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
