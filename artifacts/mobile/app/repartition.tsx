import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatDay } from "@/lib/formatDay";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";
import { ActionButton, ChoiceChips, FieldLabel, FormSheet, formStyles } from "@/components/FormSheet";

/**
 * Charge allocation (syndic and treasurer). Keys say how each category of
 * charges is shared between the lots — explicit coefficients, or equal parts
 * when the key says so, with explicit exclusions. A calculation is previewed,
 * reviewed (errors must be fixed), then confirmed: it is stored with its
 * inputs and issues the calls for funds. Nothing here is inferred.
 */
export default function RepartitionScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "treasurer", "president", "secretary", "committee_member"]}>
      <Inner />
    </RoleGuard>
  );
}

type Issue = { code: string; message: string };
type Lot = { id: string; number: string; archivedAt?: string | null };
const newKey = () => `alc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const CHARGE_TYPES = [
  { key: "charges_courantes", labelKey: "chargeCurrent" },
  { key: "fonds_reserve", labelKey: "reserveFund" },
  { key: "appel_special", labelKey: "specialCall" },
] as const;

// ─── Texts (fr · en · ar · es) ────────────────────────────────────────────────

const RP = {
  chargeCurrent: { fr: "Charges courantes", en: "Current charges", ar: "التكاليف الجارية", es: "Gastos corrientes" },
  reserveFund: { fr: "Fonds de réserve", en: "Reserve fund", ar: "صندوق الاحتياط", es: "Fondo de reserva" },
  specialCall: { fr: "Appel spécial", en: "Special call", ar: "نداء أموال استثنائي", es: "Derrama extraordinaria" },
  toCorrectTitle: { fr: "Répartitions à corriger", en: "Allocations to correct", ar: "توزيعات يجب تصحيحها", es: "Repartos por corregir" },
  toCorrectBody: { fr: "Non recalculées : {list}. Corrigez-les depuis l'historique si nécessaire.", en: "Not recalculated: {list}. Correct them from the history if needed.", ar: "لم يُعَد حسابها: {list}. صحّحها من السجل عند الحاجة.", es: "No recalculados: {list}. Corríjalos desde el historial si es necesario." },
  finalizedTitle: { fr: "Répartitions déjà finalisées", en: "Allocations already finalised", ar: "توزيعات منتهية بالفعل", es: "Repartos ya finalizados" },
  confirmVersion: { fr: "Confirmer la nouvelle version", en: "Confirm the new version", ar: "تأكيد النسخة الجديدة", es: "Confirmar la nueva versión" },
  newVersionOf: { fr: "Nouvelle version — {code}", en: "New version — {code}", ar: "نسخة جديدة — {code}", es: "Nueva versión — {code}" },
  newKeyTitle: { fr: "Nouvelle clé de répartition", en: "New allocation key", ar: "مفتاح توزيع جديد", es: "Nueva clave de reparto" },
  code: { fr: "Code (ex. GEN, ASC) *", en: "Code (e.g. GEN, ASC) *", ar: "الرمز (مثال: GEN، ASC) *", es: "Código (p. ej. GEN, ASC) *" },
  name: { fr: "Nom *", en: "Name *", ar: "الاسم *", es: "Nombre *" },
  purpose: { fr: "Objet", en: "Purpose", ar: "الغرض", es: "Objeto" },
  method: { fr: "Méthode", en: "Method", ar: "الطريقة", es: "Método" },
  methodShares: { fr: "Coefficients par lot", en: "Coefficients per unit", ar: "معاملات لكل وحدة", es: "Coeficientes por unidad" },
  methodEqual: { fr: "Parts égales (lots listés)", en: "Equal shares (listed units)", ar: "حصص متساوية (الوحدات المدرجة)", es: "Partes iguales (unidades listadas)" },
  categories: { fr: "Catégories de charges couvertes (séparées par des virgules) *", en: "Charge categories covered (comma-separated) *", ar: "فئات التكاليف المشمولة (مفصولة بفواصل) *", es: "Categorías de gastos cubiertas (separadas por comas) *" },
  effectiveFrom: { fr: "En vigueur à partir du (AAAA-MM-JJ) *", en: "In force from (YYYY-MM-DD) *", ar: "سارٍ ابتداءً من (YYYY-MM-DD) *", es: "En vigor desde (AAAA-MM-DD) *" },
  source: { fr: "Source de la règle (règlement, décision d'AG…) *", en: "Source of the rule (by-laws, general meeting decision…) *", ar: "مصدر القاعدة (النظام، قرار الجمع العام…) *", es: "Origen de la regla (reglamento, acuerdo de junta…) *" },
  changeReason: { fr: "Raison du changement *", en: "Reason for the change *", ar: "سبب التغيير *", es: "Motivo del cambio *" },
  lotsHeader: { fr: "Lots ({n}) — chaque lot : un coefficient ou une exclusion motivée", en: "Units ({n}) — each unit: a coefficient or a justified exclusion", ar: "الوحدات ({n}) — لكل وحدة: معامل أو استبعاد مُعلَّل", es: "Unidades ({n}) — cada unidad: un coeficiente o una exclusión motivada" },
  exclusionReason: { fr: "Motif de l'exclusion *", en: "Reason for exclusion *", ar: "سبب الاستبعاد *", es: "Motivo de la exclusión *" },
  equalShare: { fr: "part égale", en: "equal share", ar: "حصة متساوية", es: "parte igual" },
  coefficient: { fr: "coefficient", en: "coefficient", ar: "المعامل", es: "coeficiente" },
  excluded: { fr: "Exclu", en: "Excluded", ar: "مستبعدة", es: "Excluida" },
  exclude: { fr: "Exclure", en: "Exclude", ar: "استبعاد", es: "Excluir" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  previewFailed: { fr: "Prévisualisation impossible", en: "Preview failed", ar: "تعذّرت المعاينة", es: "No se pudo previsualizar" },
  draftSaved: { fr: "Brouillon enregistré", en: "Draft saved", ar: "تم حفظ المسودة", es: "Borrador guardado" },
  draftSavedBody: { fr: "{ref} — aucune obligation n'est émise tant que le brouillon n'est pas publié.", en: "{ref} — no obligation is issued until the draft is published.", ar: "{ref} — لا يصدر أي التزام ما دامت المسودة غير منشورة.", es: "{ref} — no se emite ninguna obligación hasta que se publique el borrador." },
  published: { fr: "Appel de fonds publié", en: "Call for funds published", ar: "تم نشر نداء الأموال", es: "Derrama publicada" },
  publishedBody: { fr: "{ref} — {n} obligation(s) émise(s), échéance {due}.", en: "{ref} — {n} obligation(s) issued, due {due}.", ar: "{ref} — صدر {n} التزام(ات)، الاستحقاق {due}.", es: "{ref} — {n} obligación(es) emitida(s), vencimiento {due}." },
  publishedShort: { fr: "{ref} — {n} obligation(s) émise(s).", en: "{ref} — {n} obligation(s) issued.", ar: "{ref} — صدر {n} التزام(ات).", es: "{ref} — {n} obligación(es) emitida(s)." },
  notConfirmed: { fr: "Non confirmée", en: "Not confirmed", ar: "غير مؤكدة", es: "No confirmada" },
  publishImpossible: { fr: "Publication impossible", en: "Cannot publish", ar: "تعذّر النشر", es: "No se puede publicar" },
  invalidCalc: { fr: "Calcul invalide", en: "Invalid calculation", ar: "حساب غير صالح", es: "Cálculo no válido" },
  publishQ: { fr: "Publier {ref} ?", en: "Publish {ref}?", ar: "نشر {ref}؟", es: "¿Publicar {ref}?" },
  dataChanged: { fr: "⚠ Les données ont changé depuis le brouillon : vérifiez les montants.", en: "⚠ The data changed since the draft: check the amounts.", ar: "⚠ تغيّرت البيانات منذ المسودة: تحقّق من المبالغ.", es: "⚠ Los datos cambiaron desde el borrador: revise los importes." },
  publishSummary: { fr: "Total {total} · émission {issue} · échéance {due}", en: "Total {total} · issued {issue} · due {due}", ar: "المجموع {total} · الإصدار {issue} · الاستحقاق {due}", es: "Total {total} · emisión {issue} · vencimiento {due}" },
  publish: { fr: "Publier", en: "Publish", ar: "نشر", es: "Publicar" },
  notPublished: { fr: "Non publié", en: "Not published", ar: "لم يُنشر", es: "No publicado" },
  deleteDraftQ: { fr: "Supprimer le brouillon {ref} ?", en: "Delete draft {ref}?", ar: "حذف المسودة {ref}؟", es: "¿Eliminar el borrador {ref}?" },
  deleteDraftBody: { fr: "Un brouillon n'a émis aucune obligation : sa suppression n'a pas d'effet financier.", en: "A draft has issued no obligation: deleting it has no financial effect.", ar: "المسودة لم تُصدر أي التزام: حذفها ليس له أثر مالي.", es: "Un borrador no ha emitido ninguna obligación: eliminarlo no tiene efecto financiero." },
  delete: { fr: "Supprimer", en: "Delete", ar: "حذف", es: "Eliminar" },
  reconTitle: { fr: "Rapprochement {ref} : {state}", en: "Reconciliation {ref}: {state}", ar: "المطابقة {ref}: {state}", es: "Conciliación {ref}: {state}" },
  reconOk: { fr: "cohérent", en: "consistent", ar: "متطابقة", es: "coherente" },
  reconGap: { fr: "ÉCART", en: "MISMATCH", ar: "فرق", es: "DESCUADRE" },
  recon1: { fr: "Émis {issued} · ajustements {adj} · annulé {cancelled}", en: "Issued {issued} · adjustments {adj} · cancelled {cancelled}", ar: "المُصدَر {issued} · التعديلات {adj} · الملغى {cancelled}", es: "Emitido {issued} · ajustes {adj} · anulado {cancelled}" },
  recon2: { fr: "Payé {paid} · reste dû {remaining} · {n} reçu(s)", en: "Paid {paid} · outstanding {remaining} · {n} receipt(s)", ar: "المدفوع {paid} · المتبقي {remaining} · {n} وصل", es: "Pagado {paid} · pendiente {remaining} · {n} recibo(s)" },
  recon3: { fr: "{a} lignes = total · {b} obligations = total", en: "{a} lines = total · {b} obligations = total", ar: "{a} البنود = المجموع · {b} الالتزامات = المجموع", es: "{a} líneas = total · {b} obligaciones = total" },
  recon4: { fr: "{a} écarts justifiés · {b} paiements = obligations", en: "{a} differences explained · {b} payments = obligations", ar: "{a} الفروق مُبرَّرة · {b} المدفوعات = الالتزامات", es: "{a} diferencias justificadas · {b} pagos = obligaciones" },
  recon5: { fr: "{a} journal = paiements · {b} un reçu par paiement", en: "{a} journal = payments · {b} one receipt per payment", ar: "{a} اليومية = المدفوعات · {b} وصل لكل دفعة", es: "{a} diario = pagos · {b} un recibo por pago" },
  reasonRequired: { fr: "Motif requis", en: "Reason required", ar: "السبب مطلوب", es: "Motivo obligatorio" },
  min5: { fr: "5 caractères minimum.", en: "At least 5 characters.", ar: "5 أحرف على الأقل.", es: "Mínimo 5 caracteres." },
  reversed: { fr: "Répartition annulée", en: "Allocation cancelled", ar: "تم إلغاء التوزيع", es: "Reparto anulado" },
  reversedBody: { fr: "{n} appel(s) annulé(s).", en: "{n} call(s) cancelled.", ar: "أُلغي {n} نداء.", es: "{n} derrama(s) anulada(s)." },
  correctImpossible: { fr: "Correction impossible", en: "Cannot correct", ar: "تعذّر التصحيح", es: "No se puede corregir" },
  corrected: { fr: "Répartition corrigée", en: "Allocation corrected", ar: "تم تصحيح التوزيع", es: "Reparto corregido" },
  correctedBody: { fr: "{ref} → {newRef} : {cancelled} appel(s) annulé(s), {calls} émis.", en: "{ref} → {newRef}: {cancelled} call(s) cancelled, {calls} issued.", ar: "{ref} ← {newRef}: أُلغي {cancelled} نداء، وصدر {calls}.", es: "{ref} → {newRef}: {cancelled} derrama(s) anulada(s), {calls} emitida(s)." },
  tabKeys: { fr: "Clés", en: "Keys", ar: "المفاتيح", es: "Claves" },
  tabCompute: { fr: "Calcul", en: "Calculation", ar: "الحساب", es: "Cálculo" },
  tabHistory: { fr: "Historique", en: "History", ar: "السجل", es: "Historial" },
  loadError: { fr: "Impossible de charger la répartition.", en: "Could not load the allocation.", ar: "تعذّر تحميل التوزيع.", es: "No se pudo cargar el reparto." },
  newKeyBtn: { fr: "Nouvelle clé", en: "New key", ar: "مفتاح جديد", es: "Nueva clave" },
  noKeys: { fr: "Aucune clé : sans clé, aucune charge ne peut être répartie (hors appels du budget global par tantièmes).", en: "No key: without a key no charge can be allocated (except calls on the overall budget by shares).", ar: "لا يوجد مفتاح: بدون مفتاح لا يمكن توزيع أي تكلفة (باستثناء نداءات الميزانية العامة حسب الحصص).", es: "Sin clave: sin clave no se puede repartir ningún gasto (salvo las derramas del presupuesto global por cuotas)." },
  archived: { fr: " (archivée)", en: " (archived)", ar: " (مؤرشف)", es: " (archivada)" },
  equalShares: { fr: "parts égales", en: "equal shares", ar: "حصص متساوية", es: "partes iguales" },
  coefficients: { fr: "coefficients", en: "coefficients", ar: "معاملات", es: "coeficientes" },
  since: { fr: "dès {d}", en: "from {d}", ar: "ابتداءً من {d}", es: "desde {d}" },
  until: { fr: " jusqu'au {d}", en: " until {d}", ar: " حتى {d}", es: " hasta {d}" },
  sourceLabel: { fr: "Source : {s}", en: "Source: {s}", ar: "المصدر: {s}", es: "Origen: {s}" },
  excludedWith: { fr: "exclu — {r}", en: "excluded — {r}", ar: "مستبعدة — {r}", es: "excluida — {r}" },
  newVersionBtn: { fr: "Nouvelle version", en: "New version", ar: "نسخة جديدة", es: "Nueva versión" },
  period: { fr: "Période (AAAA, AAAA-T1… ou AAAA-MM) *", en: "Period (YYYY, YYYY-Q1… or YYYY-MM) *", ar: "الفترة (YYYY أو YYYY-Q1… أو YYYY-MM) *", es: "Periodo (AAAA, AAAA-T1… o AAAA-MM) *" },
  callType: { fr: "Type d'appel", en: "Type of call", ar: "نوع النداء", es: "Tipo de derrama" },
  issue: { fr: "Émission (AAAA-MM-JJ)", en: "Issue date (YYYY-MM-DD)", ar: "تاريخ الإصدار (YYYY-MM-DD)", es: "Emisión (AAAA-MM-DD)" },
  due: { fr: "Échéance (AAAA-MM-JJ)", en: "Due date (YYYY-MM-DD)", ar: "تاريخ الاستحقاق (YYYY-MM-DD)", es: "Vencimiento (AAAA-MM-DD)" },
  today: { fr: "aujourd'hui", en: "today", ar: "اليوم", es: "hoy" },
  plus30: { fr: "+30 jours", en: "+30 days", ar: "+30 يومًا", es: "+30 días" },
  expensesHdr: { fr: "Dépenses approuvées ou payées", en: "Approved or paid expenses", ar: "النفقات المعتمدة أو المدفوعة", es: "Gastos aprobados o pagados" },
  none: { fr: "Aucune.", en: "None.", ar: "لا شيء.", es: "Ninguno." },
  budgetLines: { fr: "Lignes des budgets approuvés", en: "Lines of approved budgets", ar: "بنود الميزانيات المعتمدة", es: "Partidas de presupuestos aprobados" },
  perYear: { fr: "/ an", en: "/ year", ar: "/ سنة", es: "/ año" },
  preview: { fr: "Prévisualiser", en: "Preview", ar: "معاينة", es: "Previsualizar" },
  keyRef: { fr: "clé {code} v{v}", en: "key {code} v{v}", ar: "المفتاح {code} v{v}", es: "clave {code} v{v}" },
  excludedList: { fr: "Exclus : {list}", en: "Excluded: {list}", ar: "المستبعدة: {list}", es: "Excluidas: {list}" },
  totalPerLot: { fr: "Total par lot", en: "Total per unit", ar: "المجموع لكل وحدة", es: "Total por unidad" },
  sourcesLine: { fr: "Sources {s} · réparti {a}", en: "Sources {s} · allocated {a}", ar: "المصادر {s} · الموزَّع {a}", es: "Fuentes {s} · repartido {a}" },
  issueLine: { fr: "Émission {issue} · échéance {due} inclus ({tz}) · en retard à partir du lendemain, sans pénalité automatique.", en: "Issued {issue} · due {due} inclusive ({tz}) · overdue from the next day, with no automatic penalty.", ar: "الإصدار {issue} · الاستحقاق {due} ضمنًا ({tz}) · متأخر ابتداءً من اليوم التالي، دون غرامة تلقائية.", es: "Emisión {issue} · vencimiento {due} incluido ({tz}) · en mora desde el día siguiente, sin penalización automática." },
  draftBtn: { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
  publishObligations: { fr: "Publier les obligations", en: "Publish the obligations", ar: "نشر الالتزامات", es: "Publicar las obligaciones" },
  noAllocations: { fr: "Aucune répartition.", en: "No allocation yet.", ar: "لا يوجد توزيع.", es: "Ningún reparto." },
  stDraft: { fr: "brouillon — aucune obligation émise", en: "draft — no obligation issued", ar: "مسودة — لم يصدر أي التزام", es: "borrador — ninguna obligación emitida" },
  stPublished: { fr: "publié", en: "published", ar: "منشور", es: "publicado" },
  dueOn: { fr: " · échéance {d}", en: " · due {d}", ar: " · الاستحقاق {d}", es: " · vencimiento {d}" },
  stCorrected: { fr: "corrigée — {r}", en: "corrected — {r}", ar: "مُصحَّح — {r}", es: "corregido — {r}" },
  stReversed: { fr: "annulée — {r}", en: "cancelled — {r}", ar: "ملغى — {r}", es: "anulado — {r}" },
  correctsEarlier: { fr: " · corrige une répartition antérieure ({r})", en: " · corrects an earlier allocation ({r})", ar: " · يصحّح توزيعًا سابقًا ({r})", es: " · corrige un reparto anterior ({r})" },
  verifyPublish: { fr: "Vérifier et publier", en: "Review and publish", ar: "مراجعة ونشر", es: "Revisar y publicar" },
  reconciliation: { fr: "Rapprochement", en: "Reconciliation", ar: "المطابقة", es: "Conciliación" },
  correct: { fr: "Corriger", en: "Correct", ar: "تصحيح", es: "Corregir" },
  reverse: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Anular" },
  endCorrectBody: { fr: "La répartition actuelle est conservée (statut « corrigée ») et ses appels non payés sont annulés ; un nouveau calcul avec les clés en vigueur les remplace.", en: "The current allocation is kept (status « corrected ») and its unpaid calls are cancelled; a new calculation with the keys in force replaces them.", ar: "يُحتفَظ بالتوزيع الحالي (بحالة «مُصحَّح») وتُلغى نداءاته غير المدفوعة؛ ويحلّ محلها حساب جديد بالمفاتيح السارية.", es: "Se conserva el reparto actual (estado «corregido») y se anulan sus derramas impagadas; un nuevo cálculo con las claves vigentes las sustituye." },
  endReverseBody: { fr: "Les appels de fonds de cette répartition sont annulés (s'ils n'ont reçu aucun paiement). Rien n'est supprimé.", en: "The calls for funds of this allocation are cancelled (if they received no payment). Nothing is deleted.", ar: "تُلغى نداءات الأموال الخاصة بهذا التوزيع (إن لم تتلقَّ أي دفعة). لا يُحذف أي شيء.", es: "Se anulan las derramas de este reparto (si no recibieron ningún pago). No se elimina nada." },
  reason: { fr: "Motif *", en: "Reason *", ar: "السبب *", es: "Motivo *" },
  confirm: { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
} as const;
type RpKey = keyof typeof RP;

/** The screen's texts in the current language, with {placeholders} filled. */
function useRp() {
  const { lang } = useLanguage();
  const tr = (k: RpKey, vars?: Record<string, string | number>) => {
    let s: string = (RP[k] as Record<string, string>)[lang] ?? RP[k].fr;
    for (const [name, v] of Object.entries(vars ?? {})) s = s.split(`{${name}}`).join(String(v));
    return s;
  };
  const money = (v: string | number) =>
    `${Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${lang === "ar" ? "د.م." : "MAD"}`;
  return { tr, money, lang };
}

function Issues({ errors, warnings }: { errors?: Issue[]; warnings?: Issue[] }) {
  const colors = useColors();
  if (!errors?.length && !warnings?.length) return null;
  return (
    <View style={{ gap: 4 }}>
      {(errors ?? []).map((e, i) => (
        <Text key={`e${i}`} style={{ color: colors.danger, fontSize: 13 }}>✕ {e.message}</Text>
      ))}
      {(warnings ?? []).map((w, i) => (
        <Text key={`w${i}`} style={{ color: colors.warningText, fontSize: 13 }}>⚠ {w.message}</Text>
      ))}
    </View>
  );
}

// ─── Key form (new key or new version) ────────────────────────────────────────

function KeySheet({ visible, buildingId, lots, base, onClose, onDone }: { visible: boolean; buildingId: string; lots: Lot[]; base: any | null; onClose: () => void; onDone: () => void }) {
  const colors = useColors();
  const { tr } = useRp();
  const { t } = useLanguage();
  const isVersion = !!base;
  const [f, setF] = useState({ code: "", name: "", purpose: "", method: "shares", categories: "", effectiveFrom: "", sourceReference: "", changeReason: "" });
  const [rows, setRows] = useState<Record<string, { coefficient: string; excluded: boolean; reason: string }>>({});
  const [issues, setIssues] = useState<{ errors?: Issue[]; warnings?: Issue[] }>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const v = base?.versions?.[0];
    setF({ code: base?.code ?? "", name: base?.name ?? "", purpose: base?.purpose ?? "", method: v?.method ?? "shares", categories: (v?.categories ?? []).join(", "), effectiveFrom: "", sourceReference: v?.sourceReference ?? "", changeReason: "" });
    const init: Record<string, { coefficient: string; excluded: boolean; reason: string }> = {};
    // Start from the current version's values; a new lot starts EMPTY (no default).
    for (const l of lots.filter((x) => !x.archivedAt)) {
      const s = v?.shares?.find((x: any) => x.lotId === l.id);
      init[l.id] = { coefficient: s?.coefficient ? String(Number(s.coefficient)) : "", excluded: !!s?.excluded, reason: s?.exclusionReason ?? "" };
    }
    setRows(init);
    setIssues({});
  }, [visible, base, lots]);
  const submit = async (acknowledgeFinalized = false) => {
    setBusy(true);
    setIssues({});
    const body: any = {
      method: f.method,
      categories: f.categories.split(",").map((c) => c.trim()).filter(Boolean),
      effectiveFrom: f.effectiveFrom.trim(),
      sourceReference: f.sourceReference.trim(),
      shares: Object.entries(rows).map(([lotId, r]) =>
        r.excluded ? { lotId, excluded: true, exclusionReason: r.reason.trim() || undefined } : { lotId, ...(r.coefficient.trim() ? { coefficient: r.coefficient.trim().replace(",", ".") } : f.method === "equal" ? {} : {}) },
      ),
    };
    try {
      if (isVersion) {
        const res = await apiRequest<any>(`/allocation-keys/${base.id}/versions`, "POST", { ...body, changeReason: f.changeReason.trim(), acknowledgeFinalized });
        if (res.toCorrect?.length) Alert.alert(tr("toCorrectTitle"), tr("toCorrectBody", { list: res.toCorrect.map((a: any) => `${a.reference} (${a.period})`).join(", ") }));
      } else {
        await apiRequest("/allocation-keys", "POST", { ...body, buildingId, code: f.code.trim(), name: f.name.trim(), purpose: f.purpose.trim() || undefined });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (e: any) {
      if (e?.code === "KEY_VERSION_IN_USE") {
        Alert.alert(tr("finalizedTitle"), `${e.message}\n\n${(e.body?.affected ?? []).map((a: any) => `${a.reference} (${a.period})`).join("\n")}`, [
          { text: t("cancel"), style: "cancel" },
          { text: tr("confirmVersion"), onPress: () => submit(true) },
        ]);
      } else {
        setIssues({ errors: e?.body?.errors ?? [{ code: e?.code ?? "ERR", message: e?.message ?? t("error") }], warnings: e?.body?.warnings });
      }
    } finally {
      setBusy(false);
    }
  };
  const input = [formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }];
  return (
    <FormSheet visible={visible} title={isVersion ? tr("newVersionOf", { code: base?.code ?? "" }) : tr("newKeyTitle")} onClose={onClose} closeLabel={t("close")}>
      {!isVersion && (
        <>
          <FieldLabel label={tr("code")} />
          <TextInput value={f.code} onChangeText={(v) => setF((p) => ({ ...p, code: v }))} style={input} autoCapitalize="characters" />
          <FieldLabel label={tr("name")} />
          <TextInput value={f.name} onChangeText={(v) => setF((p) => ({ ...p, name: v }))} style={input} />
          <FieldLabel label={tr("purpose")} />
          <TextInput value={f.purpose} onChangeText={(v) => setF((p) => ({ ...p, purpose: v }))} style={input} />
        </>
      )}
      <FieldLabel label={tr("method")} />
      <ChoiceChips value={f.method} onChange={(v) => setF((p) => ({ ...p, method: v }))} options={[{ key: "shares", label: tr("methodShares") }, { key: "equal", label: tr("methodEqual") }]} />
      <FieldLabel label={tr("categories")} />
      <TextInput value={f.categories} onChangeText={(v) => setF((p) => ({ ...p, categories: v }))} style={input} autoCapitalize="none" placeholder="entretien_general, eau" placeholderTextColor={colors.mutedForeground} />
      <FieldLabel label={tr("effectiveFrom")} />
      <TextInput value={f.effectiveFrom} onChangeText={(v) => setF((p) => ({ ...p, effectiveFrom: v }))} style={input} placeholder="2026-01-01" placeholderTextColor={colors.mutedForeground} />
      <FieldLabel label={tr("source")} />
      <TextInput value={f.sourceReference} onChangeText={(v) => setF((p) => ({ ...p, sourceReference: v }))} style={input} />
      {isVersion && (
        <>
          <FieldLabel label={tr("changeReason")} />
          <TextInput value={f.changeReason} onChangeText={(v) => setF((p) => ({ ...p, changeReason: v }))} style={input} />
        </>
      )}
      <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("lotsHeader", { n: Object.keys(rows).length })}</Text>
      {lots
        .filter((l) => !l.archivedAt)
        .map((l) => {
          const r = rows[l.id] ?? { coefficient: "", excluded: false, reason: "" };
          return (
            <View key={l.id} style={[styles.lotRow, { borderColor: colors.border }]}>
              <Text style={{ color: colors.foreground, width: 70, fontFamily: "Inter_600SemiBold" }}>{l.number}</Text>
              {r.excluded ? (
                <TextInput value={r.reason} onChangeText={(v) => setRows((p) => ({ ...p, [l.id]: { ...r, reason: v } }))} placeholder={tr("exclusionReason")} placeholderTextColor={colors.mutedForeground} style={[...input, { flex: 1 }]} />
              ) : f.method === "equal" ? (
                <Text style={{ color: colors.mutedForeground, flex: 1 }}>{tr("equalShare")}</Text>
              ) : (
                <TextInput value={r.coefficient} onChangeText={(v) => setRows((p) => ({ ...p, [l.id]: { ...r, coefficient: v } }))} keyboardType="decimal-pad" placeholder={tr("coefficient")} placeholderTextColor={colors.mutedForeground} style={[...input, { flex: 1 }]} />
              )}
              <TouchableOpacity onPress={() => setRows((p) => ({ ...p, [l.id]: { ...r, excluded: !r.excluded } }))} accessibilityRole="checkbox" accessibilityState={{ checked: r.excluded }}>
                <Text style={{ color: r.excluded ? colors.danger : colors.primary, fontSize: 12 }}>{r.excluded ? tr("excluded") : tr("exclude")}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      <Issues {...issues} />
      <ActionButton label={tr("save")} icon="check" busy={busy} onPress={() => submit(false)} />
    </FormSheet>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

function Inner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const { tr, money: fmt } = useRp();
  const isSyndic = user?.role === "syndicate_admin";
  const canCompute = isSyndic || user?.role === "treasurer";
  const [tab, setTab] = useState<"keys" | "compute" | "history">("keys");
  const [buildings, setBuildings] = useState<{ id: string; name: string }[]>([]);
  const [buildingId, setBuildingId] = useState("");
  const [lots, setLots] = useState<Lot[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [keyDetail, setKeyDetail] = useState<Record<string, any>>({});
  const [allocs, setAllocs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [keySheet, setKeySheet] = useState<{ base: any | null } | null>(null);
  // Calculation form
  const [period, setPeriod] = useState("");
  const [chargeType, setChargeType] = useState("charges_courantes");
  // Dates of the obligations (local day, condominium time zone). Empty: today / today + 30 days.
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [picked, setPicked] = useState<Record<string, any>>({});
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmKey = useRef(newKey());

  useEffect(() => {
    apiRequest<{ data: any[] }>("/buildings")
      .then((r) => {
        setBuildings((r.data ?? []).map((b) => ({ id: b.id, name: b.name })));
        if (r.data?.[0]) setBuildingId(r.data[0].id);
      })
      .catch(() => setLoadErr(true));
  }, []);
  const load = useCallback(async () => {
    if (!buildingId) return;
    setLoadErr(false);
    try {
      const [k, l, a, e, b] = await Promise.all([
        apiRequest<{ data: any[] }>(`/allocation-keys?buildingId=${buildingId}`),
        apiRequest<{ data: any[] }>(`/lots?buildingId=${buildingId}&limit=200&archived=include`),
        apiRequest<{ data: any[] }>(`/allocations?buildingId=${buildingId}`),
        canCompute ? apiRequest<{ data: any[] }>(`/expenses?limit=200`) : Promise.resolve({ data: [] }),
        canCompute ? apiRequest<{ data: any[] }>(`/budgets?buildingId=${buildingId}`) : Promise.resolve({ data: [] }),
      ]);
      setKeys(k.data ?? []);
      setLots((l.data ?? []).map((x) => ({ id: x.id, number: x.number, archivedAt: x.archivedAt })));
      setAllocs(a.data ?? []);
      setExpenses((e.data ?? []).filter((x) => x.buildingId === buildingId && ["approved", "paid"].includes(x.status)));
      setBudgets((b.data ?? []).filter((x) => x.status === "approved"));
      const details: Record<string, any> = {};
      for (const key of k.data ?? []) details[key.id] = (await apiRequest<{ data: any }>(`/allocation-keys/${key.id}`)).data;
      setKeyDetail(details);
    } catch {
      setLoadErr(true);
    }
  }, [buildingId, canCompute]);
  useEffect(() => {
    load();
  }, [load]);

  const sources = Object.values(picked);
  const runBody = () => ({
    buildingId,
    period: period.trim(),
    chargeType,
    sources,
    ...(issueDate.trim() ? { issueDate: issueDate.trim() } : {}),
    ...(dueDate.trim() ? { dueDate: dueDate.trim() } : {}),
  });
  const doPreview = async () => {
    setBusy(true);
    try {
      const r = await apiRequest<{ data: any }>("/allocations/preview", "POST", runBody());
      setPreview(r.data);
      confirmKey.current = newKey();
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? tr("previewFailed"));
    } finally {
      setBusy(false);
    }
  };
  const doConfirm = async (draft = false) => {
    if (!preview?.valid) return;
    setBusy(true);
    try {
      const r = await apiRequest<any>("/allocations", "POST", { ...runBody(), previewHash: preview.inputsHash, draft }, undefined, { "Idempotency-Key": confirmKey.current });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        draft ? tr("draftSaved") : tr("published"),
        draft
          ? tr("draftSavedBody", { ref: r.data?.reference ?? "" })
          : tr("publishedBody", { ref: r.data?.reference ?? "", n: r.calls ?? 0, due: r.data?.dueDate ?? "" }),
      );
      setPreview(null);
      setPicked({});
      await load();
      setTab("history");
    } catch (e: any) {
      // A changed calculation comes back as a new preview to review.
      if (e?.code === "PREVIEW_STALE" || e?.code === "ALLOCATION_INVALID") setPreview(e.body?.preview ?? null);
      Alert.alert(tr("notConfirmed"), e?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };
  // Publishing a draft: the server recalculates it on today's data; the result
  // is shown for review, and only that reviewed calculation is published.
  const publishDraft = async (a: any) => {
    setBusy(true);
    try {
      const r = await apiRequest<any>(`/allocations/${a.id}/publish`, "POST", {});
      const pv = r.data?.preview;
      if (!pv?.valid) {
        Alert.alert(tr("publishImpossible"), (pv?.errors ?? []).map((x: Issue) => x.message).join("\n") || tr("invalidCalc"));
        return;
      }
      const lines = (pv.perLot ?? []).map((l: any) => `${l.lotNumber} : ${fmt(l.amount)}`).join("\n");
      Alert.alert(
        tr("publishQ", { ref: a.reference }),
        `${pv.changed ? `${tr("dataChanged")}\n\n` : ""}${tr("publishSummary", { total: fmt(pv.totals?.allocated), issue: pv.issueDate, due: pv.dueDate })}\n\n${lines}`,
        [
          { text: t("cancel"), style: "cancel" },
          {
            text: tr("publish"),
            onPress: async () => {
              setBusy(true);
              try {
                const p = await apiRequest<any>(`/allocations/${a.id}/publish`, "POST", { previewHash: pv.inputsHash });
                Alert.alert(tr("published"), tr("publishedShort", { ref: a.reference, n: p.calls ?? 0 }));
              } catch (e: any) {
                Alert.alert(tr("notPublished"), e?.message ?? t("error"));
              } finally {
                setBusy(false);
                load();
              }
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };
  const deleteDraft = (a: any) =>
    Alert.alert(tr("deleteDraftQ", { ref: a.reference }), tr("deleteDraftBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: tr("delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest(`/allocations/${a.id}`, "DELETE");
          } catch (e: any) {
            Alert.alert(t("error"), e?.message ?? t("error"));
          }
          load();
        },
      },
    ]);
  const showReconciliation = async (a: any) => {
    try {
      const r = (await apiRequest<any>(`/allocations/${a.id}/reconciliation`)).data;
      const c = r.checks ?? {};
      const mark = (ok: boolean) => (ok ? "✓" : "✕");
      Alert.alert(
        tr("reconTitle", { ref: a.reference, state: r.reconciled ? tr("reconOk") : tr("reconGap") }),
        [
          tr("recon1", { issued: fmt(r.issuedTotal), adj: fmt(r.adjustmentsTotal), cancelled: fmt(r.cancelledTotal) }),
          tr("recon2", { paid: fmt(r.paid), remaining: fmt(r.remaining), n: r.receipts }),
          tr("recon3", { a: mark(c.linesMatchAllocation), b: mark(c.obligationsMatchAllocation) }),
          tr("recon4", { a: mark(c.adjustmentsExplainDifference), b: mark(c.paymentsMatchObligations) }),
          tr("recon5", { a: mark(c.journalMatchesPayments), b: mark(c.oneReceiptPerPayment) }),
        ].join("\n"),
      );
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("error"));
    }
  };

  // The reason is always typed by the syndic (no default text).
  const [ending, setEnding] = useState<{ a: any; action: "correct" | "reverse" } | null>(null);
  const [endReason, setEndReason] = useState("");
  const endAllocation = (a: any, action: "correct" | "reverse") => {
    setEndReason("");
    setEnding({ a, action });
  };
  const runEnd = async (a: any, action: "correct" | "reverse", reason: string) => {
    if (reason.trim().length < 5) return Alert.alert(tr("reasonRequired"), tr("min5"));
    setBusy(true);
    try {
      if (action === "reverse") {
        const r = await apiRequest<any>(`/allocations/${a.id}/reverse`, "POST", { reason });
        Alert.alert(tr("reversed"), tr("reversedBody", { n: r.cancelledCalls }));
      } else {
        const p = await apiRequest<any>(`/allocations/${a.id}/correct`, "POST", { reason });
        const pv = p.data?.preview;
        if (!pv?.valid) {
          Alert.alert(tr("correctImpossible"), (pv?.errors ?? []).map((x: Issue) => x.message).join("\n") || tr("invalidCalc"));
        } else {
          const r = await apiRequest<any>(`/allocations/${a.id}/correct`, "POST", { reason, previewHash: pv.inputsHash });
          Alert.alert(tr("corrected"), tr("correctedBody", { ref: a.reference, newRef: r.data?.correction?.reference ?? "", cancelled: r.data?.cancelledCalls ?? 0, calls: r.data?.calls ?? 0 }));
        }
      }
      await load();
    } catch (e: any) {
      Alert.alert(t("error"), e?.message ?? t("error"));
    } finally {
      setBusy(false);
    }
  };

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={t("repartitionCharges")} />
      <View style={{ padding: 16, gap: 8 }}>
        {buildings.length > 1 && <ChoiceChips value={buildingId} onChange={setBuildingId} options={buildings.map((b) => ({ key: b.id, label: b.name }))} />}
        <ChoiceChips value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ key: "keys", label: tr("tabKeys") }, ...(canCompute ? [{ key: "compute", label: tr("tabCompute") }] : []), { key: "history", label: tr("tabHistory") }]} />
      </View>
      {loadErr ? (
        <ErrorState title={tr("loadError")} description="" retryLabel={t("retry")} onRetry={load} accentColor={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10, paddingBottom: insets.bottom + 40 }}>
          {tab === "keys" && (
            <>
              {isSyndic && <ActionButton label={tr("newKeyBtn")} icon="plus" onPress={() => setKeySheet({ base: null })} />}
              {keys.length === 0 ? <Text style={{ color: colors.mutedForeground }}>{tr("noKeys")}</Text> : null}
              {keys.map((k) => {
                const d = keyDetail[k.id];
                const v = d?.versions?.[0];
                return (
                  <View key={k.id} style={[styles.card, card]}>
                    <Text style={[styles.name, { color: colors.foreground }]}>{k.code} — {k.name}{k.status === "archived" ? tr("archived") : ""}</Text>
                    {v ? (
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        v{v.version} · {v.method === "equal" ? tr("equalShares") : tr("coefficients")} · {v.categories.join(", ")} · {tr("since", { d: formatDay(lang, v.effectiveFrom) })}{v.effectiveTo ? tr("until", { d: formatDay(lang, v.effectiveTo) }) : ""}
                      </Text>
                    ) : null}
                    {v ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{tr("sourceLabel", { s: v.sourceReference })}</Text> : null}
                    {v?.shares?.map((s: any) => (
                      <Text key={s.id} style={[styles.meta, { color: colors.foreground }]}>
                        {s.lotNumber} : {s.excluded ? tr("excludedWith", { r: s.exclusionReason }) : Number(s.coefficient)}
                      </Text>
                    ))}
                    <Issues errors={d?.validation?.errors} warnings={d?.validation?.warnings} />
                    {isSyndic && k.status === "active" ? <ActionButton label={tr("newVersionBtn")} icon="git-branch" color="#6A6680" onPress={() => setKeySheet({ base: d })} /> : null}
                  </View>
                );
              })}
            </>
          )}

          {tab === "compute" && canCompute && (
            <>
              <FieldLabel label={tr("period")} />
              <TextInput value={period} onChangeText={(v) => { setPeriod(v); setPreview(null); }} style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder="2026-Q1" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
              <FieldLabel label={tr("callType")} />
              <ChoiceChips value={chargeType} onChange={(v) => { setChargeType(v); setPreview(null); }} options={CHARGE_TYPES.map((c) => ({ key: c.key, label: tr(c.labelKey) }))} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <FieldLabel label={tr("issue")} />
                  <TextInput value={issueDate} onChangeText={(v) => { setIssueDate(v); setPreview(null); }} style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={tr("today")} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <FieldLabel label={tr("due")} />
                  <TextInput value={dueDate} onChangeText={(v) => { setDueDate(v); setPreview(null); }} style={[formStyles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} placeholder={tr("plus30")} placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
                </View>
              </View>
              <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("expensesHdr")}</Text>
              {expenses.length === 0 ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{tr("none")}</Text> : null}
              {expenses.map((e) => {
                const k = `expense:${e.id}`;
                return (
                  <TouchableOpacity key={e.id} onPress={() => { setPreview(null); setPicked((p) => { const n = { ...p }; if (n[k]) delete n[k]; else n[k] = { type: "expense", id: e.id }; return n; }); }} style={styles.pick}>
                    <Feather name={picked[k] ? "check-square" : "square"} size={16} color={colors.primary} />
                    <Text style={{ color: colors.foreground, flex: 1 }}>{e.reference} — {e.label} · {e.category} · {fmt(e.amount)}</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("budgetLines")}</Text>
              {budgets.flatMap((b) =>
                (b.lines ?? []).map((l: any) => {
                  const k = `line:${l.id}`;
                  return (
                    <TouchableOpacity key={l.id} onPress={() => { setPreview(null); setPicked((p) => { const n = { ...p }; if (n[k]) delete n[k]; else n[k] = { type: "budget_line", id: l.id }; return n; }); }} style={styles.pick}>
                      <Feather name={picked[k] ? "check-square" : "square"} size={16} color={colors.primary} />
                      <Text style={{ color: colors.foreground, flex: 1 }}>{b.year} · {l.label} · {l.category} · {fmt(l.amountAnnual)} {tr("perYear")}</Text>
                    </TouchableOpacity>
                  );
                }),
              )}
              <ActionButton label={tr("preview")} icon="eye" busy={busy} disabled={!period.trim() || sources.length === 0} onPress={doPreview} />
              {preview && (
                <View style={[styles.card, card, { gap: 6 }]}>
                  <Issues errors={preview.errors} warnings={preview.warnings} />
                  {preview.sources.map((s: any) => (
                    <View key={s.id} style={{ gap: 2 }}>
                      <Text style={[styles.name, { color: colors.foreground }]}>{s.label} — {fmt(s.amount)}</Text>
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{s.amountNote} · {tr("keyRef", { code: s.key?.code ?? "", v: s.key?.version ?? "" })} ({s.key?.sourceReference})</Text>
                      {s.lines.map((l: any) => (
                        <Text key={l.lotId} style={[styles.meta, { color: colors.foreground }]}>{l.lotNumber} : {l.explanation}</Text>
                      ))}
                    </View>
                  ))}
                  {preview.excluded?.length ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{tr("excludedList", { list: preview.excluded.map((e: any) => `${e.lotNumber} (${e.reason})`).join(" · ") })}</Text> : null}
                  <Text style={[styles.section, { color: colors.mutedForeground }]}>{tr("totalPerLot")}</Text>
                  {preview.perLot.map((l: any) => (
                    <Text key={l.lotId} style={{ color: colors.foreground }}>{l.lotNumber} : {fmt(l.amount)}</Text>
                  ))}
                  <Text style={{ color: preview.totals.reconciled ? colors.success : colors.danger, fontFamily: "Inter_600SemiBold" }}>
                    {tr("sourcesLine", { s: fmt(preview.totals.source), a: fmt(preview.totals.allocated) })} {preview.totals.reconciled ? "✓" : "✕"}
                  </Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>{preview.roundingRule}</Text>
                  <Text style={[styles.meta, { color: colors.foreground }]}>
                    {tr("issueLine", { issue: preview.issueDate, due: preview.dueDate, tz: preview.timezone })}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <ActionButton label={tr("draftBtn")} icon="save" color="#6A6680" busy={busy} disabled={!preview.valid} onPress={() => doConfirm(true)} />
                    </View>
                    <View style={{ flex: 2 }}>
                      <ActionButton label={tr("publishObligations")} icon="check-circle" busy={busy} disabled={!preview.valid} onPress={() => doConfirm(false)} />
                    </View>
                  </View>
                </View>
              )}
            </>
          )}

          {tab === "history" && (
            <>
              {allocs.length === 0 ? <Text style={{ color: colors.mutedForeground }}>{tr("noAllocations")}</Text> : null}
              {allocs.map((a) => (
                <View key={a.id} style={[styles.card, card]}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{a.reference} · {a.period} · {(() => { const c = CHARGE_TYPES.find((x) => x.key === a.chargeType); return c ? tr(c.labelKey) : a.chargeType; })()}</Text>
                  <Text style={[styles.meta, { color: a.status === "finalized" ? colors.successText : a.status === "draft" ? colors.warningText : colors.textMuted }]}>
                    {fmt(a.totalAmount)} ·{" "}
                    {a.status === "draft"
                      ? tr("stDraft")
                      : a.status === "finalized"
                        ? `${tr("stPublished")}${a.dueDate ? tr("dueOn", { d: a.dueDate }) : ""}`
                        : a.status === "corrected"
                          ? tr("stCorrected", { r: a.endReason ?? "" })
                          : tr("stReversed", { r: a.endReason ?? "" })}
                    {a.correctionOf ? tr("correctsEarlier", { r: a.correctionReason ?? "" }) : ""}
                  </Text>
                  {canCompute && a.status === "draft" ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 2 }}>
                        <ActionButton label={tr("verifyPublish")} icon="send" busy={busy} onPress={() => publishDraft(a)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ActionButton label={tr("delete")} icon="trash-2" color={colors.danger} busy={busy} onPress={() => deleteDraft(a)} />
                      </View>
                    </View>
                  ) : null}
                  {a.status !== "draft" ? (
                    <TouchableOpacity onPress={() => showReconciliation(a)} style={styles.pick} accessibilityRole="button">
                      <Feather name="check-square" size={14} color={colors.primary} />
                      <Text style={{ color: colors.tint, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{tr("reconciliation")}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isSyndic && a.status === "finalized" ? (
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <ActionButton label={tr("correct")} icon="edit-3" color="#6A6680" busy={busy} onPress={() => endAllocation(a, "correct")} />
                      <ActionButton label={tr("reverse")} icon="x-circle" color={colors.danger} busy={busy} onPress={() => endAllocation(a, "reverse")} />
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
      <FormSheet visible={!!ending} title={ending ? `${ending.action === "correct" ? tr("correct") : tr("reverse")} ${ending.a.reference}` : ""} onClose={() => setEnding(null)} closeLabel={t("close")}>
        <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
          {ending?.action === "correct"
            ? tr("endCorrectBody")
            : tr("endReverseBody")}
        </Text>
        <FieldLabel label={tr("reason")} />
        <TextInput value={endReason} onChangeText={setEndReason} multiline style={[formStyles.input, { minHeight: 70, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]} />
        <ActionButton
          label={tr("confirm")}
          color={ending?.action === "reverse" ? colors.danger : undefined}
          busy={busy}
          disabled={endReason.trim().length < 5}
          onPress={() => {
            const e = ending!;
            setEnding(null);
            runEnd(e.a, e.action, endReason.trim());
          }}
        />
      </FormSheet>
      <KeySheet visible={!!keySheet} buildingId={buildingId} lots={lots} base={keySheet?.base ?? null} onClose={() => setKeySheet(null)} onDone={() => { setKeySheet(null); load(); }} />
      {busy && tab !== "compute" ? <ActivityIndicator style={{ position: "absolute", top: "50%", alignSelf: "center" }} color={colors.primary} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", marginTop: 8 },
  lotRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  pick: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
});
