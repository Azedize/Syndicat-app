import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { pickAndUploadInvoice } from "@/lib/upload";
import { ticketedUrl } from "@/services/api";
import FilterChips from "@/components/FilterChips";
import RoleGuard from "@/components/RoleGuard";
import ScreenHeader from "@/components/ScreenHeader";
import { ErrorState } from "@/components/DataState";

/**
 * Treasury of the syndicate: bank / cash accounts with balances computed by
 * the server from the journal, the journal itself (append-only, corrections
 * by reversal), supplier expenses (submitted → approved → paid) and bank
 * reconciliation. Read: admin, treasurer, president, council. Write: admin,
 * treasurer. Expense approval: admin, president.
 */
export default function TresorerieScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "treasurer", "president", "committee_member"]}>
      <TresorerieInner />
    </RoleGuard>
  );
}

type Lang = "fr" | "en" | "ar" | "es";
const S = {
  title: { fr: "Trésorerie", en: "Treasury", ar: "الخزينة", es: "Tesorería" },
  accounts: { fr: "Comptes", en: "Accounts", ar: "الحسابات", es: "Cuentas" },
  journal: { fr: "Journal", en: "Journal", ar: "اليومية", es: "Diario" },
  expenses: { fr: "Dépenses", en: "Expenses", ar: "النفقات", es: "Gastos" },
  reconciliation: { fr: "Rapprochement", en: "Reconciliation", ar: "المطابقة", es: "Conciliación" },
  balance: { fr: "Solde", en: "Balance", ar: "الرصيد", es: "Saldo" },
  noAccount: { fr: "Aucun compte. Créez le compte bancaire du syndicat pour pouvoir valider les paiements.", en: "No account yet. Create the syndicate bank account to validate payments.", ar: "لا يوجد حساب. أنشئ الحساب البنكي للسنديك لتتمكن من المصادقة على الأداءات.", es: "Sin cuentas. Cree la cuenta bancaria del sindicato para validar pagos." },
  newAccount: { fr: "Nouveau compte", en: "New account", ar: "حساب جديد", es: "Nueva cuenta" },
  transfer: { fr: "Virement interne", en: "Internal transfer", ar: "تحويل داخلي", es: "Transferencia interna" },
  bank: { fr: "Banque", en: "Bank", ar: "بنك", es: "Banco" },
  cash: { fr: "Caisse", en: "Cash", ar: "صندوق", es: "Caja" },
  label: { fr: "Libellé", en: "Label", ar: "التسمية", es: "Etiqueta" },
  bankName: { fr: "Nom de la banque", en: "Bank name", ar: "اسم البنك", es: "Nombre del banco" },
  holder: { fr: "Titulaire", en: "Account holder", ar: "صاحب الحساب", es: "Titular" },
  rib: { fr: "RIB (24 chiffres)", en: "RIB (24 digits)", ar: "رقم RIB (24 رقماً)", es: "RIB (24 dígitos)" },
  opening: { fr: "Solde d'ouverture (MAD)", en: "Opening balance (MAD)", ar: "الرصيد الافتتاحي (درهم)", es: "Saldo inicial (MAD)" },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  from: { fr: "Depuis", en: "From", ar: "من", es: "Desde" },
  to: { fr: "Vers", en: "To", ar: "إلى", es: "Hacia" },
  amount: { fr: "Montant (MAD)", en: "Amount (MAD)", ar: "المبلغ (درهم)", es: "Importe (MAD)" },
  reverse: { fr: "Extourner", en: "Reverse", ar: "عكس القيد", es: "Anular" },
  reverseReason: { fr: "Motif de l'extourne", en: "Reason for the reversal", ar: "سبب عكس القيد", es: "Motivo de la anulación" },
  reversed: { fr: "Extournée", en: "Reversed", ar: "معكوس", es: "Anulado" },
  reconciled: { fr: "Rapprochée", en: "Reconciled", ar: "مطابق", es: "Conciliado" },
  inflow: { fr: "Entrées", en: "In", ar: "المداخيل", es: "Entradas" },
  outflow: { fr: "Sorties", en: "Out", ar: "المصاريف", es: "Salidas" },
  empty: { fr: "Rien pour le moment.", en: "Nothing yet.", ar: "لا شيء حالياً.", es: "Nada por ahora." },
  loadError: { fr: "Impossible de charger la trésorerie.", en: "Could not load the treasury.", ar: "تعذر تحميل الخزينة.", es: "No se pudo cargar la tesorería." },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  newExpense: { fr: "Nouvelle dépense", en: "New expense", ar: "نفقة جديدة", es: "Nuevo gasto" },
  supplier: { fr: "Fournisseur", en: "Supplier", ar: "المورد", es: "Proveedor" },
  category: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  invoiceNumber: { fr: "N° de facture", en: "Invoice number", ar: "رقم الفاتورة", es: "N.º de factura" },
  attachInvoice: { fr: "Joindre la facture (PDF ou photo) *", en: "Attach the invoice (PDF or photo) *", ar: "إرفاق الفاتورة (PDF أو صورة) *", es: "Adjuntar la factura (PDF o foto) *" },
  invoiceAttached: { fr: "Facture jointe", en: "Invoice attached", ar: "تم إرفاق الفاتورة", es: "Factura adjunta" },
  approve: { fr: "Approuver", en: "Approve", ar: "مصادقة", es: "Aprobar" },
  reject: { fr: "Rejeter", en: "Reject", ar: "رفض", es: "Rechazar" },
  pay: { fr: "Payer", en: "Pay", ar: "أداء", es: "Pagar" },
  paymentRef: { fr: "Réf. virement / n° chèque", en: "Transfer ref. / cheque no.", ar: "مرجع التحويل / رقم الشيك", es: "Ref. transferencia / n.º cheque" },
  method: { fr: "Mode de paiement", en: "Payment method", ar: "طريقة الأداء", es: "Método de pago" },
  account: { fr: "Compte", en: "Account", ar: "الحساب", es: "Cuenta" },
  viewInvoice: { fr: "Voir la facture", en: "View invoice", ar: "عرض الفاتورة", es: "Ver factura" },
  st_submitted: { fr: "À approuver", en: "To approve", ar: "للمصادقة", es: "Por aprobar" },
  st_approved: { fr: "À payer", en: "To pay", ar: "للأداء", es: "Por pagar" },
  st_paid: { fr: "Payée", en: "Paid", ar: "مؤداة", es: "Pagado" },
  st_rejected: { fr: "Rejetée", en: "Rejected", ar: "مرفوضة", es: "Rechazado" },
  st_cancelled: { fr: "Annulée", en: "Cancelled", ar: "ملغاة", es: "Cancelado" },
  all: { fr: "Toutes", en: "All", ar: "الكل", es: "Todas" },
  importStatement: { fr: "Importer un relevé", en: "Import a statement", ar: "استيراد كشف حساب", es: "Importar extracto" },
  importHint: { fr: "Collez les lignes du relevé : date;montant;libellé;référence (ex. 2026-10-05;-350,00;VIR ASCENSEURS;F118). Montant négatif = débit.", en: "Paste statement lines: date;amount;label;reference (e.g. 2026-10-05;-350.00;VIR LIFT;F118). Negative = debit.", ar: "ألصق أسطر الكشف: التاريخ;المبلغ;البيان;المرجع. المبلغ السالب = مدين.", es: "Pegue las líneas: fecha;importe;concepto;referencia. Negativo = cargo." },
  import: { fr: "Importer", en: "Import", ar: "استيراد", es: "Importar" },
  toMatch: { fr: "À rapprocher", en: "To match", ar: "للمطابقة", es: "Por conciliar" },
  match: { fr: "Rapprocher", en: "Match", ar: "مطابقة", es: "Conciliar" },
  candidates: { fr: "Écritures proposées", en: "Suggested entries", ar: "القيود المقترحة", es: "Asientos sugeridos" },
  noCandidate: { fr: "Aucune écriture correspondante : enregistrez l'opération ou signalez une anomalie.", en: "No matching entry: record the operation or flag an anomaly.", ar: "لا يوجد قيد مطابق: سجل العملية أو أبلغ عن خلل.", es: "Sin asiento: registre la operación o marque una anomalía." },
  anomaly: { fr: "Signaler une anomalie", en: "Flag an anomaly", ar: "الإبلاغ عن خلل", es: "Marcar anomalía" },
  anomalyNote: { fr: "Décrivez l'anomalie", en: "Describe the anomaly", ar: "صف الخلل", es: "Describa la anomalía" },
  onlyBank: { fr: "Créez d'abord un compte bancaire.", en: "Create a bank account first.", ar: "أنشئ حساباً بنكياً أولاً.", es: "Cree primero una cuenta bancaria." },
  saved: { fr: "Enregistré", en: "Saved", ar: "تم الحفظ", es: "Guardado" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  required: { fr: "Champs obligatoires manquants ou invalides.", en: "Missing or invalid required fields.", ar: "حقول إلزامية ناقصة أو غير صالحة.", es: "Faltan campos obligatorios o no son válidos." },
  ln_unmatched: { fr: "Non rapprochée", en: "Unmatched", ar: "غير مطابق", es: "Sin conciliar" },
  ln_partial: { fr: "Partielle", en: "Partial", ar: "جزئي", es: "Parcial" },
  ln_matched: { fr: "Rapprochée", en: "Matched", ar: "مطابق", es: "Conciliado" },
  ln_anomaly: { fr: "Anomalie", en: "Anomaly", ar: "خلل", es: "Anomalía" },
  ln_ignored: { fr: "Ignorée", en: "Ignored", ar: "متجاهل", es: "Ignorado" },
} as const;

const EXPENSE_CATEGORIES = ["entretien", "ascenseur", "gardiennage", "eau_electricite", "assurance", "travaux", "honoraires_syndic", "frais_bancaires", "autre"];

function mad(v: string | number, lang: Lang): string {
  const n = Number(v) || 0;
  try {
    return new Intl.NumberFormat(lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR", {
      style: "currency",
      currency: "MAD",
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} MAD`;
  }
}

/** "1 234,50" / "1234.5" → "1234.50", or null when invalid. */
function parseAmount(raw: string, allowNegative = false): string | null {
  const v = raw.replace(/\s/g, "").replace(",", ".");
  const re = allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(v) || Number(v) === 0) return null;
  return Number(v).toFixed(2);
}

const newKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Defined at module level: components declared inside the screen would be
// re-created on every render and remount the sheets, closing the keyboard
// after each keystroke on Android / iOS.
type Colors = ReturnType<typeof useColors>;

function Btn({ label, onPress, color, icon, busy }: { label: string; onPress: () => void; color: string; icon?: keyof typeof Feather.glyphMap; busy: boolean }) {
  return (
    <TouchableOpacity style={[styles.btn, { backgroundColor: color, opacity: busy ? 0.6 : 1 }]} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator size="small" color="#fff" /> : icon ? <Feather name={icon} size={14} color="#fff" /> : null}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Sheet({ visible, title, onClose, children, colors, bottomInset, closeLabel }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; colors: Colors; bottomInset: number; closeLabel: string }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel={closeLabel}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: bottomInset + 24 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chips({ value, options, onChange, colors }: { value: string; options: { key: string; label: string }[]; onChange: (k: string) => void; colors: Colors }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.key}
          onPress={() => onChange(o.key)}
          style={[styles.chip, { borderColor: value === o.key ? colors.primary : colors.border, backgroundColor: value === o.key ? colors.primary + "18" : colors.card }]}
        >
          <Text style={{ color: value === o.key ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function TresorerieInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const L = lang as Lang;
  const tr = (k: keyof typeof S) => S[k][L] ?? S[k].fr;
  const { showToast } = useToast();
  const canWrite = user?.role === "syndicate_admin" || user?.role === "treasurer";
  const canApprove = user?.role === "syndicate_admin" || user?.role === "president";

  const [tab, setTab] = useState("accounts");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [journal, setJournal] = useState<{ data: any[]; totals?: any }>({ data: [] });
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseFilter, setExpenseFilter] = useState("all");
  const [bankId, setBankId] = useState<string | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Modals
  const [accountModal, setAccountModal] = useState(false);
  const [accountForm, setAccountForm] = useState({ kind: "bank", label: "", bankName: "", accountHolder: "", rib: "", openingBalance: "" });
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromAccountId: "", toAccountId: "", amount: "" });
  const [reverseTarget, setReverseTarget] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ label: "", category: "entretien", amount: "", supplierName: "", invoiceNumber: "", proofUrl: "" });
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ paymentMethod: "virement", paymentReference: "", accountId: "" });
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [importModal, setImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [lineTarget, setLineTarget] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<any[] | null>(null);
  const idemKey = useRef<string>("");

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [acc, jr, ex] = await Promise.all([
        apiRequest<{ data: any[] }>("/treasury/accounts"),
        apiRequest<{ data: any[]; totals: any }>("/treasury/journal?limit=100"),
        apiRequest<{ data: any[] }>("/expenses?limit=100"),
      ]);
      setAccounts(acc.data ?? []);
      setJournal({ data: jr.data ?? [], totals: jr.totals });
      setExpenses(ex.data ?? []);
      const firstBank = (acc.data ?? []).find((a) => a.kind === "bank" && a.status === "active");
      const selectedBank = bankId ?? firstBank?.id ?? null;
      setBankId(selectedBank);
      if (selectedBank) {
        const ln = await apiRequest<{ data: any[] }>(`/treasury/accounts/${selectedBank}/statement-lines`);
        setLines(ln.data ?? []);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bankId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", title: tr("saved"), message: success ?? "" });
      await load();
      return true;
    } catch (e: any) {
      // Always the server's reason (insufficient cash, already paid, RIB invalid…)
      Alert.alert(tr("error"), e?.message || tr("loadError"));
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const activeAccounts = accounts.filter((a) => a.status === "active");
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => expenseFilter === "all" || e.status === expenseFilter),
    [expenses, expenseFilter],
  );

  // ─── Actions ────────────────────────────────────────────────────────────────
  const submitAccount = async () => {
    const f = accountForm;
    const opening = f.openingBalance.trim() ? parseAmount(f.openingBalance) : "0";
    if (f.label.trim().length < 2 || opening === null || (f.kind === "bank" && (!f.bankName.trim() || f.rib.replace(/\D/g, "").length !== 24))) {
      Alert.alert(tr("error"), tr("required"));
      return;
    }
    const ok = await run(() =>
      apiRequest("/treasury/accounts", "POST", {
        kind: f.kind,
        label: f.label.trim(),
        ...(f.kind === "bank" ? { bankName: f.bankName.trim(), rib: f.rib.replace(/\D/g, ""), accountHolder: f.accountHolder.trim() || undefined } : {}),
        openingBalance: opening === "0" ? 0 : opening,
      }),
    );
    if (ok) {
      setAccountModal(false);
      setAccountForm({ kind: "bank", label: "", bankName: "", accountHolder: "", rib: "", openingBalance: "" });
    }
  };

  const submitTransfer = async () => {
    const amount = parseAmount(transferForm.amount);
    if (!transferForm.fromAccountId || !transferForm.toAccountId || transferForm.fromAccountId === transferForm.toAccountId || !amount) {
      Alert.alert(tr("error"), tr("required"));
      return;
    }
    const ok = await run(() =>
      apiRequest("/treasury/transfers", "POST", { ...transferForm, amount }, undefined, { "Idempotency-Key": idemKey.current }),
    );
    if (ok) setTransferModal(false);
  };

  const submitReverse = async () => {
    if (!reverseTarget || reason.trim().length < 3) {
      Alert.alert(tr("error"), tr("required"));
      return;
    }
    const ok = await run(() => apiRequest(`/treasury/entries/${reverseTarget.id}/reverse`, "POST", { reason: reason.trim() }));
    if (ok) {
      setReverseTarget(null);
      setReason("");
    }
  };

  const attachInvoice = async () => {
    try {
      const up = await pickAndUploadInvoice();
      if (up) setExpenseForm((f) => ({ ...f, proofUrl: up.objectPath }));
    } catch (e: any) {
      Alert.alert(tr("error"), e?.message || tr("loadError"));
    }
  };

  const submitExpense = async () => {
    const f = expenseForm;
    const amount = parseAmount(f.amount);
    if (f.label.trim().length < 2 || !amount || !f.supplierName.trim() || !f.proofUrl) {
      Alert.alert(tr("error"), tr("required"));
      return;
    }
    const ok = await run(() =>
      apiRequest(
        "/expenses",
        "POST",
        { label: f.label.trim(), category: f.category, amount, supplierName: f.supplierName.trim(), invoiceNumber: f.invoiceNumber.trim() || undefined, proofUrl: f.proofUrl },
        undefined,
        { "Idempotency-Key": idemKey.current },
      ),
    );
    if (ok) {
      setExpenseModal(false);
      setExpenseForm({ label: "", category: "entretien", amount: "", supplierName: "", invoiceNumber: "", proofUrl: "" });
    }
  };

  const submitPay = async () => {
    if (!payTarget) return;
    if (payForm.paymentMethod !== "especes" && !payForm.paymentReference.trim()) {
      Alert.alert(tr("error"), tr("required"));
      return;
    }
    const ok = await run(() =>
      apiRequest(`/expenses/${payTarget.id}/pay`, "POST", {
        paymentMethod: payForm.paymentMethod,
        paymentReference: payForm.paymentReference.trim() || undefined,
        accountId: payForm.accountId || undefined,
      }),
    );
    if (ok) setPayTarget(null);
  };

  const submitReject = async () => {
    if (!rejectTarget || reason.trim().length < 3) {
      Alert.alert(tr("error"), tr("required"));
      return;
    }
    const ok = await run(() => apiRequest(`/expenses/${rejectTarget.id}/reject`, "POST", { reason: reason.trim() }));
    if (ok) {
      setRejectTarget(null);
      setReason("");
    }
  };

  const submitImport = async () => {
    if (!bankId) return;
    const parsed = importText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [date, amount, label, reference] = l.split(";").map((p) => p?.trim());
        return { valueDate: date, amount: parseAmount(amount ?? "", true), label, reference: reference || undefined };
      });
    if (parsed.length === 0 || parsed.some((l) => !/^\d{4}-\d{2}-\d{2}$/.test(l.valueDate ?? "") || !l.amount || !l.label)) {
      Alert.alert(tr("error"), tr("importHint"));
      return;
    }
    const ok = await run(() => apiRequest(`/treasury/accounts/${bankId}/statement-lines`, "POST", { lines: parsed }));
    if (ok) {
      setImportModal(false);
      setImportText("");
    }
  };

  const openLine = async (line: any) => {
    setLineTarget(line);
    setCandidates(null);
    try {
      const res = await apiRequest<{ data: any[] }>(`/treasury/statement-lines/${line.id}/candidates`);
      setCandidates(res.data ?? []);
    } catch {
      setCandidates([]);
    }
  };

  const openFile = async (objectPath: string) => {
    try {
      await Linking.openURL(await ticketedUrl(`/storage${objectPath}`));
    } catch {
      Alert.alert(tr("error"), tr("loadError"));
    }
  };

  // ─── Render helpers ─────────────────────────────────────────────────────────
  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const input = [styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }];
  const accountOptions = activeAccounts.map((a) => ({ key: a.id, label: `${a.label} (${mad(a.balance, L)})` }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={tr("title")} subtitle={`${tr("balance")} : ${mad(totalBalance, L)}`} color="#0f766e" />
      <FilterChips
        options={[
          { key: "accounts", label: tr("accounts") },
          { key: "journal", label: tr("journal") },
          { key: "expenses", label: tr("expenses"), count: expenses.filter((e) => e.status === "submitted" || e.status === "approved").length || undefined },
          { key: "reconciliation", label: tr("reconciliation") },
        ]}
        value={tab}
        onChange={setTab}
        accentColor="#0f766e"
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0f766e" />
        </View>
      ) : loadError ? (
        <ErrorState title={tr("loadError")} description="" retryLabel={tr("retry")} onRetry={() => { setLoading(true); load(); }} accentColor="#0f766e" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {tab === "accounts" && (
            <>
              {canWrite && (
                <View style={styles.row}>
                  <Btn busy={busy} color={colors.primary} label={tr("newAccount")} icon="plus" onPress={() => setAccountModal(true)} />
                  {activeAccounts.length >= 2 && (
                    <Btn busy={busy}
                      label={tr("transfer")}
                      icon="repeat"
                      color="#0f766e"
                      onPress={() => {
                        idemKey.current = newKey("transfer");
                        setTransferForm({ fromAccountId: "", toAccountId: "", amount: "" });
                        setTransferModal(true);
                      }}
                    />
                  )}
                </View>
              )}
              {accounts.length === 0 ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>{tr("noAccount")}</Text>
              ) : (
                accounts.map((a) => (
                  <View key={a.id} style={[styles.card, card, a.status !== "active" && { opacity: 0.55 }]}>
                    <View style={styles.row}>
                      <Feather name={a.kind === "bank" ? "briefcase" : "dollar-sign"} size={18} color="#0f766e" />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                          {a.label}{a.isDefault ? " ★" : ""}
                        </Text>
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                          {a.kind === "bank" ? `${a.bankName ?? tr("bank")} · ${a.ribMasked ?? ""}` : tr("cash")}
                        </Text>
                      </View>
                      <Text style={[styles.amount, { color: Number(a.balance) < 0 ? "#ef4444" : colors.foreground }]}>{mad(a.balance, L)}</Text>
                    </View>
                    <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                      {tr("inflow")} {mad(a.inflow, L)} · {tr("outflow")} {mad(a.outflow, L)}
                      {a.unreconciledEntries ? ` · ${a.unreconciledEntries} ${tr("toMatch").toLowerCase()}` : ""}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}

          {tab === "journal" && (
            <>
              {journal.totals && (
                <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                  {tr("inflow")} {mad(journal.totals.inflow, L)} · {tr("outflow")} {mad(journal.totals.outflow, L)}
                </Text>
              )}
              {journal.data.length === 0 ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>{tr("empty")}</Text>
              ) : (
                journal.data.map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    style={[styles.card, card]}
                    disabled={!canWrite || !!e.reversedBy || e.sourceType === "reversal" || e.sourceType === "opening"}
                    onLongPress={() => {
                      setReverseTarget(e);
                      setReason("");
                    }}
                    onPress={() => {
                      setReverseTarget(e);
                      setReason("");
                    }}
                  >
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{e.label}</Text>
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                          {e.entryNumber} · {e.entryDate} · {e.accountLabel}
                        </Text>
                        <Text style={[styles.cardSub, { color: e.reversedBy ? "#6b7280" : e.reconciliation === "reconciled" ? "#10b981" : colors.mutedForeground }]}>
                          {e.reversedBy ? `${tr("reversed")} (${e.reversedBy})` : e.reconciliation === "reconciled" ? tr("reconciled") : ""}
                        </Text>
                      </View>
                      <Text style={[styles.amount, { color: e.direction === "in" ? "#10b981" : "#ef4444" }]}>
                        {e.direction === "in" ? "+" : "−"}{mad(e.amount, L)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {tab === "expenses" && (
            <>
              {canWrite && (
                <Btn busy={busy}
                  color={colors.primary}
                  label={tr("newExpense")}
                  icon="plus"
                  onPress={() => {
                    idemKey.current = newKey("expense");
                    setExpenseModal(true);
                  }}
                />
              )}
              <Chips
                colors={colors}
                value={expenseFilter}
                onChange={setExpenseFilter}
                options={[
                  { key: "all", label: tr("all") },
                  { key: "submitted", label: tr("st_submitted") },
                  { key: "approved", label: tr("st_approved") },
                  { key: "paid", label: tr("st_paid") },
                ]}
              />
              {filteredExpenses.length === 0 ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>{tr("empty")}</Text>
              ) : (
                filteredExpenses.map((x) => (
                  <View key={x.id} style={[styles.card, card]}>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{x.label}</Text>
                        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                          {x.reference} · {x.supplierName ?? x.prestataireName ?? "—"} · {x.category}
                        </Text>
                        <Text style={[styles.cardSub, { color: x.status === "paid" ? "#10b981" : x.status === "rejected" || x.status === "cancelled" ? "#ef4444" : "#f59e0b" }]}>
                          {tr(`st_${x.status}` as keyof typeof S)}
                          {x.rejectionReason ? ` — ${x.rejectionReason}` : ""}
                        </Text>
                      </View>
                      <Text style={[styles.amount, { color: colors.foreground }]}>{mad(x.amount, L)}</Text>
                    </View>
                    <View style={styles.row}>
                      <TouchableOpacity onPress={() => openFile(x.proofUrl)} style={styles.link}>
                        <Feather name="file-text" size={13} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontSize: 12 }}>{tr("viewInvoice")}</Text>
                      </TouchableOpacity>
                      {canApprove && x.status === "submitted" && (
                        <>
                          <Btn busy={busy} label={tr("approve")} color="#10b981" onPress={() => run(() => apiRequest(`/expenses/${x.id}/approve`, "POST"))} />
                          <Btn busy={busy} label={tr("reject")} color="#ef4444" onPress={() => { setRejectTarget(x); setReason(""); }} />
                        </>
                      )}
                      {canWrite && x.status === "approved" && (
                        <Btn busy={busy}
                          label={tr("pay")}
                          color="#0f766e"
                          onPress={() => {
                            setPayForm({ paymentMethod: "virement", paymentReference: "", accountId: "" });
                            setPayTarget(x);
                          }}
                        />
                      )}
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {tab === "reconciliation" && (
            <>
              {!bankId ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>{tr("onlyBank")}</Text>
              ) : (
                <>
                  <Chips
                colors={colors}
                    value={bankId}
                    onChange={(k) => { setBankId(k); setLoading(true); }}
                    options={activeAccounts.filter((a) => a.kind === "bank").map((a) => ({ key: a.id, label: a.label }))}
                  />
                  {canWrite && <Btn busy={busy} color={colors.primary} label={tr("importStatement")} icon="upload" onPress={() => setImportModal(true)} />}
                  {lines.length === 0 ? (
                    <Text style={[styles.empty, { color: colors.mutedForeground }]}>{tr("empty")}</Text>
                  ) : (
                    lines.map((l) => (
                      <TouchableOpacity key={l.id} style={[styles.card, card]} onPress={() => canWrite && openLine(l)} disabled={!canWrite || l.status === "matched" || l.status === "ignored"}>
                        <View style={styles.row}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{l.label}</Text>
                            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
                              {l.valueDate}{l.reference ? ` · ${l.reference}` : ""} · {tr(`ln_${l.status}` as keyof typeof S)}
                            </Text>
                            {l.note ? <Text style={[styles.cardSub, { color: "#ef4444" }]}>{l.note}</Text> : null}
                          </View>
                          <Text style={[styles.amount, { color: Number(l.amount) > 0 ? "#10b981" : "#ef4444" }]}>{mad(l.amount, L)}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* New account */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={accountModal} title={tr("newAccount")} onClose={() => setAccountModal(false)}>
        <Chips colors={colors} value={accountForm.kind} onChange={(k) => setAccountForm((f) => ({ ...f, kind: k }))} options={[{ key: "bank", label: tr("bank") }, { key: "cash", label: tr("cash") }]} />
        <TextInput style={input} placeholder={tr("label")} placeholderTextColor={colors.mutedForeground} value={accountForm.label} onChangeText={(v) => setAccountForm((f) => ({ ...f, label: v }))} />
        {accountForm.kind === "bank" && (
          <>
            <TextInput style={input} placeholder={tr("bankName")} placeholderTextColor={colors.mutedForeground} value={accountForm.bankName} onChangeText={(v) => setAccountForm((f) => ({ ...f, bankName: v }))} />
            <TextInput style={input} placeholder={tr("holder")} placeholderTextColor={colors.mutedForeground} value={accountForm.accountHolder} onChangeText={(v) => setAccountForm((f) => ({ ...f, accountHolder: v }))} />
            <TextInput style={input} placeholder={tr("rib")} placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" maxLength={30} value={accountForm.rib} onChangeText={(v) => setAccountForm((f) => ({ ...f, rib: v }))} />
          </>
        )}
        <TextInput style={input} placeholder={tr("opening")} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" value={accountForm.openingBalance} onChangeText={(v) => setAccountForm((f) => ({ ...f, openingBalance: v }))} />
        <Btn busy={busy} color={colors.primary} label={tr("save")} icon="check" onPress={submitAccount} />
      </Sheet>

      {/* Internal transfer */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={transferModal} title={tr("transfer")} onClose={() => setTransferModal(false)}>
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("from")}</Text>
        <Chips colors={colors} value={transferForm.fromAccountId} onChange={(k) => setTransferForm((f) => ({ ...f, fromAccountId: k }))} options={accountOptions} />
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("to")}</Text>
        <Chips colors={colors} value={transferForm.toAccountId} onChange={(k) => setTransferForm((f) => ({ ...f, toAccountId: k }))} options={accountOptions} />
        <TextInput style={input} placeholder={tr("amount")} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" value={transferForm.amount} onChangeText={(v) => setTransferForm((f) => ({ ...f, amount: v }))} />
        <Btn busy={busy} color={colors.primary} label={tr("save")} icon="check" onPress={submitTransfer} />
      </Sheet>

      {/* Reverse a journal entry */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={!!reverseTarget} title={tr("reverse")} onClose={() => setReverseTarget(null)}>
        {reverseTarget && (
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {reverseTarget.entryNumber} — {reverseTarget.label} ({mad(reverseTarget.amount, L)})
          </Text>
        )}
        <TextInput style={[...input, { minHeight: 80 }]} multiline placeholder={tr("reverseReason")} placeholderTextColor={colors.mutedForeground} value={reason} onChangeText={setReason} />
        <Btn busy={busy} label={tr("reverse")} color="#ef4444" icon="rotate-ccw" onPress={submitReverse} />
      </Sheet>

      {/* New expense */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={expenseModal} title={tr("newExpense")} onClose={() => setExpenseModal(false)}>
        <TextInput style={input} placeholder={tr("label")} placeholderTextColor={colors.mutedForeground} value={expenseForm.label} onChangeText={(v) => setExpenseForm((f) => ({ ...f, label: v }))} />
        <TextInput style={input} placeholder={tr("supplier")} placeholderTextColor={colors.mutedForeground} value={expenseForm.supplierName} onChangeText={(v) => setExpenseForm((f) => ({ ...f, supplierName: v }))} />
        <TextInput style={input} placeholder={tr("amount")} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" value={expenseForm.amount} onChangeText={(v) => setExpenseForm((f) => ({ ...f, amount: v }))} />
        <TextInput style={input} placeholder={tr("invoiceNumber")} placeholderTextColor={colors.mutedForeground} value={expenseForm.invoiceNumber} onChangeText={(v) => setExpenseForm((f) => ({ ...f, invoiceNumber: v }))} />
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("category")}</Text>
        <Chips colors={colors} value={expenseForm.category} onChange={(k) => setExpenseForm((f) => ({ ...f, category: k }))} options={EXPENSE_CATEGORIES.map((c) => ({ key: c, label: c.replace(/_/g, " ") }))} />
        <TouchableOpacity style={[styles.card, card, styles.row]} onPress={attachInvoice}>
          <Feather name={expenseForm.proofUrl ? "check-circle" : "paperclip"} size={16} color={expenseForm.proofUrl ? "#10b981" : colors.primary} />
          <Text style={{ color: colors.foreground }}>{expenseForm.proofUrl ? tr("invoiceAttached") : tr("attachInvoice")}</Text>
        </TouchableOpacity>
        <Btn busy={busy} color={colors.primary} label={tr("save")} icon="check" onPress={submitExpense} />
      </Sheet>

      {/* Pay an approved expense */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={!!payTarget} title={tr("pay")} onClose={() => setPayTarget(null)}>
        {payTarget && <Text style={[styles.cardTitle, { color: colors.foreground }]}>{payTarget.reference} — {mad(payTarget.amount, L)}</Text>}
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("method")}</Text>
        <Chips
                colors={colors}
          value={payForm.paymentMethod}
          onChange={(k) => setPayForm((f) => ({ ...f, paymentMethod: k }))}
          options={[
            { key: "virement", label: "Virement" },
            { key: "cheque", label: "Chèque" },
            { key: "prelevement", label: "Prélèvement" },
            { key: "especes", label: tr("cash") },
          ]}
        />
        {payForm.paymentMethod !== "especes" && (
          <TextInput style={input} placeholder={tr("paymentRef")} placeholderTextColor={colors.mutedForeground} value={payForm.paymentReference} onChangeText={(v) => setPayForm((f) => ({ ...f, paymentReference: v }))} />
        )}
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("account")}</Text>
        <Chips colors={colors} value={payForm.accountId} onChange={(k) => setPayForm((f) => ({ ...f, accountId: k }))} options={accountOptions} />
        <Btn busy={busy} label={tr("pay")} icon="check" color="#0f766e" onPress={submitPay} />
      </Sheet>

      {/* Reject an expense */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={!!rejectTarget} title={tr("reject")} onClose={() => setRejectTarget(null)}>
        <TextInput style={[...input, { minHeight: 80 }]} multiline placeholder={tr("reverseReason")} placeholderTextColor={colors.mutedForeground} value={reason} onChangeText={setReason} />
        <Btn busy={busy} label={tr("reject")} color="#ef4444" onPress={submitReject} />
      </Sheet>

      {/* Import a bank statement */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={importModal} title={tr("importStatement")} onClose={() => setImportModal(false)}>
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("importHint")}</Text>
        <TextInput style={[...input, { minHeight: 160, textAlignVertical: "top" }]} multiline autoCapitalize="none" value={importText} onChangeText={setImportText} />
        <Btn busy={busy} color={colors.primary} label={tr("import")} icon="upload" onPress={submitImport} />
      </Sheet>

      {/* Match a statement line */}
      <Sheet colors={colors} bottomInset={insets.bottom} closeLabel={tr("cancel")} visible={!!lineTarget} title={tr("match")} onClose={() => setLineTarget(null)}>
        {lineTarget && (
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {lineTarget.valueDate} · {lineTarget.label} · {mad(lineTarget.amount, L)}
          </Text>
        )}
        <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("candidates")}</Text>
        {candidates === null ? (
          <ActivityIndicator />
        ) : candidates.length === 0 ? (
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{tr("noCandidate")}</Text>
        ) : (
          candidates.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.card, card]}
              disabled={busy}
              onPress={async () => {
                const ok = await run(() => apiRequest("/treasury/reconciliation/matches", "POST", { statementLineId: lineTarget.id, ledgerEntryId: c.id }));
                if (ok) setLineTarget(null);
              }}
            >
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{c.entry_number} · {c.entry_date}</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{c.label} · {mad(c.remaining, L)}</Text>
            </TouchableOpacity>
          ))
        )}
        <TextInput style={[...input, { minHeight: 70 }]} multiline placeholder={tr("anomalyNote")} placeholderTextColor={colors.mutedForeground} value={reason} onChangeText={setReason} />
        <Btn busy={busy}
          label={tr("anomaly")}
          color="#f59e0b"
          icon="alert-triangle"
          onPress={async () => {
            if (!lineTarget || reason.trim().length < 3) {
              Alert.alert(tr("error"), tr("anomalyNote"));
              return;
            }
            const ok = await run(() => apiRequest(`/treasury/statement-lines/${lineTarget.id}/status`, "POST", { status: "anomaly", note: reason.trim() }));
            if (ok) {
              setLineTarget(null);
              setReason("");
            }
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  amount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  empty: { textAlign: "center", paddingVertical: 32, fontSize: 13, fontFamily: "Inter_400Regular" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minHeight: 40 },
  btnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  link: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: "auto" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
});
