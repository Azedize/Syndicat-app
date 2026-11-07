import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";
import { BalanceMeter, Button, StatusBadge } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { useCallStatus } from "@/hooks/useCallStatus";

import { isValidYmd } from "@/lib/dateInput";
/**
 * Lot detail: identity, ownership (co-owners, shares, history), occupancy
 * (tenancies), financial summary, related records and audit trail. What is
 * shown and which actions are offered come from the API, which enforces the
 * permissions (this screen only reflects them).
 */
export default function LotDetailScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "secretary", "president", "treasurer", "committee_member", "member", "tenant"]}>
      <LotDetailInner />
    </RoleGuard>
  );
}

type Lang = "fr" | "en" | "ar" | "es";
const S = {
  title: { fr: "Fiche du lot", en: "Unit", ar: "بطاقة الوحدة", es: "Ficha del lote" },
  identity: { fr: "Identité", en: "Identity", ar: "الهوية", es: "Identidad" },
  owners: { fr: "Propriétaires", en: "Owners", ar: "الملاك", es: "Propietarios" },
  ownershipHistory: { fr: "Historique de propriété", en: "Ownership history", ar: "سجل الملكية", es: "Historial de propiedad" },
  occupancy: { fr: "Occupation", en: "Occupancy", ar: "الإشغال", es: "Ocupación" },
  finance: { fr: "Situation financière", en: "Financial summary", ar: "الوضعية المالية", es: "Situación financiera" },
  charges: { fr: "Appels de fonds", en: "Calls for funds", ar: "نداءات الأموال", es: "Derramas" },
  documents: { fr: "Documents", en: "Documents", ar: "الوثائق", es: "Documentos" },
  related: { fr: "Interventions & sinistres", en: "Works & claims", ar: "الأشغال والحوادث", es: "Obras y siniestros" },
  history: { fr: "Journal des modifications", en: "Change log", ar: "سجل التعديلات", es: "Registro de cambios" },
  building: { fr: "Immeuble", en: "Building", ar: "العمارة", es: "Edificio" },
  floor: { fr: "Étage", en: "Floor", ar: "الطابق", es: "Planta" },
  surface: { fr: "Surface (m²)", en: "Area (m²)", ar: "المساحة (م²)", es: "Superficie (m²)" },
  tantiemes: { fr: "Tantièmes", en: "Shares (tantièmes)", ar: "الأنصبة", es: "Cuotas" },
  titre: { fr: "Titre foncier", en: "Land title", ar: "الرسم العقاري", es: "Título" },
  type: { fr: "Type", en: "Type", ar: "النوع", es: "Tipo" },
  occupied: { fr: "Occupé par le propriétaire", en: "Owner-occupied", ar: "يشغله المالك", es: "Ocupado por el propietario" },
  rented: { fr: "Loué", en: "Rented", ar: "مكترى", es: "Alquilado" },
  vacant: { fr: "Vacant", en: "Vacant", ar: "شاغر", es: "Vacío" },
  archived: { fr: "Archivé", en: "Archived", ar: "مؤرشف", es: "Archivado" },
  noOwner: { fr: "Aucun propriétaire enregistré", en: "No owner recorded", ar: "لا يوجد مالك مسجل", es: "Sin propietario" },
  noTenant: { fr: "Aucun bail en cours", en: "No current lease", ar: "لا يوجد عقد كراء جارٍ", es: "Sin alquiler en curso" },
  since: { fr: "depuis", en: "since", ar: "منذ", es: "desde" },
  until: { fr: "jusqu'au", en: "until", ar: "إلى", es: "hasta" },
  called: { fr: "Appelé", en: "Called", ar: "المطلوب", es: "Reclamado" },
  paid: { fr: "Payé", en: "Paid", ar: "المؤدى", es: "Pagado" },
  outstanding: { fr: "Reste dû", en: "Outstanding", ar: "الباقي", es: "Pendiente" },
  owedBy: { fr: "dû par", en: "owed by", ar: "على", es: "debe" },
  edit: { fr: "Modifier", en: "Edit", ar: "تعديل", es: "Editar" },
  changeOwners: { fr: "Changer les propriétaires", en: "Change owners", ar: "تغيير الملاك", es: "Cambiar propietarios" },
  moveIn: { fr: "Installer un locataire", en: "Move a tenant in", ar: "إسكان مكترٍ", es: "Instalar inquilino" },
  moveOut: { fr: "Départ du locataire", en: "Tenant moves out", ar: "مغادرة المكتري", es: "Salida del inquilino" },
  archive: { fr: "Archiver", en: "Archive", ar: "أرشفة", es: "Archivar" },
  restore: { fr: "Restaurer", en: "Restore", ar: "استعادة", es: "Restaurar" },
  remove: { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  reason: { fr: "Motif (vente, succession, donation…)", en: "Reason (sale, inheritance…)", ar: "السبب (بيع، إرث…)", es: "Motivo (venta, herencia…)" },
  effectiveDate: { fr: "Date d'effet (AAAA-MM-JJ, défaut : aujourd'hui)", en: "Effective date (YYYY-MM-DD, default today)", ar: "تاريخ السريان (افتراضياً اليوم)", es: "Fecha de efecto (por defecto hoy)" },
  share: { fr: "Quote-part %", en: "Share %", ar: "الحصة %", es: "Cuota %" },
  addOwner: { fr: "Ajouter", en: "Add", ar: "إضافة", es: "Añadir" },
  sharesTotal: { fr: "Total des quotes-parts", en: "Total shares", ar: "مجموع الحصص", es: "Total de cuotas" },
  outstandingConfirmTitle: { fr: "Impayés sur ce lot", en: "Unpaid calls on this unit", ar: "مستحقات غير مؤداة", es: "Impagos en este lote" },
  confirmContinue: { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  tenantName: { fr: "Nom du locataire", en: "Tenant name", ar: "اسم المكتري", es: "Nombre del inquilino" },
  email: { fr: "Email (facultatif)", en: "Email (optional)", ar: "البريد (اختياري)", es: "Email (opcional)" },
  phone: { fr: "Téléphone (facultatif)", en: "Phone (optional)", ar: "الهاتف (اختياري)", es: "Teléfono (opcional)" },
  rent: { fr: "Loyer mensuel MAD (facultatif)", en: "Monthly rent MAD (optional)", ar: "الكراء الشهري (اختياري)", es: "Alquiler mensual (opcional)" },
  leaseStart: { fr: "Début du bail (AAAA-MM-JJ, défaut : aujourd'hui)", en: "Lease start (default today)", ar: "بداية العقد (افتراضياً اليوم)", es: "Inicio (por defecto hoy)" },
  afterDeparture: { fr: "Après le départ", en: "After departure", ar: "بعد المغادرة", es: "Después de la salida" },
  archiveReason: { fr: "Motif de l'archivage", en: "Reason for archiving", ar: "سبب الأرشفة", es: "Motivo" },
  deleteConfirm: { fr: "Supprimer définitivement ce lot ? Possible uniquement s'il n'a aucun historique.", en: "Delete this unit? Only possible without any history.", ar: "حذف هذه الوحدة نهائياً؟ ممكن فقط دون أي سجل.", es: "¿Eliminar el lote? Solo sin historial." },
  loadError: { fr: "Impossible de charger le lot.", en: "Could not load the unit.", ar: "تعذر تحميل الوحدة.", es: "No se pudo cargar el lote." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  saved: { fr: "Enregistré", en: "Saved", ar: "تم الحفظ", es: "Guardado" },
  none: { fr: "Rien pour le moment.", en: "Nothing yet.", ar: "لا شيء.", es: "Nada por ahora." },
  current: { fr: "en cours", en: "current", ar: "جارٍ", es: "en curso" },
  pickMember: { fr: "Choisir un copropriétaire", en: "Pick a co-owner", ar: "اختيار مالك", es: "Elegir propietario" },
  search: { fr: "Rechercher par nom ou email", en: "Search by name or email", ar: "بحث بالاسم أو البريد", es: "Buscar por nombre o email" },
  works: { fr: "intervention(s)", en: "work order(s)", ar: "تدخل", es: "intervención(es)" },
  claims: { fr: "sinistre(s)", en: "claim(s)", ar: "حادث", es: "siniestro(s)" },
  required: { fr: "Champs obligatoires manquants ou invalides.", en: "Missing or invalid fields.", ar: "حقول ناقصة أو غير صالحة.", es: "Campos obligatorios inválidos." },
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function LotDetailInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const L = lang as Lang;
  const tr = (k: keyof typeof S) => S[k][L] ?? S[k].fr;
  const { showToast } = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const callStatus = useCallStatus();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ floor: "", surfaceM2: "", tantiemes: "", titreFoncier: "", description: "" });
  const [ownersOpen, setOwnersOpen] = useState(false);
  const [ownerRows, setOwnerRows] = useState<{ memberId: string; name: string; share: string }[]>([]);
  const [ownerReason, setOwnerReason] = useState("");
  const [ownerDate, setOwnerDate] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [tenantOpen, setTenantOpen] = useState(false);
  const [tenantForm, setTenantForm] = useState({ name: "", email: "", phone: "", rent: "", leaseStart: "" });
  const [moveOutOpen, setMoveOutOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState("vacant");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await apiRequest(`/lots/${id}`));
    } catch (e: any) {
      setLoadError(e?.message || tr("loadError"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  /** Runs an API action; on success reloads the lot. Returns the server error code, if any. */
  const run = async (fn: () => Promise<unknown>): Promise<{ ok: boolean; code?: string; body?: any; message?: string }> => {
    if (busy) return { ok: false };
    setBusy(true);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: tr("saved"), message: "" });
      await load();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, code: e?.code, message: e?.message };
    } finally {
      setBusy(false);
    }
  };
  const fail = (r: { message?: string }) => Alert.alert(tr("error"), r.message || tr("loadError"));

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (loadError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title={tr("title")} />
        <ErrorState title={tr("loadError")} description={loadError ?? ""} retryLabel={tr("retry")} onRetry={() => { setLoading(true); load(); }} accentColor={colors.primary} />
      </View>
    );
  }

  const lot = data.lot;
  const perms = data.permissions ?? {};
  const isArchived = !!lot.archivedAt;
  const card = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const input = [formStyles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }];
  const statusLabel = isArchived ? tr("archived") : lot.status === "rented" ? tr("rented") : lot.status === "vacant" ? tr("vacant") : tr("occupied");
  const mad = (v: any) => `${Number(v || 0).toLocaleString(L === "ar" ? "ar-MA" : "fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;

  // ─── Actions ────────────────────────────────────────────────────────────────
  const openEdit = () => {
    setEditForm({
      floor: lot.floor == null ? "" : String(lot.floor),
      surfaceM2: lot.surfaceM2 ? String(Number(lot.surfaceM2)) : "",
      tantiemes: String(lot.tantiemes ?? 0),
      titreFoncier: lot.titreFoncier ?? "",
      description: lot.description ?? "",
    });
    setEditOpen(true);
  };
  const submitEdit = async () => {
    const tantiemes = Number(editForm.tantiemes);
    if (!Number.isInteger(tantiemes) || tantiemes < 0 || (editForm.floor && !Number.isInteger(Number(editForm.floor)))) {
      return Alert.alert(tr("error"), tr("required"));
    }
    const r = await run(() =>
      apiRequest(`/lots/${lot.id}`, "PUT", {
        version: lot.version,
        floor: editForm.floor === "" ? null : Number(editForm.floor),
        surfaceM2: editForm.surfaceM2 === "" ? null : editForm.surfaceM2.replace(",", "."),
        tantiemes,
        titreFoncier: editForm.titreFoncier.trim() || null,
        description: editForm.description.trim() || null,
      }),
    );
    if (r.ok) setEditOpen(false);
    else {
      fail(r);
      if (r.code === "LOT_VERSION_CONFLICT") load();
    }
  };

  const openOwners = async () => {
    setOwnerRows((data.owners ?? []).map((o: any) => ({ memberId: o.memberId, name: o.name, share: String(Number(o.sharePercent)) })));
    setOwnerReason("");
    setOwnerDate("");
    setMemberQuery("");
    setOwnersOpen(true);
    try {
      const res = await apiRequest<{ data: any[] }>("/members?limit=200");
      setMembers(res.data ?? []);
    } catch {
      setMembers([]);
    }
  };
  const sharesTotal = ownerRows.reduce((s, o) => s + (Number(o.share.replace(",", ".")) || 0), 0);
  const submitOwners = async (acknowledgeOutstanding = false) => {
    if (ownerRows.length === 0 || ownerReason.trim().length < 3 || Math.round(sharesTotal * 100) !== 10000 || (ownerDate && !isValidYmd(ownerDate))) {
      return Alert.alert(tr("error"), `${tr("required")} (${tr("sharesTotal")} = 100 %)`);
    }
    const r = await run(() =>
      apiRequest(`/lots/${lot.id}/owners`, "PUT", {
        owners: ownerRows.map((o) => ({ memberId: o.memberId, sharePercent: o.share.replace(",", ".") })),
        reason: ownerReason.trim(),
        ...(ownerDate ? { effectiveDate: ownerDate } : {}),
        ...(acknowledgeOutstanding ? { acknowledgeOutstanding: true } : {}),
      }),
    );
    if (r.ok) return setOwnersOpen(false);
    if (r.code === "OUTSTANDING_BALANCE") {
      // Unpaid calls stay with their debtors: the syndic confirms explicitly.
      return Alert.alert(tr("outstandingConfirmTitle"), r.message, [
        { text: tr("cancel"), style: "cancel" },
        { text: tr("confirmContinue"), onPress: () => submitOwners(true) },
      ]);
    }
    fail(r);
  };

  const submitMoveIn = async () => {
    if (tenantForm.name.trim().length < 2 || (tenantForm.leaseStart && !isValidYmd(tenantForm.leaseStart)) || (tenantForm.rent && !(Number(tenantForm.rent) >= 0))) {
      return Alert.alert(tr("error"), tr("required"));
    }
    const r = await run(() =>
      apiRequest(`/lots/${lot.id}/tenancy`, "POST", {
        tenant: { name: tenantForm.name.trim(), ...(tenantForm.email.trim() ? { email: tenantForm.email.trim() } : {}), ...(tenantForm.phone.trim() ? { phone: tenantForm.phone.trim() } : {}) },
        ...(tenantForm.leaseStart ? { leaseStart: tenantForm.leaseStart } : {}),
        ...(tenantForm.rent ? { monthlyRent: Number(tenantForm.rent) } : {}),
      }),
    );
    if (r.ok) setTenantOpen(false);
    else fail(r);
  };
  const submitMoveOut = async () => {
    const r = await run(() => apiRequest(`/lots/${lot.id}/tenancy/end`, "POST", { nextStatus }));
    if (r.ok) setMoveOutOpen(false);
    else fail(r);
  };
  const submitArchive = async (acknowledgeOutstanding = false) => {
    if (archiveReason.trim().length < 3) return Alert.alert(tr("error"), tr("required"));
    const r = await run(() => apiRequest(`/lots/${lot.id}/archive`, "POST", { reason: archiveReason.trim(), ...(acknowledgeOutstanding ? { acknowledgeOutstanding: true } : {}) }));
    if (r.ok) return setArchiveOpen(false);
    if (r.code === "OUTSTANDING_BALANCE") {
      return Alert.alert(tr("outstandingConfirmTitle"), r.message, [
        { text: tr("cancel"), style: "cancel" },
        { text: tr("confirmContinue"), onPress: () => submitArchive(true) },
      ]);
    }
    fail(r);
  };
  const doRestore = async () => {
    const r = await run(() => apiRequest(`/lots/${lot.id}/restore`, "POST"));
    if (!r.ok) fail(r);
  };
  const doDelete = () =>
    Alert.alert(tr("remove"), tr("deleteConfirm"), [
      { text: tr("cancel"), style: "cancel" },
      {
        text: tr("remove"),
        style: "destructive",
        onPress: async () => {
          const r = await run(() => apiRequest(`/lots/${lot.id}`, "DELETE"));
          if (r.ok) router.back();
          else fail(r);
        },
      },
    ]);

  const filteredMembers = members
    .filter((m) => !ownerRows.some((o) => o.memberId === m.id))
    .filter((m) => !memberQuery.trim() || `${m.name} ${m.email}`.toLowerCase().includes(memberQuery.trim().toLowerCase()))
    .slice(0, 8);

  const Row = ({ label, value }: { label: string; value?: React.ReactNode }) => (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{value ?? "—"}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={`${tr("title")} ${lot.number}`} subtitle={`${lot.buildingName ?? data.building?.name ?? ""} · ${statusLabel}`} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {isArchived && (
          <View style={[styles.banner, { backgroundColor: colors.warningSoft, borderColor: colors.warning + "55" }]}>
            <Feather name="archive" size={16} color={colors.warning} />
            <Text style={[TYPE.bodyStrong, { color: colors.warningText, flex: 1 }]}>{tr("archived")} — {lot.archiveReason}</Text>
          </View>
        )}

        <View style={card}>
          <Text style={[styles.section, { color: colors.foreground }]}>{tr("identity")}</Text>
          <Row label={tr("building")} value={data.building?.name} />
          <Row label={tr("type")} value={lot.type} />
          <Row label={tr("floor")} value={lot.floor ?? "—"} />
          <Row label={tr("surface")} value={lot.surfaceM2 ? Number(lot.surfaceM2) : "—"} />
          <Row label={tr("tantiemes")} value={lot.tantiemes} />
          <Row label={tr("titre")} value={lot.titreFoncier} />
          {perms.canEdit && !isArchived && <ActionButton label={tr("edit")} icon="edit-2" onPress={openEdit} busy={busy} />}
        </View>

        {user?.role !== "tenant" && (
          <View style={card}>
            <Text style={[styles.section, { color: colors.foreground }]}>{tr("owners")}</Text>
            {(data.owners ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground }}>{tr("noOwner")}</Text>
            ) : (
              data.owners.map((o: any) => (
                <Row key={o.ownershipId ?? o.memberId} label={`${o.name}${o.email ? ` · ${o.email}` : ""}`} value={`${Number(o.sharePercent)} % · ${tr("since")} ${o.startDate}`} />
              ))
            )}
            {perms.canManageOwnership && !isArchived && <ActionButton label={tr("changeOwners")} icon="users" onPress={openOwners} busy={busy} />}
            {(data.ownershipHistory ?? []).some((h: any) => h.endDate) && (
              <>
                <Text style={[styles.sub, { color: colors.mutedForeground }]}>{tr("ownershipHistory")}</Text>
                {data.ownershipHistory.map((h: any) => (
                  <Text key={h.id} style={[styles.small, { color: colors.mutedForeground }]}>
                    {h.name} — {Number(h.sharePercent)} % — {h.startDate} → {h.endDate ?? tr("current")}{h.endReason ? ` (${h.endReason})` : ""}
                  </Text>
                ))}
              </>
            )}
          </View>
        )}

        <View style={card}>
          <Text style={[styles.section, { color: colors.foreground }]}>{tr("occupancy")}</Text>
          <Row label={statusLabel} value={data.tenant ? `${data.tenant.name} · ${tr("since")} ${data.tenant.leaseStart ?? "—"}${data.tenant.leaseEnd ? ` ${tr("until")} ${data.tenant.leaseEnd}` : ""}` : tr("noTenant")} />
          {perms.canManageTenancy && !isArchived && (
            <View style={styles.actions}>
              {data.tenant ? (
                <ActionButton label={tr("moveOut")} icon="log-out" onPress={() => { setNextStatus("vacant"); setMoveOutOpen(true); }} busy={busy} />
              ) : (
                <ActionButton label={tr("moveIn")} icon="log-in" onPress={() => { setTenantForm({ name: "", email: "", phone: "", rent: "", leaseStart: "" }); setTenantOpen(true); }} busy={busy} />
              )}
            </View>
          )}
          {(data.tenancies ?? []).filter((t: any) => t.id !== data.tenant?.id).map((t: any) => (
            <Text key={t.id} style={[styles.small, { color: colors.mutedForeground }]}>
              {t.name} — {t.leaseStart ?? "?"} → {t.leaseEnd ?? "?"} ({t.status})
            </Text>
          ))}
        </View>

        {user?.role !== "tenant" && data.financial && (
          <View style={card}>
            <Text style={[styles.section, { color: colors.foreground }]}>{tr("finance")}</Text>
            <Row label={tr("called")} value={mad(data.financial.called)} />
            <BalanceMeter
              paid={Number(data.financial.paid || 0)}
              total={Number(data.financial.called || 0)}
              paidLabel={tr("paid")}
              remainingLabel={tr("outstanding")}
              paidText={mad(data.financial.paid)}
              remainingText={mad(data.financial.outstanding?.total)}
              overdue={(data.charges ?? []).some((c: any) => c.status === "overdue")}
            />
            {(data.financial.outstanding?.byDebtor ?? []).map((d: any) => (
              <View key={d.memberId ?? "none"} style={styles.debtorRow}>
                <Feather name="user" size={13} color={colors.danger} />
                <Text style={[TYPE.secondary, { color: colors.dangerText, flex: 1 }]}>
                  {mad(d.due)} {tr("owedBy")} {d.name ?? "—"}
                </Text>
              </View>
            ))}
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>{tr("charges")}</Text>
            {(data.charges ?? []).length === 0 ? (
              <Text style={[styles.small, { color: colors.mutedForeground }]}>{tr("none")}</Text>
            ) : (
              data.charges.slice(0, 12).map((c: any) => {
                const st = callStatus(c.status);
                return (
                  <View key={c.id} style={[styles.chargeRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{c.period}</Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted, fontVariant: ["tabular-nums"] }]}>{mad(c.amount)}</Text>
                    </View>
                    <StatusBadge label={st.label} tone={st.tone} icon={st.icon} />
                  </View>
                );
              })
            )}
          </View>
        )}

        {user?.role !== "tenant" && (
          <View style={card}>
            <Text style={[styles.section, { color: colors.foreground }]}>{tr("documents")}</Text>
            {(data.documents ?? []).length === 0 ? (
              <Text style={[styles.small, { color: colors.mutedForeground }]}>{tr("none")}</Text>
            ) : (
              data.documents.map((d: any) => (
                <TouchableOpacity key={d.id} onPress={() => router.push({ pathname: "/documents", params: { documentId: d.id } } as any)}>
                  <Text style={[styles.small, { color: colors.tint }]}>{d.title} · {d.status}</Text>
                </TouchableOpacity>
              ))
            )}
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>{tr("related")}</Text>
            <Text style={[styles.small, { color: colors.mutedForeground }]}>
              {(data.travaux ?? []).length} {tr("works")} · {(data.sinistres ?? []).length} {tr("claims")}
            </Text>
          </View>
        )}

        {(data.history ?? []).length > 0 && (
          <View style={card}>
            <Text style={[styles.section, { color: colors.foreground }]}>{tr("history")}</Text>
            {data.history.slice(0, 20).map((h: any, i: number) => (
              <Text key={i} style={[styles.small, { color: colors.mutedForeground }]}>
                {String(h.createdAt).slice(0, 16).replace("T", " ")} · {h.action} · {h.userName ?? ""}
              </Text>
            ))}
          </View>
        )}

        {perms.canManageOwnership && (
          <View style={styles.actions}>
            {isArchived ? (
              <Button label={tr("restore")} icon="rotate-ccw" variant="secondary" style={{ flex: 1 }} onPress={doRestore} loading={busy} />
            ) : (
              <Button label={tr("archive")} icon="archive" variant="secondary" style={{ flex: 1 }} onPress={() => { setArchiveReason(""); setArchiveOpen(true); }} loading={busy} />
            )}
            <Button label={tr("remove")} icon="trash-2" variant="destructive" style={{ flex: 1 }} onPress={doDelete} loading={busy} />
          </View>
        )}
      </ScrollView>

      <FormSheet visible={editOpen} title={tr("edit")} onClose={() => setEditOpen(false)} closeLabel={tr("cancel")}>
        <FieldLabel label={tr("floor")} />
        <TextInput style={input} keyboardType="numbers-and-punctuation" value={editForm.floor} onChangeText={(v) => setEditForm((f) => ({ ...f, floor: v }))} />
        <FieldLabel label={tr("surface")} />
        <TextInput style={input} keyboardType="decimal-pad" value={editForm.surfaceM2} onChangeText={(v) => setEditForm((f) => ({ ...f, surfaceM2: v }))} />
        <FieldLabel label={tr("tantiemes")} />
        <TextInput style={input} keyboardType="number-pad" value={editForm.tantiemes} onChangeText={(v) => setEditForm((f) => ({ ...f, tantiemes: v }))} />
        <FieldLabel label={tr("titre")} />
        <TextInput style={input} value={editForm.titreFoncier} onChangeText={(v) => setEditForm((f) => ({ ...f, titreFoncier: v }))} />
        <TextInput style={[...input, { minHeight: 70 }]} multiline value={editForm.description} onChangeText={(v) => setEditForm((f) => ({ ...f, description: v }))} />
        <ActionButton label={tr("save")} icon="check" onPress={submitEdit} busy={busy} />
      </FormSheet>

      <FormSheet visible={ownersOpen} title={tr("changeOwners")} onClose={() => setOwnersOpen(false)} closeLabel={tr("cancel")}>
        {ownerRows.map((o, i) => (
          <View key={o.memberId} style={styles.ownerRow}>
            <Text style={{ flex: 1, color: colors.foreground }}>{o.name}</Text>
            <TextInput
              style={[...input, { width: 80 }]}
              keyboardType="decimal-pad"
              value={o.share}
              accessibilityLabel={tr("share")}
              onChangeText={(v) => setOwnerRows((rows) => rows.map((r, j) => (j === i ? { ...r, share: v } : r)))}
            />
            <TouchableOpacity onPress={() => setOwnerRows((rows) => rows.filter((_, j) => j !== i))} hitSlop={10}>
              <Feather name="x-circle" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))}
        <StatusBadge
          label={`${tr("sharesTotal")} : ${sharesTotal.toFixed(2)} %`}
          tone={Math.round(sharesTotal * 100) === 10000 ? "success" : "danger"}
          size="md"
        />
        <FieldLabel label={tr("pickMember")} />
        <TextInput style={input} placeholder={tr("search")} placeholderTextColor={colors.mutedForeground} value={memberQuery} onChangeText={setMemberQuery} />
        <ChoiceChips
          value=""
          options={filteredMembers.map((m) => ({ key: m.id, label: m.name }))}
          onChange={(k) => {
            const m = members.find((x) => x.id === k);
            if (m) setOwnerRows((rows) => [...rows, { memberId: m.id, name: m.name, share: rows.length ? "0" : "100" }]);
          }}
        />
        <TextInput style={input} placeholder={tr("effectiveDate")} placeholderTextColor={colors.mutedForeground} value={ownerDate} onChangeText={setOwnerDate} autoCapitalize="none" />
        <TextInput style={[...input, { minHeight: 60 }]} multiline placeholder={tr("reason")} placeholderTextColor={colors.mutedForeground} value={ownerReason} onChangeText={setOwnerReason} />
        <ActionButton label={tr("save")} icon="check" onPress={() => submitOwners(false)} busy={busy} />
      </FormSheet>

      <FormSheet visible={tenantOpen} title={tr("moveIn")} onClose={() => setTenantOpen(false)} closeLabel={tr("cancel")}>
        <TextInput style={input} placeholder={tr("tenantName")} placeholderTextColor={colors.mutedForeground} value={tenantForm.name} onChangeText={(v) => setTenantForm((f) => ({ ...f, name: v }))} />
        <TextInput style={input} placeholder={tr("email")} placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" value={tenantForm.email} onChangeText={(v) => setTenantForm((f) => ({ ...f, email: v }))} />
        <TextInput style={input} placeholder={tr("phone")} placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" value={tenantForm.phone} onChangeText={(v) => setTenantForm((f) => ({ ...f, phone: v }))} />
        <TextInput style={input} placeholder={tr("rent")} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" value={tenantForm.rent} onChangeText={(v) => setTenantForm((f) => ({ ...f, rent: v }))} />
        <TextInput style={input} placeholder={tr("leaseStart")} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" value={tenantForm.leaseStart} onChangeText={(v) => setTenantForm((f) => ({ ...f, leaseStart: v }))} />
        <ActionButton label={tr("save")} icon="check" onPress={submitMoveIn} busy={busy} />
      </FormSheet>

      <FormSheet visible={moveOutOpen} title={tr("moveOut")} onClose={() => setMoveOutOpen(false)} closeLabel={tr("cancel")}>
        <FieldLabel label={tr("afterDeparture")} />
        <ChoiceChips value={nextStatus} onChange={setNextStatus} options={[{ key: "vacant", label: tr("vacant") }, { key: "occupied", label: tr("occupied") }]} />
        <ActionButton label={tr("save")} icon="check" onPress={submitMoveOut} busy={busy} />
      </FormSheet>

      <FormSheet visible={archiveOpen} title={tr("archive")} onClose={() => setArchiveOpen(false)} closeLabel={tr("cancel")}>
        <TextInput style={[...input, { minHeight: 70 }]} multiline placeholder={tr("archiveReason")} placeholderTextColor={colors.mutedForeground} value={archiveReason} onChangeText={setArchiveReason} />
        <ActionButton label={tr("archive")} icon="archive" onPress={() => submitArchive(false)} busy={busy} />
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  section: { fontSize: 16, lineHeight: 22, fontFamily: "Inter_600SemiBold" },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  debtorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chargeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  sub: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 6 },
  small: { fontSize: 12, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
  value: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", flexShrink: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
