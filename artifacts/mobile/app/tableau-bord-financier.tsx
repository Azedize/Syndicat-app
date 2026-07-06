import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 48;
const CHART_HEIGHT = 140;

// ─── Translations ─────────────────────────────────────────────────────────────
const STRINGS = {
  loading: {
    fr: "Chargement du tableau de bord…",
    en: "Loading dashboard…",
    ar: "جاري تحميل لوحة القيادة...",
    es: "Cargando panel de control...",
  },
  headerTitle: {
    fr: "Tableau de Bord Financier",
    en: "Financial Dashboard",
    ar: "لوحة القيادة المالية",
    es: "Panel de Control Financiero",
  },
  recuperationRate: {
    fr: "Taux de recouvrement",
    en: "Recovery Rate",
    ar: "معدل التحصيل",
    es: "Tasa de Recuperación",
  },
  recoveryObjective: {
    fr: "Objectif 90%",
    en: "Target 90%",
    ar: "الهدف 90%",
    es: "Objetivo 90%",
  },
  called: {
    fr: "Appelé",
    en: "Called",
    ar: "المطلوب",
    es: "Llamado",
  },
  collected: {
    fr: "Encaissé",
    en: "Collected",
    ar: "المحصل",
    es: "Cobrado",
  },
  actionRequired: {
    fr: "Action requise",
    en: "Action Required",
    ar: "إجراء مطلوب",
    es: "Acción Requerida",
  },
  proofToValidate: {
    fr: "Preuve à valider",
    en: "Proof to validate",
    ar: "إثبات للتحقق",
    es: "Prueba a validar",
  },
  overdue: {
    fr: "En retard",
    en: "Overdue",
    ar: "متأخر",
    es: "Atrasado",
  },
  loadError: {
    fr: "Erreur de chargement",
    en: "Loading error",
    ar: "خطأ في التحميل",
    es: "Error de carga",
  },
  validationError: {
    fr: "Erreur lors de la validation",
    en: "Validation error",
    ar: "خطأ أثناء التحقق",
    es: "Error durante la validación",
  },
  finances: {
    fr: "Finances",
    en: "Finance",
    ar: "المالية",
    es: "Finanzas",
  },
  travaux: {
    fr: "Travaux",
    en: "Works",
    ar: "الأشغال",
    es: "Obras",
  },
  prestataires: {
    fr: "Prestataires",
    en: "Providers",
    ar: "المزودون",
    es: "Proveedores",
  },
  unpaid: {
    fr: "Impayé",
    en: "Unpaid",
    ar: "غير مدفوع",
    es: "Impago",
  },
  pending: {
    fr: "En attente",
    en: "Pending",
    ar: "في الانتظار",
    es: "Pendiente",
  },
  annualBudget: {
    fr: "Budget annuel",
    en: "Annual Budget",
    ar: "الميزانية السنوية",
    es: "Presupuesto anual",
  },
  reserveFund: {
    fr: "Fonds de réserve",
    en: "Reserve Fund",
    ar: "صندوق الاحتياط",
    es: "Fondo de reserva",
  },
  planned: {
    fr: "prévu",
    en: "planned",
    ar: "مخطط",
    es: "previsto",
  },
  occupiedLots: {
    fr: "Lots occupés",
    en: "Occupied Lots",
    ar: "الوحدات المشغولة",
    es: "Lotes ocupados",
  },
  occupationRate: {
    fr: "taux",
    en: "rate",
    ar: "معدل",
    es: "tasa",
  },
  callsForFunds: {
    fr: "Appels de fonds",
    en: "Calls for Funds",
    ar: "طلبات المساهمة",
    es: "Llamadas a fondos",
  },
  paidCount: {
    fr: "payés",
    en: "paid",
    ar: "مدفوعة",
    es: "pagados",
  },
  unpaidCount: {
    fr: "impayés",
    en: "unpaid",
    ar: "غير مدفوعة",
    es: "impagos",
  },
  paymentHistory: {
    fr: "Historique des paiements (6 mois)",
    en: "Payment History (6 months)",
    ar: "سجل المدفوعات (6 أشهر)",
    es: "Historial de pagos (6 meses)",
  },
  budgetDistribution: {
    fr: "Répartition du budget",
    en: "Budget Distribution",
    ar: "توزيع الميزانية",
    es: "Distribución del presupuesto",
  },
  totalBudget: {
    fr: "Total budget",
    en: "Total budget",
    ar: "إجمالي الميزانية",
    es: "Presupuesto total",
  },
  worksSummary: {
    fr: "Résumé des travaux",
    en: "Works Summary",
    ar: "ملخص الأشغال",
    es: "Resumen de obras",
  },
  worksInProgress: {
    fr: "en cours",
    en: "in progress",
    ar: "قيد التنفيذ",
    es: "en curso",
  },
  worksUrgent: {
    fr: "urgents",
    en: "urgent",
    ar: "عاجل",
    es: "urgentes",
  },
  spending: {
    fr: "Dépenses",
    en: "Spending",
    ar: "المصاريف",
    es: "Gastos",
  },
  estimated: {
    fr: "estimé",
    en: "estimated",
    ar: "مقدر",
    es: "estimado",
  },
  realSpending: {
    fr: "réel",
    en: "real",
    ar: "فعلي",
    es: "real",
  },
  activeWorks: {
    fr: "Travaux actifs",
    en: "Active Works",
    ar: "الأشغال النشطة",
    es: "Obras activas",
  },
  providersAndContracts: {
    fr: "Prestataires & Contrats",
    en: "Providers & Contracts",
    ar: "المزودون والعقود",
    es: "Proveedores y Contratos",
  },
  activeContracts: {
    fr: "contrats actifs",
    en: "active contracts",
    ar: "عقود نشطة",
    es: "contratos activos",
  },
  monthlyCost: {
    fr: "coût mensuel",
    en: "monthly cost",
    ar: "التكلفة الشهرية",
    es: "coste mensual",
  },
  activeProviderList: {
    fr: "Liste des prestataires actifs",
    en: "Active Provider List",
    ar: "قائمة المزودين النشطين",
    es: "Lista de proveedores activos",
  },
  providerName: {
    fr: "PRESTATAIRE",
    en: "PROVIDER",
    ar: "المزود",
    es: "PROVEEDOR",
  },
  contractType: {
    fr: "TYPE",
    en: "TYPE",
    ar: "النوع",
    es: "TIPO",
  },
  amount: {
    fr: "MONTANT",
    en: "AMOUNT",
    ar: "المبلغ",
    es: "MONTO",
  },
  recoveryAbbr: {
    fr: "recouv.",
    en: "recov.",
    ar: "تحصيل",
    es: "recov.",
  },
  annual: {
    fr: "annuel",
    en: "annual",
    ar: "سنوي",
    es: "anual",
  },
  endsOn: {
    fr: "Finit le",
    en: "Ends on",
    ar: "ينتهي في",
    es: "Termina el",
  },
  statusPlanned: {
    fr: "Planifié",
    en: "Planned",
    ar: "مخطط",
    es: "Planificado",
  },
  statusScheduled: {
    fr: "Programmé",
    en: "Scheduled",
    ar: "مجدول",
    es: "Programado",
  },
  statusInProgress: {
    fr: "En cours",
    en: "In progress",
    ar: "قيد التنفيذ",
    es: "En curso",
  },
  statusCompleted: {
    fr: "Terminé",
    en: "Completed",
    ar: "مكتمل",
    es: "Completado",
  },
  priorityUrgent: {
    fr: "Urgent",
    en: "Urgent",
    ar: "عاجل",
    es: "Urgente",
  },
  priorityHigh: {
    fr: "Haute",
    en: "High",
    ar: "عالية",
    es: "Alta",
  },
  priorityNormal: {
    fr: "Normale",
    en: "Normal",
    ar: "عادية",
    es: "Normal",
  },
  priorityLow: {
    fr: "Basse",
    en: "Low",
    ar: "منخفضة",
    es: "Baja",
  },
};

const CATEGORY_STRINGS: Record<string, Record<string, string>> = {
  nettoyage: {
    fr: "Nettoyage",
    en: "Cleaning",
    ar: "التنظيف",
    es: "Limpieza",
  },
  gardiennage: {
    fr: "Gardiennage",
    en: "Security",
    ar: "الحراسة",
    es: "Seguridad",
  },
  ascenseur: {
    fr: "Ascenseur",
    en: "Elevator",
    ar: "المصعد",
    es: "Ascensor",
  },
  electricite: {
    fr: "Électricité",
    en: "Electricity",
    ar: "الكهرباء",
    es: "Electricidad",
  },
  eau: {
    fr: "Eau",
    en: "Water",
    ar: "الماء",
    es: "Agua",
  },
  assurance: {
    fr: "Assurance",
    en: "Insurance",
    ar: "التأمين",
    es: "Seguro",
  },
  espaces_verts: {
    fr: "Espaces verts",
    en: "Green Spaces",
    ar: "المساحات الخضراء",
    es: "Zonas verdes",
  },
  administration: {
    fr: "Administration",
    en: "Administration",
    ar: "الإدارة",
    es: "Administración",
  },
  fonds_reserve: {
    fr: "Fonds de réserve",
    en: "Reserve Fund",
    ar: "صندوق الاحتياط",
    es: "Fondo de reserva",
  },
  entretien: {
    fr: "Entretien",
    en: "Maintenance",
    ar: "الصيانة",
    es: "Mantenimiento",
  },
  travaux: {
    fr: "Travaux",
    en: "Works",
    ar: "الأشغال",
    es: "Obras",
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface BuildingQuick {
  id: string;
  name: string;
  city: string;
  totalLots: number;
  tauxRecouvrement: number;
  totalEncaisse: number;
  totalDu: number;
}

interface MonthBar {
  label: string;
  paid: number;
  due: number;
}

interface PeriodStat {
  period: string;
  paid: number;
  overdue: number;
  pending: number;
  total: number;
  rate: number;
}

interface PendingItem {
  id: string;
  memberId: string;
  memberName: string;
  label: string;
  period: string;
  amount: number;
  dueDate: string | null;
  status: string;
  proof: {
    id: string;
    proofUrl: string;
    uploadedById: string;
    createdAt: string;
  } | null;
}

interface DashboardData {
  building: {
    id: string;
    name: string;
    city: string;
    totalLots: number;
    totalFloors: number;
  };
  summary: {
    totalMontantDu: number;
    totalEncaisse: number;
    totalImpaye: number;
    totalEnAttente: number;
    tauxRecouvrement: number;
    fondsReserveCollecte: number;
    budgetAnnuel: number;
    chargesAnnuelles: number;
    fondsReserveBudget: number;
  };
  lots: {
    total: number;
    occupes: number;
    vacants: number;
    tauxOccupation: number;
  };
  periodStats: PeriodStat[];
  monthlyHistory: MonthBar[];
  budgetByCategory: Record<string, number>;
  travaux: {
    total: number;
    enCours: number;
    termines: number;
    urgents: number;
    budgetEstime: number;
    depenseReelle: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      estimatedAmount: number | null;
      startDate: string | null;
    }>;
  };
  prestataires: {
    total: number;
    actifs: number;
    chargesContrats: number;
    contrats: Array<{
      title: string;
      prestataireName: string;
      type: string;
      monthlyAmount: number | null;
      annualAmount: number | null;
      endDate: string | null;
    }>;
  };
  appelsDeFonds: {
    total: number;
    paid: number;
    overdue: number;
    pending: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
function fmtMAD(n: number): string {
  return `${n.toLocaleString("fr-MA")} MAD`;
}

const CATEGORY_LABELS: Record<string, string> = {
  nettoyage: "Nettoyage",
  gardiennage: "Gardiennage",
  ascenseur: "Ascenseur",
  electricite: "Électricité",
  eau: "Eau",
  assurance: "Assurance",
  espaces_verts: "Espaces verts",
  administration: "Administration",
  fonds_reserve: "Fonds de réserve",
  entretien: "Entretien",
  travaux: "Travaux",
};

const getCategoryLabel = (cat: string, lang: string) => {
  return CATEGORY_STRINGS[cat]?.[lang] || CATEGORY_LABELS[cat] || cat;
};

const getStatusLabel = (status: string, lang: string) => {
  switch (status) {
    case "planned": return STRINGS.statusPlanned[lang as "fr"];
    case "scheduled": return STRINGS.statusScheduled[lang as "fr"];
    case "in_progress": return STRINGS.statusInProgress[lang as "fr"];
    case "completed": return STRINGS.statusCompleted[lang as "fr"];
    default: return status;
  }
};

const getPriorityLabel = (prio: string, lang: string) => {
  switch (prio) {
    case "urgent": return STRINGS.priorityUrgent[lang as "fr"];
    case "high": return STRINGS.priorityHigh[lang as "fr"];
    case "normal": return STRINGS.priorityNormal[lang as "fr"];
    case "low": return STRINGS.priorityLow[lang as "fr"];
    default: return prio;
  }
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  normal: "#3B82F6",
  low: "#6B7280",
};

const STATUS_COLOR: Record<string, string> = {
  in_progress: "#F97316",
  scheduled: "#3B82F6",
  planned: "#8B5CF6",
  completed: "#10B981",
};

// ─── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
}) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={styles.kpiText}>
        <Text style={styles.kpiValue}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
        {sub ? <Text style={[styles.kpiSub, { color }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function RecoveryGauge({ rate }: { rate: number }) {
  const { lang } = useLanguage();
  const color =
    rate >= 80 ? "#10B981" : rate >= 60 ? "#F59E0B" : "#EF4444";
  const barW = Math.round((CHART_WIDTH - 32) * (rate / 100));
  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeRow}>
        <Text style={styles.gaugeLabel}>{STRINGS.recuperationRate[lang]}</Text>
        <Text style={[styles.gaugeValue, { color }]}>{rate}%</Text>
      </View>
      <View style={styles.gaugeTrack}>
        <View
          style={[styles.gaugeBar, { width: barW, backgroundColor: color }]}
        />
      </View>
      <View style={styles.gaugeHints}>
        <Text style={styles.gaugeHint}>0%</Text>
        <Text style={styles.gaugeHint}>{STRINGS.recoveryObjective[lang]}</Text>
        <Text style={styles.gaugeHint}>100%</Text>
      </View>
    </View>
  );
}

function BarChart({ data }: { data: MonthBar[] }) {
  const { lang } = useLanguage();
  const maxVal = Math.max(...data.map((d) => Math.max(d.due, d.paid)), 1);
  const barW = Math.floor((CHART_WIDTH - 32) / data.length - 8);
  return (
    <View style={styles.chartArea}>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#E5E7EB" }]} />
          <Text style={styles.legendLabel}>{STRINGS.called[lang]}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
          <Text style={styles.legendLabel}>{STRINGS.collected[lang]}</Text>
        </View>
      </View>
      <View style={styles.bars}>
        {data.map((d, i) => {
          const dueH = Math.round((d.due / maxVal) * CHART_HEIGHT);
          const paidH = Math.round((d.paid / maxVal) * CHART_HEIGHT);
          return (
            <View key={i} style={[styles.barGroup, { width: barW + 8 }]}>
              <View style={[styles.barsInner, { height: CHART_HEIGHT }]}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: dueH || 2,
                      width: barW,
                      backgroundColor: "#E5E7EB",
                      position: "absolute",
                      bottom: 0,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.bar,
                    {
                      height: paidH || 2,
                      width: barW - 6,
                      backgroundColor: "#10B981",
                      position: "absolute",
                      bottom: 0,
                      left: 3,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CategoryRow({
  label,
  amount,
  total,
  color,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  const barW = Math.round(((CHART_WIDTH - 32) * pct) / 100);
  return (
    <View style={styles.catRow}>
      <View style={styles.catHeader}>
        <Text style={styles.catLabel}>{label}</Text>
        <Text style={styles.catAmount}>{fmtMAD(amount)}</Text>
      </View>
      <View style={styles.catTrack}>
        <View style={[styles.catBar, { width: Math.max(barW, 4), backgroundColor: color }]} />
      </View>
    </View>
  );
}

const CAT_COLORS = [
  "#3B82F6","#10B981","#F59E0B","#8B5CF6","#EF4444",
  "#06B6D4","#84CC16","#F97316","#EC4899","#6366F1",
];

function PendingActionsPanel({
  items,
  onReview,
  busyId,
}: {
  items: PendingItem[];
  onReview: (item: PendingItem, action: "approve" | "reject") => void;
  busyId: string | null;
}) {
  const { lang } = useLanguage();
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.pendingHeaderRow}>
        <Ionicons name="alert-circle" size={18} color="#F97316" />
        <Text style={styles.cardTitle}>{STRINGS.actionRequired[lang]} ({items.length})</Text>
      </View>
      {items.map((item) => {
        const isBusy = busyId === item.id;
        const isValidation = item.status === "pending_validation";
        return (
          <View key={item.id} style={styles.pendingRow}>
            <View style={styles.pendingInfo}>
              <Text style={styles.pendingName}>{item.memberName}</Text>
              <Text style={styles.pendingLabel}>
                {item.label} · {fmtMAD(item.amount)}
              </Text>
              <View
                style={[
                  styles.pendingBadge,
                  {
                    backgroundColor: isValidation ? "#FEF3C7" : "#FEE2E2",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pendingBadgeText,
                    { color: isValidation ? "#B45309" : "#B91C1C" },
                  ]}
                >
                  {isValidation ? STRINGS.proofToValidate[lang] : STRINGS.overdue[lang]}
                </Text>
              </View>
            </View>
            {isValidation && item.proof ? (
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  disabled={isBusy}
                  onPress={() => onReview(item, "reject")}
                  style={[styles.pendingBtn, styles.pendingBtnReject]}
                >
                  <Ionicons name="close" size={16} color="#EF4444" />
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={isBusy}
                  onPress={() => onReview(item, "approve")}
                  style={[styles.pendingBtn, styles.pendingBtnApprove]}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TableauBordFinancier() {
  const router = useRouter();
  const { lang } = useLanguage();
  const [buildings, setBuildings] = useState<BuildingQuick[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"finance" | "travaux" | "prestataires">("finance");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  const loadBuildings = useCallback(async () => {
    const res = await apiRequest<{ data: BuildingQuick[] }>("/finance/buildings");
    setBuildings(res.data);
    if (!selectedId && res.data.length > 0) setSelectedId(res.data[0].id);
  }, [selectedId]);

  const loadDashboard = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await apiRequest<{ data: DashboardData }>(`/finance/building/${id}`);
      setData(res.data);
    } catch (e: any) {
      setError(e.message ?? STRINGS.loadError[lang]);
    }
  }, [lang]);

  const loadPending = useCallback(async () => {
    try {
      const res = await apiRequest<{
        data: { overdueCount: number; pendingValidationCount: number; items: PendingItem[] };
      }>("/statistics/finance/pending");
      setPendingItems(res.data.items);
    } catch {
      // Non-blocking: dashboard still works without the action panel.
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadBuildings(), loadPending()]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedId) loadDashboard(selectedId);
  }, [selectedId, loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadBuildings(), loadPending()]);
    if (selectedId) await loadDashboard(selectedId);
    setRefreshing(false);
  }, [selectedId, loadBuildings, loadDashboard, loadPending]);

  const handleReview = useCallback(
    async (item: PendingItem, action: "approve" | "reject") => {
      if (!item.proof) return;
      setReviewBusyId(item.id);
      try {
        await apiRequest(`/payment-proofs/${item.proof.id}/review`, "PUT", { action });
        setPendingItems((prev) => prev.filter((p) => p.id !== item.id));
        if (selectedId) await loadDashboard(selectedId);
      } catch (e: any) {
        setError(e.message ?? STRINGS.validationError[lang]);
      } finally {
        setReviewBusyId(null);
      }
    },
    [selectedId, loadDashboard, lang],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>{STRINGS.loading[lang]}</Text>
      </View>
    );
  }

  const summary = data?.summary;
  const budgetCats = data ? Object.entries(data.budgetByCategory) : [];
  const budgetTotal = budgetCats.reduce((s, [, v]) => s + v, 0);

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{STRINGS.headerTitle[lang]}</Text>
          {data && (
            <Text style={styles.headerSub}>
              {data.building.name} · {data.building.city}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
        contentContainerStyle={styles.scroll}
      >
        {/* ── Building selector ──────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorRow}
        >
          {buildings.map((b) => {
            const active = b.id === selectedId;
            const rateColor =
              b.tauxRecouvrement >= 80
                ? "#10B981"
                : b.tauxRecouvrement >= 60
                ? "#F59E0B"
                : "#EF4444";
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => setSelectedId(b.id)}
                style={[styles.buildingChip, active && styles.buildingChipActive]}
              >
                <Text style={[styles.chipName, active && { color: "#fff" }]}>
                  {b.name}
                </Text>
                <Text style={[styles.chipCity, active && { color: "#CBD5E1" }]}>
                  {b.city}
                </Text>
                <View style={styles.chipRate}>
                  <View
                    style={[
                      styles.chipRateDot,
                      { backgroundColor: active ? "#fff" : rateColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipRateText,
                      { color: active ? "#fff" : rateColor },
                    ]}
                  >
                    {b.tauxRecouvrement}% recouv.
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!data && !error && (
          <ActivityIndicator style={{ marginTop: 32 }} color="#3B82F6" />
        )}

        {data && (
          <>
            {/* ── Section tabs ───────────────────────────────────────── */}
            <View style={styles.tabs}>
              {(["finance", "travaux", "prestataires"] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.tab, section === s && styles.tabActive]}
                  onPress={() => setSection(s)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      section === s && styles.tabTextActive,
                    ]}
                  >
                    {s === "finance"
                      ? "Finances"
                      : s === "travaux"
                      ? "Travaux"
                      : "Prestataires"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ══ SECTION : FINANCES ══════════════════════════════════ */}
            {section === "finance" && summary && (
              <>
                <PendingActionsPanel
                  items={pendingItems}
                  onReview={handleReview}
                  busyId={reviewBusyId}
                />

                {/* Recouvrement gauge */}
                <View style={styles.card}>
                  <RecoveryGauge rate={summary.tauxRecouvrement} />
                  <View style={styles.divider} />
                  <View style={styles.triRow}>
                    <View style={styles.triItem}>
                      <Text style={styles.triVal}>
                        {fmt(summary.totalEncaisse)}
                      </Text>
                      <Text style={[styles.triLab, { color: "#10B981" }]}>
                        Encaissé
                      </Text>
                    </View>
                    <View style={[styles.triItem, styles.triMid]}>
                      <Text style={styles.triVal}>
                        {fmt(summary.totalImpaye)}
                      </Text>
                      <Text style={[styles.triLab, { color: "#EF4444" }]}>
                        Impayé
                      </Text>
                    </View>
                    <View style={styles.triItem}>
                      <Text style={styles.triVal}>
                        {fmt(summary.totalEnAttente)}
                      </Text>
                      <Text style={[styles.triLab, { color: "#F59E0B" }]}>
                        En attente
                      </Text>
                    </View>
                  </View>
                </View>

                {/* KPI cards */}
                <View style={styles.kpiGrid}>
                  <KpiCard
                    label="Budget annuel"
                    value={fmt(summary.budgetAnnuel) + " MAD"}
                    color="#3B82F6"
                    icon="wallet-outline"
                  />
                  <KpiCard
                    label="Fonds de réserve"
                    value={fmt(summary.fondsReserveCollecte) + " MAD"}
                    sub={`/${fmt(summary.fondsReserveBudget)} prévu`}
                    color="#8B5CF6"
                    icon="shield-checkmark-outline"
                  />
                  <KpiCard
                    label="Lots occupés"
                    value={`${data.lots.occupes}/${data.lots.total}`}
                    sub={`${data.lots.tauxOccupation}% taux`}
                    color="#10B981"
                    icon="home-outline"
                  />
                  <KpiCard
                    label="Appels de fonds"
                    value={String(data.appelsDeFonds.total)}
                    sub={`${data.appelsDeFonds.paid} payés · ${data.appelsDeFonds.overdue} impayés`}
                    color="#F97316"
                    icon="cash-outline"
                  />
                </View>

                {/* Monthly bar chart */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    Historique des paiements (6 mois)
                  </Text>
                  <BarChart data={data.monthlyHistory} />
                </View>

                {/* Budget by category */}
                {budgetCats.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                      Répartition du budget {new Date().getFullYear()}
                    </Text>
                    <Text style={styles.cardSub}>
                      Total budget : {fmtMAD(budgetTotal)}
                    </Text>
                    {budgetCats
                      .sort(([, a], [, b]) => b - a)
                      .map(([cat, amt], i) => (
                        <CategoryRow
                          key={cat}
                          label={CATEGORY_LABELS[cat] ?? cat}
                          amount={amt}
                          total={budgetTotal}
                          color={CAT_COLORS[i % CAT_COLORS.length]}
                        />
                      ))}
                  </View>
                )}

                {/* Periods table */}
                {data.periodStats.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Suivi par trimestre</Text>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.th, { flex: 2 }]}>Période</Text>
                      <Text style={styles.th}>Payé</Text>
                      <Text style={styles.th}>Impayé</Text>
                      <Text style={[styles.th, { color: "#3B82F6" }]}>Taux</Text>
                    </View>
                    {data.periodStats.map((ps) => {
                      const rColor =
                        ps.rate >= 80
                          ? "#10B981"
                          : ps.rate >= 60
                          ? "#F59E0B"
                          : "#EF4444";
                      return (
                        <View key={ps.period} style={styles.tableRow}>
                          <Text style={[styles.td, { flex: 2, fontWeight: "600" }]}>
                            {ps.period}
                          </Text>
                          <Text style={[styles.td, { color: "#10B981" }]}>
                            {fmt(ps.paid)}
                          </Text>
                          <Text style={[styles.td, { color: "#EF4444" }]}>
                            {fmt(ps.overdue)}
                          </Text>
                          <Text style={[styles.td, { color: rColor, fontWeight: "700" }]}>
                            {ps.rate}%
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {/* ══ SECTION : TRAVAUX ═══════════════════════════════════ */}
            {section === "travaux" && (
              <>
                <View style={styles.kpiGrid}>
                  <KpiCard
                    label="En cours"
                    value={String(data.travaux.enCours)}
                    color="#F97316"
                    icon="construct-outline"
                  />
                  <KpiCard
                    label="Terminés"
                    value={String(data.travaux.termines)}
                    color="#10B981"
                    icon="checkmark-circle-outline"
                  />
                  <KpiCard
                    label="Urgents"
                    value={String(data.travaux.urgents)}
                    color="#EF4444"
                    icon="warning-outline"
                  />
                  <KpiCard
                    label="Budget estimé"
                    value={fmt(data.travaux.budgetEstime) + " MAD"}
                    sub={`Dépensé : ${fmt(data.travaux.depenseReelle)} MAD`}
                    color="#8B5CF6"
                    icon="bar-chart-outline"
                  />
                </View>

                {data.travaux.items.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Travaux en cours</Text>
                    {data.travaux.items.map((t) => (
                      <View key={t.id} style={styles.travauxItem}>
                        <View
                          style={[
                            styles.prioTag,
                            {
                              backgroundColor:
                                (PRIORITY_COLOR[t.priority] ?? "#6B7280") + "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.prioText,
                              {
                                color:
                                  PRIORITY_COLOR[t.priority] ?? "#6B7280",
                              },
                            ]}
                          >
                            {t.priority}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.travauxTitle}>{t.title}</Text>
                          <View style={styles.travauxMeta}>
                            <View
                              style={[
                                styles.statusDot,
                                {
                                  backgroundColor:
                                    STATUS_COLOR[t.status] ?? "#6B7280",
                                },
                              ]}
                            />
                            <Text style={styles.travauxStatus}>
                              {t.status === "in_progress"
                                ? "En cours"
                                : t.status === "scheduled"
                                ? "Planifié"
                                : t.status}
                            </Text>
                            {t.estimatedAmount && (
                              <Text style={styles.travauxAmt}>
                                {" · "}
                                {fmtMAD(t.estimatedAmount)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Budget travaux bar */}
                {data.travaux.budgetEstime > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Budget travaux</Text>
                    <View style={styles.gaugeRow}>
                      <Text style={styles.gaugeLabel}>Consommation</Text>
                      <Text style={styles.gaugeValue}>
                        {Math.round(
                          (data.travaux.depenseReelle /
                            data.travaux.budgetEstime) *
                            100,
                        )}
                        %
                      </Text>
                    </View>
                    <View style={styles.gaugeTrack}>
                      <View
                        style={[
                          styles.gaugeBar,
                          {
                            width: Math.round(
                              (CHART_WIDTH - 32) *
                                Math.min(
                                  data.travaux.depenseReelle /
                                    data.travaux.budgetEstime,
                                  1,
                                ),
                            ),
                            backgroundColor: "#F97316",
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.gaugeHints}>
                      <Text style={styles.gaugeHint}>
                        Dépensé : {fmtMAD(data.travaux.depenseReelle)}
                      </Text>
                      <Text style={styles.gaugeHint}>
                        Estimé : {fmtMAD(data.travaux.budgetEstime)}
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ══ SECTION : PRESTATAIRES ══════════════════════════════ */}
            {section === "prestataires" && (
              <>
                <View style={styles.kpiGrid}>
                  <KpiCard
                    label="Prestataires actifs"
                    value={String(data.prestataires.actifs)}
                    color="#3B82F6"
                    icon="people-outline"
                  />
                  <KpiCard
                    label="Charges contrats"
                    value={fmt(data.prestataires.chargesContrats) + " MAD"}
                    sub="par an"
                    color="#F97316"
                    icon="receipt-outline"
                  />
                </View>

                {data.prestataires.contrats.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Contrats actifs</Text>
                    {data.prestataires.contrats.map((c, i) => (
                      <View key={i} style={styles.contratItem}>
                        <View style={styles.contratLeft}>
                          <View
                            style={[
                              styles.contratIcon,
                              {
                                backgroundColor:
                                  CAT_COLORS[i % CAT_COLORS.length] + "20",
                              },
                            ]}
                          >
                            <Ionicons
                              name="briefcase-outline"
                              size={16}
                              color={CAT_COLORS[i % CAT_COLORS.length]}
                            />
                          </View>
                          <View>
                            <Text style={styles.contratName}>
                              {c.prestataireName}
                            </Text>
                            <Text style={styles.contratTitle}>{c.title}</Text>
                            <Text style={styles.contratType}>{c.type}</Text>
                          </View>
                        </View>
                        <View style={styles.contratRight}>
                          {c.monthlyAmount ? (
                            <Text style={styles.contratAmt}>
                              {fmt(c.monthlyAmount)}/mois
                            </Text>
                          ) : null}
                          {c.annualAmount ? (
                            <Text style={styles.contratAnnual}>
                              {fmt(c.annualAmount)} MAD/an
                            </Text>
                          ) : null}
                          {c.endDate ? (
                            <Text style={styles.contratEnd}>
                              Fin : {c.endDate}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  pendingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  pendingInfo: { flex: 1, gap: 4 },
  pendingName: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  pendingLabel: { fontSize: 12, color: "#64748B" },
  pendingBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: "600" },
  pendingActions: { flexDirection: "row", gap: 8, marginLeft: 8 },
  pendingBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  pendingBtnReject: { backgroundColor: "#FEE2E2" },
  pendingBtnApprove: { backgroundColor: "#10B981" },

  root: { flex: 1, backgroundColor: "#F1F5F9" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F1F5F9",
  },
  loadingText: { color: "#64748B", fontSize: 14 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1E3A5F",
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerSub: { color: "#93C5FD", fontSize: 12, marginTop: 2 },

  scroll: { paddingBottom: 24 },

  selectorRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  buildingChip: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    minWidth: 140,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  buildingChipActive: { backgroundColor: "#1E3A5F" },
  chipName: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  chipCity: { fontSize: 11, color: "#64748B", marginTop: 2 },
  chipRate: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  chipRateDot: { width: 6, height: 6, borderRadius: 3 },
  chipRateText: { fontSize: 11, fontWeight: "600" },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#EF4444",
  },
  errorText: { color: "#DC2626", fontSize: 13, flex: 1 },

  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#E2E8F0",
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  tabText: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  tabTextActive: { color: "#1E3A5F", fontWeight: "700" },

  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  cardSub: { fontSize: 12, color: "#64748B", marginBottom: 12 },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginVertical: 12 },

  gaugeWrap: {},
  gaugeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  gaugeLabel: { fontSize: 14, color: "#64748B", fontWeight: "500" },
  gaugeValue: { fontSize: 22, fontWeight: "800" },
  gaugeTrack: {
    height: 14,
    backgroundColor: "#E2E8F0",
    borderRadius: 7,
    overflow: "hidden",
  },
  gaugeBar: { height: 14, borderRadius: 7 },
  gaugeHints: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  gaugeHint: { fontSize: 10, color: "#94A3B8" },

  triRow: { flexDirection: "row" },
  triItem: { flex: 1, alignItems: "center" },
  triMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#F1F5F9",
  },
  triVal: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  triLab: { fontSize: 11, fontWeight: "600", marginTop: 2 },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  kpiCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderLeftWidth: 4,
    width: (SCREEN_WIDTH - 48) / 2,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  kpiText: { flex: 1 },
  kpiValue: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  kpiLabel: { fontSize: 10, color: "#64748B", marginTop: 1 },
  kpiSub: { fontSize: 10, fontWeight: "600", marginTop: 2 },

  chartArea: {},
  chartLegend: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 12, color: "#64748B" },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: CHART_HEIGHT + 20,
  },
  barGroup: { alignItems: "center" },
  barsInner: { justifyContent: "flex-end" },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barLabel: { fontSize: 9, color: "#94A3B8", marginTop: 4, textAlign: "center" },

  catRow: { marginBottom: 10 },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  catLabel: { fontSize: 12, color: "#475569", fontWeight: "500" },
  catAmount: { fontSize: 12, color: "#1E293B", fontWeight: "700" },
  catTrack: {
    height: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
    overflow: "hidden",
  },
  catBar: { height: 8, borderRadius: 4 },

  tableHeader: {
    flexDirection: "row",
    paddingBottom: 6,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderColor: "#F1F5F9",
  },
  th: { flex: 1, fontSize: 11, fontWeight: "700", color: "#94A3B8" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#F8FAFC",
  },
  td: { flex: 1, fontSize: 12, color: "#475569" },

  travauxItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#F8FAFC",
  },
  prioTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 2,
  },
  prioText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  travauxTitle: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  travauxMeta: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  travauxStatus: { fontSize: 11, color: "#64748B" },
  travauxAmt: { fontSize: 11, color: "#64748B" },

  contratItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#F8FAFC",
  },
  contratLeft: { flexDirection: "row", gap: 10, flex: 1 },
  contratIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  contratName: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  contratTitle: { fontSize: 11, color: "#64748B", marginTop: 1 },
  contratType: { fontSize: 10, color: "#94A3B8", textTransform: "capitalize" },
  contratRight: { alignItems: "flex-end" },
  contratAmt: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  contratAnnual: { fontSize: 11, color: "#64748B", marginTop: 1 },
  contratEnd: { fontSize: 10, color: "#94A3B8", marginTop: 2 },
});
