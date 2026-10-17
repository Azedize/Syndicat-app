import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { organizations as orgApi, type CondominiumStatus, type MoneyByCurrency, type Portfolio, type PortfolioRow, type TeamRole } from "@/services/api";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";

/**
 * Company portfolio: every condominium of the syndic company the person can
 * see, with figures computed by the server from each condominium's own
 * records. Creating a condominium, changing its status and assigning the
 * team are done here; day-to-day work happens after switching into it.
 */
type Lang = "fr" | "en" | "ar" | "es";
type T = (k: keyof typeof S) => string;
const S = {
  title: { fr: "Portefeuille", en: "Portfolio", ar: "المحفظة", es: "Cartera" },
  noCompany: { fr: "Vous n'êtes membre d'aucune société de syndic.", en: "You are not a member of any property-management company.", ar: "لست عضوا في أي شركة تسيير.", es: "No pertenece a ninguna empresa." },
  loadError: { fr: "Impossible de charger le portefeuille.", en: "Could not load the portfolio.", ar: "تعذر تحميل المحفظة.", es: "No se pudo cargar la cartera." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
  empty: { fr: "Aucune copropriété dans ce portefeuille.", en: "No condominium in this portfolio.", ar: "لا توجد إقامات.", es: "Ninguna comunidad." },
  definitions: { fr: "Définitions", en: "Definitions", ar: "التعريفات", es: "Definiciones" },
  totals: { fr: "Vue d'ensemble", en: "Overview", ar: "نظرة عامة", es: "Resumen" },
  condominiums: { fr: "Copropriétés", en: "Condominiums", ar: "الإقامات", es: "Comunidades" },
  activeCondominiums: { fr: "Actives", en: "Active", ar: "النشطة", es: "Activas" },
  buildings: { fr: "Immeubles", en: "Buildings", ar: "المباني", es: "Edificios" },
  units: { fr: "Lots", en: "Units", ar: "الوحدات", es: "Unidades" },
  vacantUnits: { fr: "Lots vacants", en: "Vacant units", ar: "وحدات شاغرة", es: "Vacantes" },
  coOwners: { fr: "Copropriétaires", en: "Co-owners", ar: "الملاك", es: "Propietarios" },
  outstanding: { fr: "Reste dû", en: "Outstanding", ar: "المتبقي", es: "Pendiente" },
  overdueCalls: { fr: "Appels en retard", en: "Overdue calls", ar: "نداءات متأخرة", es: "Recibos vencidos" },
  paymentsToValidate: { fr: "Paiements à valider", en: "Payments to validate", ar: "دفعات للمصادقة", es: "Pagos por validar" },
  openIncidents: { fr: "Incidents ouverts", en: "Open incidents", ar: "حوادث مفتوحة", es: "Incidencias" },
  treasury: { fr: "Trésorerie", en: "Treasury", ar: "الخزينة", es: "Tesorería" },
  newCondo: { fr: "Nouvelle copropriété", en: "New condominium", ar: "إقامة جديدة", es: "Nueva comunidad" },
  name: { fr: "Nom *", en: "Name *", ar: "الاسم *", es: "Nombre *" },
  address: { fr: "Adresse *", en: "Address *", ar: "العنوان *", es: "Dirección *" },
  city: { fr: "Ville *", en: "City *", ar: "المدينة *", es: "Ciudad *" },
  email: { fr: "Email de contact", en: "Contact email", ar: "البريد الإلكتروني", es: "Email" },
  phone: { fr: "Téléphone", en: "Phone", ar: "الهاتف", es: "Teléfono" },
  registration: { fr: "N° d'immatriculation", en: "Registration number", ar: "رقم التسجيل", es: "N.º de registro" },
  currency: { fr: "Devise (ISO)", en: "Currency (ISO)", ar: "العملة", es: "Moneda" },
  language: { fr: "Langue par défaut", en: "Default language", ar: "اللغة الافتراضية", es: "Idioma" },
  fiscalMonth: { fr: "Début de l'exercice (mois 1–12)", en: "Fiscal year start (month 1–12)", ar: "بداية السنة المالية (1–12)", es: "Inicio del ejercicio (1–12)" },
  create: { fr: "Créer (brouillon)", en: "Create (draft)", ar: "إنشاء (مسودة)", es: "Crear (borrador)" },
  created: { fr: "Copropriété créée en brouillon. Ajoutez un immeuble puis activez-la.", en: "Created as draft. Add a building, then activate it.", ar: "أنشئت كمسودة. أضف مبنى ثم فعّلها.", es: "Creada como borrador." },
  required: { fr: "Champ obligatoire", en: "Required", ar: "حقل إلزامي", es: "Obligatorio" },
  work: { fr: "Travailler dans cette copropriété", en: "Work in this condominium", ar: "العمل في هذه الإقامة", es: "Trabajar aquí" },
  team: { fr: "Équipe & affectations", en: "Team & assignments", ar: "الفريق والتكليفات", es: "Equipo" },
  status: { fr: "Changer le statut", en: "Change status", ar: "تغيير الحالة", es: "Cambiar estado" },
  reason: { fr: "Motif (obligatoire sauf réactivation)", en: "Reason (required except to activate)", ar: "السبب (إلزامي)", es: "Motivo" },
  confirm: { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  noTransition: { fr: "Une copropriété archivée ne change plus de statut.", en: "An archived condominium cannot change status.", ar: "لا يمكن تغيير حالة إقامة مؤرشفة.", es: "Archivada: sin cambios." },
  archiveWarn: { fr: "L'archivage est définitif : l'historique est conservé, la copropriété passe en lecture seule.", en: "Archiving is final: history is kept, the condominium becomes read-only.", ar: "الأرشفة نهائية: يُحفظ السجل وتصبح للقراءة فقط.", es: "Archivar es definitivo." },
  assign: { fr: "Affecter", en: "Assign", ar: "تكليف", es: "Asignar" },
  assignEmail: { fr: "Email du compte à affecter", en: "Email of the account", ar: "بريد الحساب", es: "Email de la cuenta" },
  revoke: { fr: "Retirer l'accès", en: "Revoke access", ar: "سحب الوصول", es: "Revocar" },
  revokeConfirm: { fr: "L'accès est retiré immédiatement, y compris sur les sessions ouvertes.", en: "Access is removed immediately, including open sessions.", ar: "يُسحب الوصول فورا.", es: "Se revoca de inmediato." },
  assignments: { fr: "Affectations", en: "Assignments", ar: "التكليفات", es: "Asignaciones" },
  homeTeam: { fr: "Équipe rattachée (gérée dans « Équipe »)", en: "Home team (managed in “Team”)", ar: "الفريق الأساسي", es: "Equipo propio" },
  noAssignment: { fr: "Aucune affectation.", en: "No assignment.", ar: "لا توجد تكليفات.", es: "Sin asignaciones." },
  drillOutstanding: { fr: "Impayés", en: "Unpaid", ar: "غير المدفوع", es: "Impagos" },
  drillIncidents: { fr: "Incidents", en: "Incidents", ar: "الحوادث", es: "Incidencias" },
  nothing: { fr: "Rien à afficher.", en: "Nothing to show.", ar: "لا شيء.", es: "Nada." },
  lot: { fr: "Lot", en: "Unit", ar: "الوحدة", es: "Unidad" },
  draft: { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
  active: { fr: "Active", en: "Active", ar: "نشطة", es: "Activa" },
  suspended: { fr: "Suspendue", en: "Suspended", ar: "موقوفة", es: "Suspendida" },
  archived: { fr: "Archivée", en: "Archived", ar: "مؤرشفة", es: "Archivada" },
  toActive: { fr: "Activer", en: "Activate", ar: "تفعيل", es: "Activar" },
  toSuspended: { fr: "Suspendre", en: "Suspend", ar: "إيقاف", es: "Suspender" },
  toArchived: { fr: "Archiver", en: "Archive", ar: "أرشفة", es: "Archivar" },
} as const;

const ROLE_LABEL: Record<TeamRole, Record<Lang, string>> = {
  syndicate_admin: { fr: "Syndic", en: "Manager", ar: "السنديك", es: "Administrador" },
  president: { fr: "Président", en: "President", ar: "الرئيس", es: "Presidente" },
  treasurer: { fr: "Trésorier", en: "Treasurer", ar: "أمين المال", es: "Tesorero" },
  secretary: { fr: "Secrétaire", en: "Secretary", ar: "الكاتب", es: "Secretario" },
  committee_member: { fr: "Conseil syndical", en: "Council", ar: "المجلس", es: "Consejo" },
};
const TEAM_ROLES = Object.keys(ROLE_LABEL) as TeamRole[];
// Mirrors the server's TRANSITIONS map (the server still decides).
const NEXT: Record<CondominiumStatus, Exclude<CondominiumStatus, "draft">[]> = {
  draft: ["active", "archived"],
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
  archived: [],
};
const STATUS_COLOR: Record<CondominiumStatus, string> = { draft: "#64748b", active: "#10b981", suspended: "#f59e0b", archived: "#94a3b8" };
const newKey = () => `condo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const money = (m: MoneyByCurrency) => (m.length ? m.map((x) => `${Number(x.amount).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${x.currency}`).join(" · ") : "0");

// ─── Sheets (module level so typing never remounts them) ─────────────────────

function CreateSheet({ visible, orgId, onClose, onCreated, tr }: { visible: boolean; orgId: string; onClose: () => void; onCreated: () => void; tr: T }) {
  const colors = useColors();
  const blank = { name: "", address: "", city: "", email: "", phone: "", registrationNumber: "", currency: "MAD", defaultLanguage: "fr", fiscalYearStartMonth: "1" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per form: a retry after a lost response returns the same condominium.
  const key = useRef(newKey());
  useEffect(() => {
    if (visible) {
      setF(blank);
      setErr(null);
      key.current = newKey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const input = (field: keyof typeof blank, label: keyof typeof S, extra?: object) => (
    <View style={{ gap: 4 }}>
      <FieldLabel label={tr(label)} error={err?.field === field ? err.message : null} />
      <TextInput
        value={f[field]}
        onChangeText={(v) => setF((p) => ({ ...p, [field]: v }))}
        style={[formStyles.input, { borderColor: err?.field === field ? "#ef4444" : colors.border, color: colors.foreground, backgroundColor: colors.card }]}
        placeholderTextColor={colors.mutedForeground}
        {...extra}
      />
    </View>
  );
  const submit = async () => {
    for (const k of ["name", "address", "city"] as const) {
      if (!f[k].trim()) return setErr({ field: k, message: tr("required") });
    }
    setBusy(true);
    setErr(null);
    try {
      const opt = (v: string) => (v.trim() ? v.trim() : undefined);
      await orgApi.createCondominium(
        orgId,
        {
          name: f.name.trim(),
          address: f.address.trim(),
          city: f.city.trim(),
          email: opt(f.email),
          phone: opt(f.phone),
          registrationNumber: opt(f.registrationNumber),
          currency: f.currency.trim().toUpperCase() || "MAD",
          defaultLanguage: f.defaultLanguage as "fr",
          fiscalYearStartMonth: Number(f.fiscalYearStartMonth) || 1,
        },
        key.current,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(tr("newCondo"), tr("created"));
      onCreated();
    } catch (e: any) {
      setErr({ field: e?.body?.field, message: e?.message ?? tr("error") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormSheet visible={visible} title={tr("newCondo")} onClose={onClose} closeLabel={tr("close")}>
      {input("name", "name")}
      {input("address", "address")}
      {input("city", "city")}
      {input("email", "email", { keyboardType: "email-address", autoCapitalize: "none" })}
      {input("phone", "phone", { keyboardType: "phone-pad" })}
      {input("registrationNumber", "registration")}
      {input("currency", "currency", { autoCapitalize: "characters", maxLength: 3 })}
      <FieldLabel label={tr("language")} error={err?.field === "defaultLanguage" ? err.message : null} />
      <ChoiceChips value={f.defaultLanguage} onChange={(v) => setF((p) => ({ ...p, defaultLanguage: v }))} options={["fr", "ar", "en", "es"].map((k) => ({ key: k, label: k.toUpperCase() }))} />
      {input("fiscalYearStartMonth", "fiscalMonth", { keyboardType: "number-pad", maxLength: 2 })}
      {err && !err.field ? <Text style={{ color: "#ef4444" }}>{err.message}</Text> : null}
      <ActionButton label={tr("create")} icon="plus" onPress={submit} busy={busy} />
    </FormSheet>
  );
}

function StatusSheet({ condo, onClose, onDone, tr }: { condo: PortfolioRow | null; onClose: () => void; onDone: () => void; tr: T }) {
  const colors = useColors();
  const [target, setTarget] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = condo ? NEXT[condo.status] ?? [] : [];
  useEffect(() => {
    setTarget(options[0] ?? "");
    setReason("");
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condo?.id]);
  const label = (s: string) => tr(s === "active" ? "toActive" : s === "suspended" ? "toSuspended" : "toArchived");
  const submit = async () => {
    if (!condo || !target) return;
    if (target !== "active" && reason.trim().length < 3) return setErr(tr("reason"));
    setBusy(true);
    setErr(null);
    try {
      await orgApi.setStatus(condo.id, target as "active", reason.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? tr("error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormSheet visible={!!condo} title={`${tr("status")} — ${condo?.name ?? ""}`} onClose={onClose} closeLabel={tr("close")}>
      {options.length === 0 ? (
        <Text style={{ color: colors.mutedForeground }}>{tr("noTransition")}</Text>
      ) : (
        <>
          <ChoiceChips value={target} onChange={setTarget} options={options.map((k) => ({ key: k, label: label(k) }))} />
          {target === "archived" ? <Text style={{ color: "#b45309", fontSize: 13 }}>{tr("archiveWarn")}</Text> : null}
          <FieldLabel label={tr("reason")} />
          <TextInput value={reason} onChangeText={setReason} multiline style={[formStyles.input, { minHeight: 70, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} />
          {err ? <Text style={{ color: "#ef4444" }}>{err}</Text> : null}
          <ActionButton label={tr("confirm")} onPress={submit} busy={busy} color={target === "archived" ? "#ef4444" : undefined} />
        </>
      )}
    </FormSheet>
  );
}

function TeamSheet({ condo, onClose, tr, lang }: { condo: PortfolioRow | null; onClose: () => void; tr: T; lang: Lang }) {
  const colors = useColors();
  type Data = Awaited<ReturnType<typeof orgApi.memberships>>["data"];
  const [data, setData] = useState<Data | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("committee_member");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!condo) return;
    setLoadErr(null);
    try {
      setData((await orgApi.memberships(condo.id)).data);
    } catch (e: any) {
      setLoadErr(e?.message ?? tr("error"));
    }
  }, [condo, tr]);
  useEffect(() => {
    setData(null);
    setEmail("");
    setErr(null);
    load();
  }, [load]);
  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setErr(e?.message ?? tr("error"));
    } finally {
      setBusy(null);
    }
  };
  const archived = condo?.status === "archived";
  const active = data?.assignments.filter((a) => a.status === "active") ?? [];
  return (
    <FormSheet visible={!!condo} title={`${tr("team")} — ${condo?.name ?? ""}`} onClose={onClose} closeLabel={tr("close")}>
      {loadErr ? (
        <ErrorState title={loadErr} description="" retryLabel={tr("retry")} onRetry={load} accentColor={colors.primary} />
      ) : !data ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          {!archived && (
            <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <FieldLabel label={tr("assignEmail")} />
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={[formStyles.input, { borderColor: colors.border, color: colors.foreground }]} />
              <ChoiceChips value={role} onChange={(v) => setRole(v as TeamRole)} options={TEAM_ROLES.map((k) => ({ key: k, label: ROLE_LABEL[k][lang] }))} />
              <ActionButton
                label={tr("assign")}
                icon="user-plus"
                busy={busy === "new"}
                disabled={!email.trim()}
                onPress={() => run("new", async () => { await orgApi.assign(condo!.id, email.trim(), role); setEmail(""); })}
              />
            </View>
          )}
          {err ? <Text style={{ color: "#ef4444" }}>{err}</Text> : null}
          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("assignments")}</Text>
          {active.length === 0 ? <Text style={{ color: colors.mutedForeground }}>{tr("noAssignment")}</Text> : null}
          {active.map((a) => (
            <View key={a.id} style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.name, { color: colors.foreground }]}>{a.name}</Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>{a.email}</Text>
              <ChoiceChips
                value={a.role}
                onChange={(v) => v !== a.role && !archived && run(a.id, () => orgApi.changeRole(condo!.id, a.id, v as TeamRole))}
                options={TEAM_ROLES.map((k) => ({ key: k, label: ROLE_LABEL[k][lang] }))}
              />
              {!archived && (
                <ActionButton
                  label={tr("revoke")}
                  icon="user-x"
                  color="#ef4444"
                  busy={busy === a.id}
                  onPress={() =>
                    Alert.alert(tr("revoke"), tr("revokeConfirm"), [
                      { text: tr("close"), style: "cancel" },
                      { text: tr("revoke"), style: "destructive", onPress: () => run(a.id, () => orgApi.revoke(condo!.id, a.id)) },
                    ])
                  }
                />
              )}
            </View>
          ))}
          {data.homeTeam.length > 0 && <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("homeTeam")}</Text>}
          {data.homeTeam.map((h) => (
            <Text key={h.userId} style={[styles.meta, { color: colors.foreground }]}>
              {h.name} · {ROLE_LABEL[h.role]?.[lang] ?? h.role}
            </Text>
          ))}
        </>
      )}
    </FormSheet>
  );
}

function DrillSheet({ drill, orgId, onClose, tr }: { drill: { condo: PortfolioRow; kind: "outstanding" | "incidents" } | null; orgId: string; onClose: () => void; tr: T }) {
  const colors = useColors();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!drill) return;
    setErr(null);
    setRows(null);
    try {
      const res = drill.kind === "outstanding" ? await orgApi.outstanding(orgId, drill.condo.id) : await orgApi.incidents(orgId, drill.condo.id);
      setRows(res.data ?? []);
    } catch (e: any) {
      setErr(e?.message ?? tr("error"));
    }
  }, [drill, orgId, tr]);
  useEffect(() => {
    load();
  }, [load]);
  const title = drill ? `${tr(drill.kind === "outstanding" ? "drillOutstanding" : "drillIncidents")} — ${drill.condo.name}` : "";
  return (
    <FormSheet visible={!!drill} title={title} onClose={onClose} closeLabel={tr("close")}>
      {err ? (
        <ErrorState title={err} description="" retryLabel={tr("retry")} onRetry={load} accentColor={colors.primary} />
      ) : !rows ? (
        <ActivityIndicator color={colors.primary} />
      ) : rows.length === 0 ? (
        <Text style={{ color: colors.mutedForeground }}>{tr("nothing")}</Text>
      ) : (
        rows.map((r) => (
          <View key={`${r.kind ?? "a"}-${r.id}`} style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {drill?.kind === "outstanding" ? (
              <>
                <Text style={[styles.name, { color: colors.foreground }]}>
                  {tr("lot")} {r.lot_number} · {Number(r.remaining).toFixed(2)} {drill.condo.currency}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {r.period} · {r.type} · {r.status}
                  {r.owner_name ? ` · ${r.owner_name}` : ""}
                  {r.due_date ? ` · ${String(r.due_date).slice(0, 10)}` : ""}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.name, { color: colors.foreground }]}>{r.label}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {r.kind} · {r.status} · {String(r.created_at).slice(0, 10)}
                </Text>
              </>
            )}
          </View>
        ))
      )}
    </FormSheet>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PortefeuilleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const L = (["fr", "en", "ar", "es"].includes(lang) ? lang : "fr") as Lang;
  const tr: T = useCallback((k) => S[k][L] ?? S[k].fr, [L]);
  const { switchContext, user } = useAuth();

  const [orgs, setOrgs] = useState<Awaited<ReturnType<typeof orgApi.mine>>["data"] | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDefs, setShowDefs] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusOf, setStatusOf] = useState<PortfolioRow | null>(null);
  const [teamOf, setTeamOf] = useState<PortfolioRow | null>(null);
  const [drill, setDrill] = useState<{ condo: PortfolioRow; kind: "outstanding" | "incidents" } | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const mine = (await orgApi.mine()).data ?? [];
      setOrgs(mine);
      const id = mine.some((o) => o.id === orgId) ? orgId : mine[0]?.id ?? "";
      setOrgId(id);
      setPf(id ? (await orgApi.portfolio(id)).data : null);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [orgId]);
  useEffect(() => {
    load();
  }, [load]);

  const org = orgs?.find((o) => o.id === orgId);
  const isAdmin = org?.role === "org_admin";

  const work = async (c: PortfolioRow) => {
    if (c.id === user?.syndicateId) {
      router.replace("/(tabs)" as any);
      return;
    }
    setSwitching(c.id);
    try {
      await switchContext(c.id);
      if (router.canDismiss()) router.dismissAll();
      router.replace("/(tabs)" as any);
    } catch (e: any) {
      Alert.alert(tr("error"), e?.message ?? tr("error"));
      setSwitching(null);
    }
  };

  const Metric = ({ k, value }: { k: keyof typeof S; value: string | number }) => (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricVal, { color: colors.foreground }]} numberOfLines={2}>{value}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{tr(k)}</Text>
    </View>
  );

  const body = () => {
    if (error) return <ErrorState title={tr("loadError")} description="" retryLabel={tr("retry")} onRetry={() => { setOrgs(null); load(); }} accentColor={colors.primary} />;
    if (!orgs) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
    if (orgs.length === 0) return <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{tr("noCompany")}</Text>;
    const t = pf?.totals;
    return (
      <>
        {orgs.length > 1 && <ChoiceChips value={orgId} onChange={(id) => { setPf(null); setOrgId(id); }} options={orgs.map((o) => ({ key: o.id, label: o.name }))} />}
        <View style={styles.rowBetween}>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("totals")} · {org?.name}</Text>
          <TouchableOpacity onPress={() => setShowDefs((v) => !v)} accessibilityRole="button" style={styles.row}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 12 }}>{tr("definitions")}</Text>
          </TouchableOpacity>
        </View>
        {!pf ? (
          <ActivityIndicator color={colors.primary} />
        ) : t ? (
          <View style={styles.grid}>
            <Metric k="condominiums" value={t.condominiums} />
            <Metric k="activeCondominiums" value={t.activeCondominiums} />
            <Metric k="buildings" value={t.buildings} />
            <Metric k="units" value={t.units} />
            <Metric k="vacantUnits" value={t.vacantUnits} />
            <Metric k="coOwners" value={t.coOwners} />
            <Metric k="outstanding" value={money(t.outstanding)} />
            <Metric k="overdueCalls" value={t.overdueCalls} />
            <Metric k="paymentsToValidate" value={t.paymentsToValidate} />
            <Metric k="openIncidents" value={t.openIncidents} />
            <Metric k="treasury" value={money(t.treasury)} />
          </View>
        ) : null}
        {showDefs && pf && (
          <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {Object.entries(pf.definitions).map(([k, d]) => (
              <Text key={k} style={[styles.meta, { color: colors.foreground }]}>
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{k in S ? tr(k as keyof typeof S) : k} : </Text>
                {d}
              </Text>
            ))}
          </View>
        )}
        <View style={styles.rowBetween}>
          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("condominiums")}</Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => setCreating(true)} style={styles.row} accessibilityRole="button">
              <Feather name="plus-circle" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{tr("newCondo")}</Text>
            </TouchableOpacity>
          )}
        </View>
        {pf && pf.condominiums.length === 0 ? <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{tr("empty")}</Text> : null}
        {pf?.condominiums.map((c) => {
          const open = expanded === c.id;
          return (
            <View key={c.id} style={[styles.card, { backgroundColor: colors.card, borderColor: c.id === user?.syndicateId ? colors.primary : colors.border }]}>
              <TouchableOpacity onPress={() => setExpanded(open ? null : c.id)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{c.name}</Text>
                    <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                      {c.city ?? ""} · {c.buildings} {tr("buildings").toLowerCase()} · {c.units} {tr("units").toLowerCase()} · {c.coOwners} {tr("coOwners").toLowerCase()}
                    </Text>
                  </View>
                  <Text style={[styles.badge, { color: STATUS_COLOR[c.status] ?? colors.mutedForeground }]}>{tr(c.status)}</Text>
                </View>
                <Text style={[styles.meta, { color: colors.foreground, marginTop: 6 }]}>
                  {tr("outstanding")} {Number(c.outstanding).toFixed(2)} {c.currency} · {tr("overdueCalls")} {c.overdueCalls} · {tr("paymentsToValidate")} {c.paymentsToValidate} · {tr("openIncidents")} {c.openIncidents}
                </Text>
              </TouchableOpacity>
              {open && (
                <View style={{ gap: 8, marginTop: 10 }}>
                  <View style={styles.actions}>
                    <ActionButton label={tr("drillOutstanding")} icon="credit-card" onPress={() => setDrill({ condo: c, kind: "outstanding" })} color="#0f766e" />
                    <ActionButton label={tr("drillIncidents")} icon="alert-triangle" onPress={() => setDrill({ condo: c, kind: "incidents" })} color="#f59e0b" />
                  </View>
                  <View style={styles.actions}>
                    <ActionButton label={tr("work")} icon="log-in" onPress={() => work(c)} busy={switching === c.id} disabled={!!switching || (c.status === "archived" && !isAdmin)} />
                    {isAdmin && <ActionButton label={tr("team")} icon="users" onPress={() => setTeamOf(c)} color="#2563EB" />}
                    {isAdmin && <ActionButton label={tr("status")} icon="sliders" onPress={() => setStatusOf(c)} color="#64748b" />}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={tr("title")} subtitle={org?.name} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {body()}
      </ScrollView>
      {orgId ? <CreateSheet visible={creating} orgId={orgId} tr={tr} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} /> : null}
      <StatusSheet condo={statusOf} tr={tr} onClose={() => setStatusOf(null)} onDone={() => { setStatusOf(null); load(); }} />
      <TeamSheet condo={teamOf} tr={tr} lang={L} onClose={() => { setTeamOf(null); load(); }} />
      <DrillSheet drill={drill} orgId={orgId} tr={tr} onClose={() => setDrill(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: 12 },
  metricVal: { fontSize: 17, fontFamily: "Inter_700Bold" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  box: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  section: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  emptyText: { textAlign: "center", paddingVertical: 16 },
});
