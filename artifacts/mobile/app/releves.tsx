import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";

/**
 * Bank statements of one account and their reconciliation. A statement is
 * what the bank issued (period, printed balances, lines). The server computes
 * the report; the statement can only be closed when its lines add up, every
 * line is explained and the adjusted balances agree. Matching itself is done
 * line by line in the Treasury screen.
 */
export default function RelevesScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "treasurer", "president", "committee_member"]}>
      <RelevesInner />
    </RoleGuard>
  );
}

type Lang = "fr" | "en" | "ar" | "es";
type T = (k: keyof typeof S) => string;
const S = {
  title: { fr: "Relevés bancaires", en: "Bank statements", ar: "كشوف الحساب", es: "Extractos" },
  newStatement: { fr: "Nouveau relevé", en: "New statement", ar: "كشف جديد", es: "Nuevo extracto" },
  reference: { fr: "N° du relevé (facultatif)", en: "Statement no. (optional)", ar: "رقم الكشف (اختياري)", es: "N.º de extracto (opcional)" },
  periodStart: { fr: "Début de période (AAAA-MM-JJ)", en: "Period start (YYYY-MM-DD)", ar: "بداية الفترة", es: "Inicio (AAAA-MM-DD)" },
  periodEnd: { fr: "Fin de période (AAAA-MM-JJ)", en: "Period end (YYYY-MM-DD)", ar: "نهاية الفترة", es: "Fin (AAAA-MM-DD)" },
  opening: { fr: "Solde d'ouverture imprimé", en: "Printed opening balance", ar: "الرصيد الافتتاحي المطبوع", es: "Saldo inicial impreso" },
  closing: { fr: "Solde de clôture imprimé", en: "Printed closing balance", ar: "الرصيد الختامي المطبوع", es: "Saldo final impreso" },
  lines: { fr: "Lignes : date;montant;libellé;référence (une par ligne, montant négatif = débit)", en: "Lines: date;amount;label;reference (one per line, negative = debit)", ar: "الأسطر: التاريخ;المبلغ;البيان;المرجع", es: "Líneas: fecha;importe;concepto;referencia" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
  closeStatement: { fr: "Clôturer le rapprochement", en: "Close the reconciliation", ar: "إقفال المطابقة", es: "Cerrar conciliación" },
  reopen: { fr: "Rouvrir", en: "Reopen", ar: "إعادة الفتح", es: "Reabrir" },
  reopenReason: { fr: "Motif de réouverture", en: "Reason for reopening", ar: "سبب إعادة الفتح", es: "Motivo" },
  addLines: { fr: "Ajouter des lignes", en: "Add lines", ar: "إضافة أسطر", es: "Añadir líneas" },
  empty: { fr: "Aucun relevé : le compte n'est pas rapproché.", en: "No statement: the account is not reconciled.", ar: "لا يوجد كشف: الحساب غير مطابق.", es: "Sin extractos: cuenta no conciliada." },
  loadError: { fr: "Impossible de charger les relevés.", en: "Could not load statements.", ar: "تعذر التحميل.", es: "No se pudo cargar." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  invalid: { fr: "Champs invalides : dates AAAA-MM-JJ, montants à 2 décimales.", en: "Invalid fields: YYYY-MM-DD dates, 2-decimal amounts.", ar: "حقول غير صالحة.", es: "Campos no válidos." },
  open: { fr: "Ouvert", en: "Open", ar: "مفتوح", es: "Abierto" },
  closed: { fr: "Clôturé", en: "Closed", ar: "مقفل", es: "Cerrado" },
  toResolve: { fr: "à traiter", en: "to resolve", ar: "للمعالجة", es: "por resolver" },
  bankClosing: { fr: "Solde banque (relevé)", en: "Bank balance (statement)", ar: "رصيد البنك", es: "Saldo banco" },
  inTransit: { fr: "+ Opérations en transit (journal)", en: "+ In transit (books)", ar: "+ عمليات في الطريق", es: "+ En tránsito" },
  adjustedBank: { fr: "= Banque ajustée", en: "= Adjusted bank", ar: "= البنك المعدل", es: "= Banco ajustado" },
  ledger: { fr: "Solde du journal", en: "Book balance", ar: "رصيد اليومية", es: "Saldo contable" },
  notBooked: { fr: "+ Lignes non comptabilisées", en: "+ Bank lines not booked", ar: "+ أسطر غير مسجلة", es: "+ Líneas no contabilizadas" },
  adjustedBook: { fr: "= Journal ajusté", en: "= Adjusted books", ar: "= اليومية المعدلة", es: "= Contabilidad ajustada" },
  difference: { fr: "Écart", en: "Difference", ar: "الفرق", es: "Diferencia" },
  blocking: { fr: "À régler avant clôture", en: "To fix before closing", ar: "للتسوية قبل الإقفال", es: "A resolver" },
  ready: { fr: "Tout est expliqué : le relevé peut être clôturé.", en: "Everything is explained: the statement can be closed.", ar: "كل شيء مفسر: يمكن الإقفال.", es: "Todo explicado: se puede cerrar." },
  timing: { fr: "Opérations en transit (décalages de date)", en: "In transit (timing differences)", ar: "عمليات في الطريق", es: "En tránsito" },
  bankLines: { fr: "Lignes bancaires sans écriture", en: "Bank lines without entry", ar: "أسطر بنكية بدون قيد", es: "Líneas sin asiento" },
  discrepancies: { fr: "Points de contrôle", en: "Checks", ar: "نقاط المراقبة", es: "Controles" },
  dupRefs: { fr: "Références en double sur le relevé", en: "Duplicate references on the statement", ar: "مراجع مكررة", es: "Referencias duplicadas" },
  dupEntries: { fr: "Écritures en double (même référence et montant)", en: "Duplicate entries (same ref. and amount)", ar: "قيود مكررة", es: "Asientos duplicados" },
  mismatches: { fr: "Montants différents (rapprochement partiel)", en: "Different amounts (partial match)", ar: "مبالغ مختلفة", es: "Importes distintos" },
  reversals: { fr: "Extournes compensées (jamais passées en banque)", en: "Offsetting reversals (never at the bank)", ar: "قيود معكوسة متقابلة", es: "Anulaciones compensadas" },
  anomalies: { fr: "Anomalies signalées", en: "Flagged anomalies", ar: "خلل مُبلغ عنه", es: "Anomalías" },
  stale: { fr: "en transit depuis plus de 60 jours", en: "in transit for over 60 days", ar: "أكثر من 60 يوما", es: "más de 60 días" },
  book: { fr: "Comptabiliser", en: "Book", ar: "تسجيل", es: "Contabilizar" },
  bookHint: { fr: "Frais, agios ou intérêts uniquement. Un fournisseur se paie par les dépenses, un copropriétaire par son appel de fonds.", en: "Fees, overdraft charges or interest only.", ar: "رسوم أو فوائد فقط.", es: "Solo comisiones o intereses." },
  days: { fr: "j", en: "d", ar: "ي", es: "d" },
} as const;

const CATS = { out: ["frais_bancaires", "agios", "regularisation"], in: ["interets_bancaires", "regularisation"] };
const fmt = (v: string | number) => `${Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
const signed = (v: string) => {
  const x = v.replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d{1,2})?$/.test(x) ? Number(x).toFixed(2) : null;
};
function parseLines(text: string) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = rows.map((l) => {
    const [valueDate, amount, label, reference] = l.split(";").map((p) => p?.trim());
    return { valueDate, amount: signed(amount ?? ""), label, reference: reference || undefined };
  });
  return out.some((l) => !isDate(l.valueDate ?? "") || !l.amount || Number(l.amount) === 0 || !l.label) ? null : out;
}

function StatementForm({ visible, accountId, onClose, onDone, tr }: { visible: boolean; accountId: string; onClose: () => void; onDone: () => void; tr: T }) {
  const colors = useColors();
  const [f, setF] = useState({ reference: "", periodStart: "", periodEnd: "", openingBalance: "", closingBalance: "", lines: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setF({ reference: "", periodStart: "", periodEnd: "", openingBalance: "", closingBalance: "", lines: "" });
      setErr(null);
    }
  }, [visible]);
  const field = (k: keyof typeof f, label: keyof typeof S, extra?: object) => (
    <View style={{ gap: 4 }}>
      <FieldLabel label={tr(label)} />
      <TextInput value={f[k]} onChangeText={(v) => setF((p) => ({ ...p, [k]: v }))} style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} {...extra} />
    </View>
  );
  const submit = async () => {
    const opening = signed(f.openingBalance);
    const closing = signed(f.closingBalance);
    const lines = f.lines.trim() ? parseLines(f.lines) : [];
    if (!isDate(f.periodStart) || !isDate(f.periodEnd) || opening === null || closing === null || lines === null) return setErr(tr("invalid"));
    setBusy(true);
    setErr(null);
    try {
      await apiRequest(`/treasury/accounts/${accountId}/statements`, "POST", {
        reference: f.reference.trim() || undefined,
        periodStart: f.periodStart.trim(),
        periodEnd: f.periodEnd.trim(),
        openingBalance: opening,
        closingBalance: closing,
        lines,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e: any) {
      setErr(e?.message ?? tr("error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormSheet visible={visible} title={tr("newStatement")} onClose={onClose} closeLabel={tr("close")}>
      {field("reference", "reference")}
      {field("periodStart", "periodStart", { placeholder: "2026-10-01" })}
      {field("periodEnd", "periodEnd", { placeholder: "2026-10-31" })}
      {field("openingBalance", "opening", { keyboardType: "numbers-and-punctuation" })}
      {field("closingBalance", "closing", { keyboardType: "numbers-and-punctuation" })}
      {field("lines", "lines", { multiline: true, style: [formStyles.input, { minHeight: 120, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, textAlignVertical: "top" }] })}
      {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      <ActionButton label={tr("save")} icon="check" onPress={submit} busy={busy} />
    </FormSheet>
  );
}

function StatementDetail({ id, onClose, onChanged, tr, canWrite, isAdmin }: { id: string | null; onClose: () => void; onChanged: () => void; tr: T; canWrite: boolean; isAdmin: boolean }) {
  const colors = useColors();
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState("");
  const [reason, setReason] = useState("");
  const [bookCat, setBookCat] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      setData((await apiRequest<{ data: any }>(`/treasury/statements/${id}`)).data);
    } catch (e: any) {
      setErr(e?.message ?? tr("loadError"));
    }
  }, [id, tr]);
  useEffect(() => {
    setData(null);
    setMore("");
    setReason("");
    load();
  }, [load]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      onChanged();
    } catch (e: any) {
      Alert.alert(tr("error"), e?.message ?? tr("error"));
      await load();
    } finally {
      setBusy(false);
    }
  };
  const r = data?.report;
  const st = data?.statement;
  const isClosed = st?.status === "closed";
  const row = (label: keyof typeof S, value: string, strong = false) => (
    <View style={styles.between}>
      <Text style={[styles.meta, { color: colors.mutedForeground, flex: 1 }]}>{tr(label)}</Text>
      <Text style={[strong ? styles.strong : styles.meta, { color: colors.foreground }]}>{fmt(value)}</Text>
    </View>
  );
  const disc = r?.discrepancies ?? {};
  return (
    <FormSheet visible={!!id} title={st ? `${st.periodStart} → ${st.periodEnd}` : tr("title")} onClose={onClose} closeLabel={tr("close")}>
      {err ? (
        <ErrorState title={err} description="" retryLabel={tr("retry")} onRetry={load} accentColor={colors.primary} />
      ) : !r ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {row("bankClosing", r.balances.bankClosing)}
            {row("inTransit", r.balances.inTransit)}
            {row("adjustedBank", r.balances.adjustedBank, true)}
            <View style={{ height: 6 }} />
            {row("ledger", r.balances.ledger)}
            {row("notBooked", r.balances.notBooked)}
            {row("adjustedBook", r.balances.adjustedBook, true)}
            <View style={{ height: 6 }} />
            <View style={styles.between}>
              <Text style={[styles.strong, { color: colors.foreground }]}>{tr("difference")}</Text>
              <Text style={[styles.strong, { color: Number(r.balances.difference) === 0 ? colors.success : colors.danger }]}>{fmt(r.balances.difference)}</Text>
            </View>
          </View>
          {isClosed ? (
            <Text style={{ color: colors.success, fontFamily: "Inter_600SemiBold" }}>{tr("closed")}</Text>
          ) : r.blocking.length ? (
            <View style={[styles.box, { borderColor: colors.warning, backgroundColor: colors.warning + "12" }]}>
              <Text style={[styles.strong, { color: "#A86D0B" }]}>{tr("blocking")}</Text>
              {r.blocking.map((b: any) => (
                <Text key={b.code} style={[styles.meta, { color: colors.foreground }]}>• {b.message}</Text>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.success }}>{tr("ready")}</Text>
          )}

          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("discrepancies")}</Text>
          {[
            ["dupRefs", disc.duplicateLineReferences],
            ["dupEntries", disc.duplicateEntryReferences],
            ["mismatches", disc.amountMismatches],
            ["reversals", disc.compensatedReversals],
            ["anomalies", disc.anomalies],
          ].map(([k, list]) => (
            <Text key={k as string} style={[styles.meta, { color: (list as any[])?.length ? colors.foreground : colors.mutedForeground }]}>
              {tr(k as keyof typeof S)} : {(list as any[])?.length ?? 0}
              {(list as any[])?.length
                ? ` — ${(list as any[]).map((d: any) => d.reference ?? d.label ?? d.entry ?? d.entries ?? "").filter(Boolean).slice(0, 3).join(", ")}`
                : ""}
            </Text>
          ))}

          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("timing")} ({r.timingDifferences.length})</Text>
          {r.timingDifferences.map((e: any) => (
            <Text key={e.id} style={[styles.meta, { color: e.ageDays > 60 ? "#A86D0B" : colors.foreground }]}>
              {e.entryDate} · {e.entryNumber} · {e.label} · {e.direction === "in" ? "+" : "−"}{fmt(e.remaining)} · {e.ageDays} {tr("days")}
              {e.ageDays > 60 ? ` (${tr("stale")})` : ""}
            </Text>
          ))}

          <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("bankLines")} ({r.bankNotBooked.length})</Text>
          {r.bankNotBooked.map((l: any) => {
            const dir = Number(l.amount) > 0 ? "in" : "out";
            const cat = bookCat[l.id] ?? CATS[dir][0];
            return (
              <View key={l.id} style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.meta, { color: colors.foreground }]}>
                  {l.valueDate} · {l.label}{l.reference ? ` · ${l.reference}` : ""} · {fmt(l.remaining)}
                </Text>
                {canWrite && !isClosed && l.inThisStatement && l.status !== "anomaly" && (
                  <>
                    <ChoiceChips value={cat} onChange={(k) => setBookCat((p) => ({ ...p, [l.id]: k }))} options={CATS[dir].map((c) => ({ key: c, label: c.replace(/_/g, " ") }))} />
                    <ActionButton label={tr("book")} icon="edit-3" busy={busy} onPress={() => act(() => apiRequest(`/treasury/statement-lines/${l.id}/post-entry`, "POST", { category: cat }))} />
                  </>
                )}
              </View>
            );
          })}
          {canWrite && !isClosed && r.bankNotBooked.length > 0 && <Text style={[styles.meta, { color: colors.mutedForeground }]}>{tr("bookHint")}</Text>}

          {canWrite && !isClosed && (
            <>
              <FieldLabel label={tr("addLines")} />
              <TextInput value={more} onChangeText={setMore} multiline style={[formStyles.input, { minHeight: 70, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, textAlignVertical: "top" }]} />
              <ActionButton
                label={tr("addLines")}
                icon="plus"
                busy={busy}
                disabled={!more.trim()}
                onPress={() => {
                  const lines = parseLines(more);
                  if (!lines) return Alert.alert(tr("error"), tr("invalid"));
                  act(async () => {
                    await apiRequest(`/treasury/statements/${id}/lines`, "POST", { lines });
                    setMore("");
                  });
                }}
              />
              <ActionButton label={tr("closeStatement")} icon="lock" color="#0F6E7D" busy={busy} disabled={!r.canClose} onPress={() => act(() => apiRequest(`/treasury/statements/${id}/close`, "POST"))} />
            </>
          )}
          {isClosed && isAdmin && (
            <>
              <FieldLabel label={tr("reopenReason")} />
              <TextInput value={reason} onChangeText={setReason} style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} />
              <ActionButton label={tr("reopen")} icon="unlock" color="#6A6680" busy={busy} disabled={reason.trim().length < 3} onPress={() => act(() => apiRequest(`/treasury/statements/${id}/reopen`, "POST", { reason: reason.trim() }))} />
            </>
          )}
        </>
      )}
    </FormSheet>
  );
}

function RelevesInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { lang } = useLanguage();
  const L = (["fr", "en", "ar", "es"].includes(lang) ? lang : "fr") as Lang;
  const tr: T = useCallback((k) => S[k][L] ?? S[k].fr, [L]);
  const { user } = useAuth();
  const canWrite = user?.role === "syndicate_admin" || user?.role === "treasurer";
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) {
      setRows([]);
      return;
    }
    setError(false);
    try {
      setRows((await apiRequest<{ data: any[] }>(`/treasury/accounts/${accountId}/statements`)).data ?? []);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [accountId]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={tr("title")} color="#0F6E7D" action={canWrite && accountId ? { icon: "plus", onPress: () => setCreating(true), label: tr("newStatement") } : undefined} />
      {error ? (
        <ErrorState title={tr("loadError")} description="" retryLabel={tr("retry")} onRetry={() => { setRows(null); load(); }} accentColor="#0F6E7D" />
      ) : !rows ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#0F6E7D" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {rows.length === 0 && <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 16 }}>{tr("empty")}</Text>}
          {rows.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => setOpenId(s.id)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button">
              <View style={styles.between}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.strong, { color: colors.foreground }]}>
                    {s.periodStart} → {s.periodEnd}
                    {s.reference ? ` · ${s.reference}` : ""}
                  </Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    {fmt(s.openingBalance)} → {fmt(s.closingBalance)} · {s.lines} · {s.unresolved} {tr("toResolve")}
                  </Text>
                </View>
                <View style={styles.badgeRow}>
                  <Feather name={s.status === "closed" ? "lock" : "unlock"} size={14} color={s.status === "closed" ? colors.success : colors.warning} />
                  <Text style={{ color: s.status === "closed" ? colors.success : colors.warning, fontSize: 12 }}>{tr(s.status === "closed" ? "closed" : "open")}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {accountId ? <StatementForm visible={creating} accountId={accountId} tr={tr} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} /> : null}
      <StatementDetail id={openId} tr={tr} canWrite={canWrite} isAdmin={user?.role === "syndicate_admin"} onClose={() => setOpenId(null)} onChanged={load} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  box: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  strong: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
});
