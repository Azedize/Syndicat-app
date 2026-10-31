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
import { ErrorState } from "@/components/DataState";
import EmptyState from "@/components/EmptyState";
import { Card, SearchField, Skeleton, StatusBadge, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
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

const LOT_TYPE_TONES: Record<string, StatusTone> = {
  appartement: "primary",
  bureau: "info",
  commerce: "warning",
  parking: "neutral",
  cave: "neutral",
  local: "success",
};

const STATUS_TONES: Record<string, StatusTone> = {
  occupied: "success",
  rented: "info",
  vacant: "warning",
  for_sale: "primary",
  for_rent: "info",
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
  const { lang, t, isRTL } = useLanguage();
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatisticsHeader
        title={t("lotsTitle")}
        subtitle={params.buildingName ?? t("allBuildings")}
        action={canCreate ? { icon: "plus", onPress: openCreate, label: ls("create") } : undefined}
        stats={[
          { label: t("total"), value: stats.total },
          { label: t("lotsOccupied"), value: stats.occupied, color: colors.success },
          { label: t("lotsVacant"), value: stats.vacant, color: colors.warning },
          { label: t("lotsOverdue"), value: stats.overdue, color: colors.danger },
        ]}
      />

      <View style={styles.searchWrap}>
        <SearchField value={query} onChangeText={setQuery} placeholder={ls("search")} />
      </View>

      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.card, styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Skeleton width={44} height={44} radius={12} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="45%" height={14} />
                <Skeleton width="70%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : loadError ? (
        <ErrorState
          title={t("lotsUnavailableTitle")}
          description={t("lotsUnavailableDescription")}
          retryLabel={t("retry")}
          onRetry={() => void load()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            filtered.length === 0 ? { flexGrow: 1 } : styles.list,
            { paddingBottom: isWide ? 32 : insets.bottom + 32 },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon="grid"
              title={t("noLotsFound")}
              description={t("noLots")}
              actionLabel={canCreate && !debouncedQuery && filter === "all" ? ls("create") : undefined}
              onAction={canCreate && !debouncedQuery && filter === "all" ? openCreate : undefined}
            />
          ) : (
            filtered.map((lot) => {
              const typeT = LOT_TYPE_TONES[lot.type] ?? "neutral";
              const tc = toneColors(colors, typeT);
              const ti = LOT_TYPE_ICONS[lot.type] ?? "home";
              const hasOverdue = (lot.chargeStats?.overdue ?? 0) > 0;
              const pendingAmt = lot.chargeStats?.pendingAmount ?? 0;
              const details = [
                getLotTypeLabel(lot.type),
                !FLOORLESS.has(lot.type) && lot.floor != null ? `${t("floor")} ${lot.floor}` : null,
                lot.surfaceM2 ? `${lot.surfaceM2} m²` : null,
              ].filter(Boolean).join(" · ");

              return (
                <Card
                  key={lot.id}
                  padding="none"
                  accessibilityLabel={`${t("lotLabel")} ${lot.number}, ${details}`}
                  style={hasOverdue ? { borderColor: colors.danger + "55" } : undefined}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.push({ pathname: "/lot-detail", params: { id: lot.id } } as any);
                  }}
                >
                  <View style={styles.cardMain}>
                    <View style={[styles.lotIcon, { backgroundColor: tc.bg }]}>
                      <Feather name={ti} size={20} color={tc.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[TYPE.subtitle, { color: colors.foreground }]} numberOfLines={1}>
                        {t("lotLabel")} {lot.number}
                      </Text>
                      <Text style={[TYPE.secondary, { color: colors.textMuted }]} numberOfLines={1}>
                        {details}
                      </Text>
                    </View>
                    <StatusBadge label={getStatusLabel(lot.status)} tone={STATUS_TONES[lot.status] ?? "neutral"} />
                  </View>

                  <View style={[styles.cardFoot, { borderTopColor: colors.border }]}>
                    <View style={styles.footCell}>
                      <Feather name={lot.owner ? "user" : "user-x"} size={13} color={lot.owner ? colors.textMuted : colors.warning} />
                      <Text style={[TYPE.caption, { color: lot.owner ? colors.textSecondary : colors.warningText, flexShrink: 1 }]} numberOfLines={1}>
                        {lot.owner ? lot.owner.name : t("noOwnerRegistered")}
                      </Text>
                    </View>
                    <Text style={[TYPE.caption, { color: colors.textMuted }]} numberOfLines={1}>
                      {lot.tantiemes} {t("tantiemes").toLowerCase()}
                    </Text>
                  </View>

                  <View style={[styles.cardFoot, { borderTopColor: colors.border }]}>
                    {pendingAmt > 0 ? (
                      <StatusBadge label={`${formatMad(pendingAmt)} — ${t("amountDue").toLowerCase()}`} tone={hasOverdue ? "danger" : "warning"} icon="alert-circle" />
                    ) : (
                      <StatusBadge label={t("upToDate")} tone="success" />
                    )}
                    <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.textMuted} />
                  </View>
                </Card>
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
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: formErrors.number ? colors.danger : colors.border, color: colors.foreground }]} autoCapitalize="characters" value={form.number} onChangeText={(v) => setForm((f) => ({ ...f, number: v }))} />
        <FieldLabel label={ls("type")} />
        <ChoiceChips value={form.type} onChange={(k) => setForm((f) => ({ ...f, type: k }))} options={CREATE_TYPES.map((k) => ({ key: k, label: getLotTypeLabel(k) }))} />
        <FieldLabel label={`${ls("floor")}${FLOORLESS.has(form.type) ? "" : " *"}`} error={formErrors.floor} />
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: formErrors.floor ? colors.danger : colors.border, color: colors.foreground }]} keyboardType="numbers-and-punctuation" value={form.floor} onChangeText={(v) => setForm((f) => ({ ...f, floor: v }))} />
        <FieldLabel label={ls("surface")} error={formErrors.surfaceM2} />
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} keyboardType="decimal-pad" value={form.surfaceM2} onChangeText={(v) => setForm((f) => ({ ...f, surfaceM2: v }))} />
        <FieldLabel label={ls("tantiemes")} error={formErrors.tantiemes} />
        <TextInput style={[formStyles.input, { backgroundColor: colors.card, borderColor: formErrors.tantiemes ? colors.danger : colors.border, color: colors.foreground }]} keyboardType="number-pad" value={form.tantiemes} onChangeText={(v) => setForm((f) => ({ ...f, tantiemes: v }))} />
        <FieldLabel label={ls("owner")} />
        <ChoiceChips value={form.ownerId} onChange={(k) => setForm((f) => ({ ...f, ownerId: k }))} options={[{ key: "", label: ls("noOwner") }, ...owners.map((o) => ({ key: o.id, label: o.name }))]} />
        <ActionButton label={ls("save")} icon="check" onPress={submitCreate} busy={creating} />
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  list: { padding: 16, gap: 10 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  skeletonCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  lotIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footCell: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
});
