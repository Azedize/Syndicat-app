import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import RoleGuard from "@/components/RoleGuard";
import { ErrorState, LoadingState } from "@/components/DataState";

const STRINGS = {
  screenTitle: {
    fr: "Fiches de paie",
    en: "Pay slips",
    ar: "قسائم الرواتب",
    es: "Nóminas",
  },
  records: { fr: "enregistrement", en: "record", ar: "سجل", es: "registro" },
  recordsPlural: {
    fr: "enregistrements",
    en: "records",
    ar: "سجلات",
    es: "registros",
  },
  totalMonth: {
    fr: "Total du mois",
    en: "Monthly total",
    ar: "إجمالي الشهر",
    es: "Total del mes",
  },
  paid: { fr: "Payés", en: "Paid", ar: "مدفوع", es: "Pagados" },
  pending: {
    fr: "En attente",
    en: "Pending",
    ar: "قيد الانتظار",
    es: "Pendientes",
  },
  statusPaid: { fr: "Payé", en: "Paid", ar: "مدفوع", es: "Pagado" },
  statusPending: {
    fr: "En attente",
    en: "Pending",
    ar: "قيد الانتظار",
    es: "Pendiente",
  },
  statusDraft: { fr: "Brouillon", en: "Draft", ar: "مسودة", es: "Borrador" },
  loadingTitle: {
    fr: "Chargement des fiches de paie",
    en: "Loading pay slips",
    ar: "جارٍ تحميل قسائم الرواتب",
    es: "Cargando nóminas",
  },
  loadingDescription: {
    fr: "Nous récupérons les données de paie de votre syndicat.",
    en: "We are retrieving your syndicate's payroll data.",
    ar: "نحن نسترجع بيانات رواتب نقابتك.",
    es: "Estamos recuperando los datos de nóminas de su sindicato.",
  },
  loadingError: {
    fr: "Impossible de charger les fiches de paie",
    en: "Unable to load pay slips",
    ar: "تعذر تحميل قسائم الرواتب",
    es: "No se pueden cargar las nóminas",
  },
  errorDescription: {
    fr: "Les données de paie ne sont pas disponibles. Vérifiez votre connexion puis réessayez.",
    en: "Payroll data is unavailable. Check your connection and try again.",
    ar: "بيانات الرواتب غير متاحة. تحقق من الاتصال ثم أعد المحاولة.",
    es: "Los datos de nóminas no están disponibles. Compruebe su conexión e inténtelo de nuevo.",
  },
  retry: {
    fr: "Réessayer",
    en: "Retry",
    ar: "إعادة المحاولة",
    es: "Reintentar",
  },
  emptyTitle: {
    fr: "Aucune fiche de paie",
    en: "No pay slips",
    ar: "لا توجد قسائم رواتب",
    es: "Sin nóminas",
  },
  emptyForMonth: {
    fr: "Aucun enregistrement pour",
    en: "No records for",
    ar: "لا توجد سجلات لـ",
    es: "No hay registros para",
  },
  emptyDescription: {
    fr: "Aucune fiche de paie n'a encore été enregistrée.",
    en: "No pay slips have been recorded yet.",
    ar: "لم يتم تسجيل أي قسائم رواتب بعد.",
    es: "Todavía no se ha registrado ninguna nómina.",
  },
  paidOn: { fr: "Payé le", en: "Paid on", ar: "مدفوع في", es: "Pagado el" },
  markPaid: {
    fr: "Marquer comme payé",
    en: "Mark as paid",
    ar: "وضع علامة مدفوع",
    es: "Marcar como pagado",
  },
  confirmTitle: {
    fr: "Confirmer le paiement",
    en: "Confirm payment",
    ar: "تأكيد الدفع",
    es: "Confirmar pago",
  },
  confirmMessage: {
    fr: "Marquer cette fiche de paie comme payée pour",
    en: "Mark this pay slip as paid for",
    ar: "وضع علامة مدفوع على قسيمة الراتب لـ",
    es: "Marcar esta nómina como pagada para",
  },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  confirm: { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  createdTitle: {
    fr: "Fiche ajoutée",
    en: "Pay slip added",
    ar: "تمت إضافة القسيمة",
    es: "Nómina añadida",
  },
  createdMessage: {
    fr: "La fiche de paie a été enregistrée.",
    en: "The pay slip has been recorded.",
    ar: "تم تسجيل قسيمة الراتب.",
    es: "La nómina ha sido registrada.",
  },
  updatedMessage: {
    fr: "La fiche de paie est marquée comme payée.",
    en: "The pay slip is marked as paid.",
    ar: "تم وضع علامة مدفوع على قسيمة الراتب.",
    es: "La nómina está marcada como pagada.",
  },
  genericError: {
    fr: "Une erreur est survenue. Réessayez.",
    en: "Something went wrong. Please try again.",
    ar: "حدث خطأ. حاول مرة أخرى.",
    es: "Se produjo un error. Inténtelo de nuevo.",
  },
  newPaySlip: {
    fr: "Nouvelle fiche de paie",
    en: "New pay slip",
    ar: "قسيمة راتب جديدة",
    es: "Nueva nómina",
  },
  postLabel: {
    fr: "Poste / Rôle *",
    en: "Position / Role *",
    ar: "المنصب / الدور *",
    es: "Puesto / Rol *",
  },
  postPlaceholder: {
    fr: "Ex. Gardien, comptable, syndic",
    en: "e.g. Caretaker, accountant, manager",
    ar: "مثال: حارس، محاسب، مدير",
    es: "Ej. portero, contable, administrador",
  },
  amountLabel: {
    fr: "Montant (MAD) *",
    en: "Amount (MAD) *",
    ar: "المبلغ (درهم) *",
    es: "Importe (MAD) *",
  },
  amountPlaceholder: {
    fr: "Ex. 5000",
    en: "e.g. 5000",
    ar: "مثال: 5000",
    es: "Ej. 5000",
  },
  monthLabel: {
    fr: "Mois (AAAA-MM) *",
    en: "Month (YYYY-MM) *",
    ar: "الشهر (YYYY-MM) *",
    es: "Mes (AAAA-MM) *",
  },
  monthPlaceholder: {
    fr: "Ex. 2026-07",
    en: "e.g. 2026-07",
    ar: "مثال: 2026-07",
    es: "Ej. 2026-07",
  },
  requiredTitle: {
    fr: "Champ requis",
    en: "Required field",
    ar: "حقل مطلوب",
    es: "Campo obligatorio",
  },
  postRequired: {
    fr: "Le poste est obligatoire.",
    en: "Position is required.",
    ar: "المنصب مطلوب.",
    es: "El puesto es obligatorio.",
  },
  amountRequired: {
    fr: "Le montant est obligatoire.",
    en: "Amount is required.",
    ar: "المبلغ مطلوب.",
    es: "El importe es obligatorio.",
  },
  monthRequired: {
    fr: "Le mois est obligatoire.",
    en: "Month is required.",
    ar: "الشهر مطلوب.",
    es: "El mes es obligatorio.",
  },
  amountInvalid: {
    fr: "Le montant doit être un nombre strictement positif.",
    en: "Amount must be a positive number.",
    ar: "يجب أن يكون المبلغ رقماً موجباً.",
    es: "El importe debe ser un número positivo.",
  },
  monthInvalid: {
    fr: "Le mois doit respecter le format AAAA-MM.",
    en: "Month must use the YYYY-MM format.",
    ar: "يجب أن يكون الشهر بالتنسيق YYYY-MM.",
    es: "El mes debe tener el formato AAAA-MM.",
  },
  save: { fr: "Enregistrer", en: "Save", ar: "حفظ", es: "Guardar" },
} as const;

const STATUS_CFG: Record<
  string,
  { stringKey: keyof typeof STRINGS; color: string; bg: string }
> = {
  paid: { stringKey: "statusPaid", color: "#10b981", bg: "#10b98118" },
  pending: { stringKey: "statusPending", color: "#f59e0b", bg: "#f59e0b18" },
  draft: { stringKey: "statusDraft", color: "#6b7280", bg: "#6b728018" },
};

type SalaryRecord = {
  id: string;
  role: string;
  amount: string | number;
  month: string;
  status: string;
  paidDate?: string | null;
  syndicateId?: string | null;
  createdAt: string;
};

function formatMoney(
  v: string | number,
  lang: "fr" | "en" | "ar" | "es",
): string {
  const locale =
    lang === "ar"
      ? "ar-MA"
      : lang === "en"
        ? "en-US"
        : lang === "es"
          ? "es-MA"
          : "fr-MA";
  return `${parseFloat(String(v ?? 0)).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

// Fiches de paie (payroll) is an admin-only financial module.
// Members and tenants must not access it — they have no payroll relationship with the syndicate.
export default function FichesPaieScreen() {
  return (
    <RoleGuard allow={["syndicate_admin", "treasurer"]}>
      <FichesPaieScreenInner />
    </RoleGuard>
  );
}

function FichesPaieScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { lang } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;
  // Treasurer manages payroll (spec: "Mohamed gère les salaires"). Admin for validation.
  const isAdmin =
    user?.role === "syndicate_admin" || user?.role === "treasurer";
  const { showToast } = useToast();

  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    role: "",
    amount: "",
    month: new Date().toISOString().slice(0, 7),
  });
  const [submitting, setSubmitting] = useState(false);
  const [payingIds, setPayingIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);
        if (!silent) setLoadError(false);
        const data = await apiRequest(
          "/finance/salaries?limit=200",
          "GET",
          undefined,
          token,
        );
        const rows: SalaryRecord[] = data.data ?? data.rows ?? [];
        setRecords(rows);
        if (rows.length > 0) {
          // Default to most recent month
          const months = Array.from(new Set(rows.map((r) => r.month)))
            .sort()
            .reverse();
          setSelectedMonth((current) => current ?? months[0] ?? null);
        }
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const handleAdd = async () => {
    if (!form.role.trim()) {
      showToast({
        type: "error",
        title: STRINGS.requiredTitle[lang],
        message: STRINGS.postRequired[lang],
      });
      return;
    }
    if (!form.amount.trim()) {
      showToast({
        type: "error",
        title: STRINGS.requiredTitle[lang],
        message: STRINGS.amountRequired[lang],
      });
      return;
    }
    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast({
        type: "error",
        title: STRINGS.requiredTitle[lang],
        message: STRINGS.amountInvalid[lang],
      });
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(form.month.trim())) {
      showToast({
        type: "error",
        title: STRINGS.requiredTitle[lang],
        message: form.month.trim()
          ? STRINGS.monthInvalid[lang]
          : STRINGS.monthRequired[lang],
      });
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest(
        "/finance/salaries",
        "POST",
        {
          role: form.role,
           amount,
           month: form.month.trim(),
          status: "pending",
        },
        token,
      );
      setShowAdd(false);
      setForm({
        role: "",
        amount: "",
        month: new Date().toISOString().slice(0, 7),
      });
      load(true);
      showToast({
        type: "success",
        title: STRINGS.createdTitle[lang],
        message: STRINGS.createdMessage[lang],
      });
    } catch {
      showToast({
        type: "error",
        title: STRINGS.loadingError[lang],
        message: STRINGS.genericError[lang],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    if (payingIds.has(id)) return;
    setPayingIds((current) => new Set(current).add(id));
    try {
      await apiRequest(
        `/finance/salaries/${id}`,
        "PUT",
        {
          status: "paid",
          paidDate: new Date().toISOString().split("T")[0],
        },
        token,
      );
      load(true);
      showToast({ type: "success", message: STRINGS.updatedMessage[lang] });
    } catch (e: any) {
      // e.g. no default bank account, salary already paid
      showToast({
        type: "error",
        title: STRINGS.loadingError[lang],
        message: e?.message || STRINGS.genericError[lang],
      });
      load(true);
    } finally {
      setPayingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  // Unique months sorted desc
  const months = Array.from(new Set(records.map((r) => r.month)))
    .sort()
    .reverse();
  const monthRecords = selectedMonth
    ? records.filter((r) => r.month === selectedMonth)
    : records;
  const totalNet = monthRecords.reduce(
    (s, r) => s + parseFloat(String(r.amount ?? 0)),
    0,
  );
  const paidCount = monthRecords.filter((r) => r.status === "paid").length;
  const pendingCount = monthRecords.filter(
    (r) => r.status === "pending",
  ).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 16, backgroundColor: "#2563EB" },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{STRINGS.screenTitle[lang]}</Text>
          <Text style={styles.headerSub}>
            {records.length}{" "}
            {records.length !== 1
              ? STRINGS.recordsPlural[lang]
              : STRINGS.records[lang]}
          </Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAdd(true);
            }}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Stats */}
      <View
        style={[
          styles.statsRow,
          { backgroundColor: "#fff", borderBottomColor: "#e2e8f0" },
        ]}
      >
        {[
          {
            label: STRINGS.totalMonth[lang],
            value: formatMoney(totalNet, lang),
            color: "#2563EB",
          },
          {
            label: STRINGS.paid[lang],
            value: paidCount.toString(),
            color: "#10b981",
          },
          {
            label: STRINGS.pending[lang],
            value: pendingCount.toString(),
            color: "#f59e0b",
          },
        ].map((s, i, arr) => (
          <View
            key={s.label}
            style={[
              styles.statCell,
              i < arr.length - 1 && {
                borderRightWidth: 1,
                borderRightColor: "#e2e8f0",
              },
            ]}
          >
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLab, { color: "#64748b" }]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Month selector */}
      {months.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.monthsScroll, { borderBottomColor: "#e2e8f0" }]}
          contentContainerStyle={{
            paddingHorizontal: 12,
            gap: 8,
            paddingVertical: 10,
          }}
        >
          {months.map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.monthChip,
                {
                  backgroundColor:
                    selectedMonth === m ? "#2563EB" : colors.secondary,
                  borderColor: selectedMonth === m ? "#2563EB" : colors.border,
                },
              ]}
              onPress={() => setSelectedMonth(m)}
            >
              <Text
                style={[
                  styles.monthChipText,
                  { color: selectedMonth === m ? "#fff" : colors.foreground },
                ]}
              >
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <LoadingState
          title={STRINGS.loadingTitle[lang]}
          description={STRINGS.loadingDescription[lang]}
          accentColor="#2563EB"
        />
      ) : loadError ? (
        <ErrorState
          title={STRINGS.loadingError[lang]}
          description={STRINGS.errorDescription[lang]}
          retryLabel={STRINGS.retry[lang]}
          onRetry={() => load()}
          accentColor="#ef4444"
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
              tintColor="#2563EB"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {monthRecords.length === 0 ? (
            <View style={styles.empty}>
              <View
                style={[styles.emptyIcon, { backgroundColor: "#2563EB15" }]}
              >
                <Feather name="file-text" size={32} color="#2563EB" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {STRINGS.emptyTitle[lang]}
              </Text>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                {selectedMonth
                  ? `${STRINGS.emptyForMonth[lang]} ${selectedMonth}.`
                  : STRINGS.emptyDescription[lang]}
              </Text>
            </View>
          ) : (
            monthRecords.map((rec) => {
              const sc = STATUS_CFG[rec.status] ?? STATUS_CFG.pending;
              return (
                <View
                  key={rec.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.avatarCircle,
                        { backgroundColor: "#2563EB18" },
                      ]}
                    >
                      <Feather name="user" size={20} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.cardRole, { color: colors.foreground }]}
                      >
                        {rec.role}
                      </Text>
                      <Text
                        style={[
                          styles.cardMonth,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {rec.month}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 5 }}>
                      <Text
                        style={[
                          styles.cardAmount,
                          { color: colors.foreground },
                        ]}
                      >
                        {formatMoney(rec.amount, lang)}
                      </Text>
                      <View
                        style={[styles.statusBadge, { backgroundColor: sc.bg }]}
                      >
                        <Text style={[styles.statusText, { color: sc.color }]}>
                          {STRINGS[sc.stringKey][lang]}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {rec.paidDate ? (
                    <View
                      style={[
                        styles.paidRow,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <Feather name="check-circle" size={12} color="#10b981" />
                      <Text style={[styles.paidDate, { color: "#10b981" }]}>
                        {STRINGS.paidOn[lang]} {rec.paidDate}
                      </Text>
                    </View>
                  ) : isAdmin && rec.status === "pending" ? (
                    <View
                      style={[
                        styles.paidRow,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <TouchableOpacity
                        style={[
                          styles.payBtn,
                          {
                            backgroundColor: "#10b98118",
                            borderColor: "#10b981",
                            opacity: payingIds.has(rec.id) ? 0.6 : 1,
                          },
                        ]}
                        disabled={payingIds.has(rec.id)}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          Alert.alert(
                            STRINGS.confirmTitle[lang],
                            `${STRINGS.confirmMessage[lang]} ${rec.role} (${rec.month}) ?`,
                            [
                              { text: STRINGS.cancel[lang], style: "cancel" },
                              {
                                text: STRINGS.confirm[lang],
                                onPress: () => handleMarkPaid(rec.id),
                              },
                            ],
                          );
                        }}
                      >
                        <Feather name="check" size={14} color="#10b981" />
                        <Text style={[styles.payBtnText, { color: "#10b981" }]}>
                          {STRINGS.markPaid[lang]}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add Modal */}
      <Modal
        visible={showAdd}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {STRINGS.newPaySlip[lang]}
            </Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {[
              {
                label: STRINGS.postLabel[lang],
                key: "role" as const,
                placeholder: STRINGS.postPlaceholder[lang],
              },
              {
                label: STRINGS.amountLabel[lang],
                key: "amount" as const,
                placeholder: STRINGS.amountPlaceholder[lang],
                numeric: true,
              },
              {
                label: STRINGS.monthLabel[lang],
                key: "month" as const,
                placeholder: STRINGS.monthPlaceholder[lang],
              },
            ].map((f) => (
              <View key={f.key}>
                <Text
                  style={[styles.fieldLabel, { color: colors.mutedForeground }]}
                >
                  {f.label}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={form[f.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  keyboardType={f.numeric ? "numeric" : "default"}
                />
              </View>
            ))}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: "#2563EB", opacity: submitting ? 0.7 : 1 },
              ]}
              onPress={handleAdd}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitText}>{STRINGS.save[lang]}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  monthsScroll: { borderBottomWidth: StyleSheet.hairlineWidth, maxHeight: 52 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  monthChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 10 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardRole: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardMonth: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardAmount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  paidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  paidDate: { fontSize: 12, fontFamily: "Inter_500Medium" },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  payBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});
