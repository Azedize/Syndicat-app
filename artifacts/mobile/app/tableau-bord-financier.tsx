import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { apiRequest } from "@/lib/api";
import RoleGuard from "@/components/RoleGuard";
import { LangCode, useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { crossPlatformShadow } from "@/lib/shadow";
import { ErrorState, LoadingState } from "@/components/DataState";

type Colors = ReturnType<typeof useColors>;

// Dynamic screen width is resolved via useWindowDimensions inside components.
// A fallback constant is kept only for static bar-chart sizing.
const CHART_HEIGHT = 140;

// ─── Translations ─────────────────────────────────────────────────────────────
const STRINGS = {
  review: { fr: "Examiner", en: "Review", ar: "مراجعة", es: "Revisar" },
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
  dashboardUnavailable: {
    fr: "Le tableau de bord financier n'est pas disponible. Vérifiez votre connexion puis réessayez.",
    en: "The financial dashboard is unavailable. Check your connection and try again.",
    ar: "لوحة القيادة المالية غير متاحة. تحقق من اتصالك وحاول مجدداً.",
    es: "El panel financiero no está disponible. Compruebe su conexión e inténtelo de nuevo.",
  },
  dashboardUnavailableTitle: {
    fr: "Données financières indisponibles",
    en: "Financial data unavailable",
    ar: "البيانات المالية غير متاحة",
    es: "Datos financieros no disponibles",
  },
  retry: {
    fr: "Réessayer",
    en: "Retry",
    ar: "إعادة المحاولة",
    es: "Reintentar",
  },
  noBuildingsTitle: {
    fr: "Aucun immeuble disponible",
    en: "No buildings available",
    ar: "لا توجد مبانٍ متاحة",
    es: "No hay edificios disponibles",
  },
  noBuildingsDescription: {
    fr: "Aucun immeuble financier n'est accessible pour votre rôle.",
    en: "No financial building is accessible for your role.",
    ar: "لا يوجد مبنى مالي متاح لدورك.",
    es: "No hay ningún edificio financiero accesible para su rol.",
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
  paid: {
    fr: "Payé",
    en: "Paid",
    ar: "مدفوع",
    es: "Pagado",
  },
  rate: {
    fr: "Taux",
    en: "Rate",
    ar: "المعدل",
    es: "Tasa",
  },
  quarterTracking: {
    fr: "Suivi par trimestre",
    en: "Quarterly tracking",
    ar: "المتابعة الفصلية",
    es: "Seguimiento trimestral",
  },
  period: {
    fr: "Période",
    en: "Period",
    ar: "الفترة",
    es: "Período",
  },
  consumption: {
    fr: "Consommation",
    en: "Usage",
    ar: "الاستهلاك",
    es: "Consumo",
  },
  spent: {
    fr: "Dépensé",
    en: "Spent",
    ar: "المنفق",
    es: "Gastado",
  },
  estimatedBudget: {
    fr: "Budget estimé",
    en: "Estimated budget",
    ar: "الميزانية المقدرة",
    es: "Presupuesto estimado",
  },
  activeProviders: {
    fr: "Prestataires actifs",
    en: "Active providers",
    ar: "المزودون النشطون",
    es: "Proveedores activos",
  },
  contractCharges: {
    fr: "Charges contrats",
    en: "Contract charges",
    ar: "تكاليف العقود",
    es: "Cargos de contratos",
  },
  perYear: {
    fr: "par an",
    en: "per year",
    ar: "سنوياً",
    es: "al año",
  },
  perMonth: {
    fr: "/mois",
    en: "/month",
    ar: "شهرياً/",
    es: "/mes",
  },
  worksInProgressTitle: {
    fr: "Travaux en cours",
    en: "Works in progress",
    ar: "الأشغال قيد التنفيذ",
    es: "Obras en curso",
  },
  worksBudgetTitle: {
    fr: "Budget travaux",
    en: "Works budget",
    ar: "ميزانية الأشغال",
    es: "Presupuesto de obras",
  },
  activeContractsTitle: {
    fr: "Contrats actifs",
    en: "Active contracts",
    ar: "العقود النشطة",
    es: "Contratos activos",
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

/**
 * Format a monetary value with the active app language and the MAD currency.
 * The fallback keeps the amount readable on runtimes with limited Intl support.
 */
function getLocale(lang: LangCode): string {
  return lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-FR";
}

function fmtMAD(n: number, lang: LangCode): string {
  if (!Number.isFinite(n) || isNaN(n)) return "0 MAD";
  try {
    return new Intl.NumberFormat(getLocale(lang), {
      style: "currency",
      currency: "MAD",
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  } catch {
    // Absolute fallback — manual thousands grouping
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " MAD";
  }
}

function formatDate(value: string, lang: LangCode): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(getLocale(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function kpiFmtMAD(n: number, lang: LangCode): string {
  return fmtMAD(n, lang);
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

const getCategoryLabel = (cat: string, lang: LangCode) => {
  return CATEGORY_STRINGS[cat]?.[lang] || CATEGORY_LABELS[cat] || cat;
};

const getStatusLabel = (status: string, lang: LangCode) => {
  switch (status) {
    case "planned": return STRINGS.statusPlanned[lang];
    case "scheduled": return STRINGS.statusScheduled[lang];
    case "in_progress": return STRINGS.statusInProgress[lang];
    case "completed": return STRINGS.statusCompleted[lang];
    default: return status;
  }
};

const getPriorityLabel = (prio: string, lang: LangCode) => {
  switch (prio) {
    case "urgent": return STRINGS.priorityUrgent[lang];
    case "high": return STRINGS.priorityHigh[lang];
    case "normal": return STRINGS.priorityNormal[lang];
    case "low": return STRINGS.priorityLow[lang];
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

/**
 * Enterprise KPI card — Revolut / Stripe / SAP Mobile quality.
 *
 * Layout (vertical, centered):
 *   ┌──────────────────────┐
 *   │  ╔═══════╗            │  ← accent top border
 *   │  ║  icon ║            │
 *   │  ╚═══════╝            │
 *   │   25 000 MAD          │  ← large value, centered, auto-shrink
 *   │   Budget annuel       │  ← label, centered, 2-line max
 *   │  ┌──────────────┐     │  ← optional sub-badge
 *   │  │ /15k prévu   │     │
 *   │  └──────────────┘     │
 *   └──────────────────────┘
 *
 * Responsive: cardWidth prop is computed from useWindowDimensions so the
 * layout is correct on 320 px, 360 px, 390 px, and tablets.
 */
function KpiCard({
  label,
  value,
  sub,
  color,
  icon,
  cardWidth,
  styles,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
  cardWidth: number;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.kpiCard, { width: cardWidth, borderTopColor: color }]}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      {/* Value — largest text, auto-scales to prevent overflow */}
      <Text
        style={styles.kpiValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {value}
      </Text>
      {/* Label — up to 2 lines so long labels never clip */}
      <Text style={styles.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
      {/* Optional sub-info pill */}
      {sub ? (
        <View style={[styles.kpiSubBadge, { backgroundColor: color + "18" }]}>
          <Text style={[styles.kpiSub, { color }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function RecoveryGauge({
  rate,
  colors,
  styles,
}: {
  rate: number;
  colors: Colors;
  styles: ReturnType<typeof createStyles>;
}) {
  const { lang } = useLanguage();
  const color =
    rate >= 80 ? colors.success : rate >= 60 ? colors.warning : colors.destructive;
  // Gauge bar fills a percentage of the available card inner width
  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeRow}>
        <Text style={styles.gaugeLabel}>{STRINGS.recuperationRate[lang]}</Text>
        <Text style={[styles.gaugeValue, { color }]}>{rate}%</Text>
      </View>
      <View style={styles.gaugeTrack}>
        {/* Use percentage-based width so the bar is fully responsive */}
        <View
          style={[
            styles.gaugeBar,
            { width: `${Math.max(0, Math.min(rate, 100))}%` as any, backgroundColor: color },
          ]}
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

function BarChart({
  data,
  colors,
  styles,
}: {
  data: MonthBar[];
  colors: Colors;
  styles: ReturnType<typeof createStyles>;
}) {
  const { lang } = useLanguage();
  const { width: windowW } = useWindowDimensions();
  // Chart width = screen - horizontal card padding (16 outer + 16 padding each side)
  const chartInnerW = windowW - 64;
  const maxVal = Math.max(...data.map((d) => Math.max(d.due, d.paid)), 1);
  const barW = Math.max(4, Math.floor(chartInnerW / Math.max(data.length, 1) - 8));
  return (
    <View style={styles.chartArea}>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
          <Text style={styles.legendLabel}>{STRINGS.called[lang]}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
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
                      backgroundColor: colors.border,
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
                      backgroundColor: colors.success,
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
  styles,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const { lang } = useLanguage();
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <View style={styles.catRow}>
      <View style={styles.catHeader}>
        <Text style={styles.catLabel}>{label}</Text>
        <Text style={styles.catAmount}>{fmtMAD(amount, lang)}</Text>
      </View>
      <View style={styles.catTrack}>
        {/* Percentage-based bar — fully responsive on all screen widths */}
        <View style={[styles.catBar, { width: `${Math.max(pct, 1)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const CAT_COLORS = [
  "#3B82F6","#10B981","#F59E0B","#8B5CF6","#EF4444",
  "#06B6D4","#84CC16","#F97316","#EC4899","#1F5EFF",
];

function PendingActionsPanel({
  items,
  onReview,
  colors,
  styles,
}: {
  items: PendingItem[];
  onReview: (item: PendingItem) => void;
  colors: Colors;
  styles: ReturnType<typeof createStyles>;
}) {
  const { lang } = useLanguage();
  if (items.length === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.pendingHeaderRow}>
        <Ionicons name="alert-circle" size={18} color={colors.warning} />
        <Text style={styles.cardTitle}>{STRINGS.actionRequired[lang]} ({items.length})</Text>
      </View>
      {items.map((item) => {
        const isValidation = item.status === "pending_validation";
        return (
          <View key={item.id} style={styles.pendingRow}>
            <View style={styles.pendingInfo}>
              <Text style={styles.pendingName}>{item.memberName}</Text>
              <Text style={styles.pendingLabel}>
                {item.label} · {fmtMAD(item.amount, lang)}
              </Text>
              <View
                style={[
                  styles.pendingBadge,
                  {
                    backgroundColor: isValidation ? colors.warning + "22" : colors.destructive + "22",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pendingBadgeText,
                    { color: isValidation ? colors.warning : colors.destructive },
                  ]}
                >
                  {isValidation ? STRINGS.proofToValidate[lang] : STRINGS.overdue[lang]}
                </Text>
              </View>
            </View>
            {/* A payment is validated only after the proof has been looked at:
                open it in the charges screen (proof viewer, reason on reject). */}
            <View style={styles.pendingActions}>
              <TouchableOpacity
                onPress={() => onReview(item)}
                style={[styles.pendingBtn, { backgroundColor: isValidation ? colors.warning + "22" : colors.destructive + "22" }]}
                accessibilityLabel={STRINGS.review[lang]}
              >
                <Ionicons name="chevron-forward" size={16} color={isValidation ? colors.warning : colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
// FIX [R2]: treasurer is the primary financial operator — they MUST access this
// dashboard. Previously only super_admin and syndicate_admin were allowed,
// breaking the entire debt-recovery workflow for treasurers.
export default function TableauBordFinancier() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "treasurer"]}>
      <TableauBordFinancierInner />
    </RoleGuard>
  );
}

function TableauBordFinancierInner() {
  const router = useRouter();
  const { lang } = useLanguage();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Responsive KPI card width — recalculated on every orientation/resize event.
  // Formula: (screenWidth - 32px margins - 10px gap) / 2 columns
  const { width: windowWidth } = useWindowDimensions();
  const kpiCardWidth = Math.floor((windowWidth - 42) / 2);
  const [buildings, setBuildings] = useState<BuildingQuick[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"finance" | "travaux" | "prestataires">("finance");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

  const loadBuildings = useCallback(async () => {
    try {
      const res = await apiRequest<{ data: BuildingQuick[] }>("/finance/buildings");
      setBuildings(res.data);
      if (!selectedId && res.data.length > 0) setSelectedId(res.data[0].id);
    } catch (e: any) {
      setError(STRINGS.dashboardUnavailable[lang]);
      throw e;
    }
  }, [selectedId, lang]);

  const loadDashboard = useCallback(async (id: string) => {
    setError(null);
    setDashboardLoading(true);
    try {
      const res = await apiRequest<{ data: DashboardData }>(`/finance/building/${id}`);
      setData(res.data);
    } catch (e: any) {
      setError(STRINGS.dashboardUnavailable[lang]);
    } finally {
      setDashboardLoading(false);
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
      } catch {
        setError(STRINGS.dashboardUnavailable[lang]);
      } finally {
        setLoading(false);
      }
    })();
  }, [lang, loadBuildings, loadPending]);

  useEffect(() => {
    if (selectedId) loadDashboard(selectedId);
  }, [selectedId, loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadBuildings(), loadPending()]);
      if (selectedId) await loadDashboard(selectedId);
    } catch {
      setError(STRINGS.dashboardUnavailable[lang]);
    } finally {
      setRefreshing(false);
    }
  }, [selectedId, lang, loadBuildings, loadDashboard, loadPending]);

  const handleReview = useCallback(
    (item: PendingItem) => {
      router.push({
        pathname: "/charges",
        params: { filter: item.status === "pending_validation" ? "pending_validation" : "overdue" },
      } as any);
    },
    [router],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <LoadingState
          title={STRINGS.loading[lang]}
          description={STRINGS.dashboardUnavailable[lang]}
          accentColor={colors.primary}
        />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.centered}>
        <ErrorState
          title={STRINGS.dashboardUnavailableTitle[lang]}
          description={error}
          retryLabel={STRINGS.retry[lang]}
          onRetry={() => {
            setLoading(true);
            void Promise.all([loadBuildings(), loadPending()])
              .then(() => {
                if (selectedId) return loadDashboard(selectedId);
              })
              .catch(() => setError(STRINGS.dashboardUnavailable[lang]))
              .finally(() => setLoading(false));
          }}
          accentColor={colors.primary}
        />
      </View>
    );
  }

  if (!data && buildings.length === 0) {
    return (
      <View style={styles.centered}>
        <ErrorState
          title={STRINGS.noBuildingsTitle[lang]}
          description={STRINGS.noBuildingsDescription[lang]}
          retryLabel={STRINGS.retry[lang]}
          onRetry={() => {
            setLoading(true);
            void loadBuildings()
              .catch(() => setError(STRINGS.dashboardUnavailable[lang]))
              .finally(() => setLoading(false));
          }}
          accentColor={colors.primary}
        />
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
          <Ionicons name="arrow-back" size={22} color={colors.primaryForeground} />
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
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
                ? colors.success
                : b.tauxRecouvrement >= 60
                ? colors.warning
                : colors.destructive;
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => setSelectedId(b.id)}
                style={[styles.buildingChip, active && styles.buildingChipActive]}
              >
                <Text style={[styles.chipName, active && { color: colors.primaryForeground }]}>
                  {b.name}
                </Text>
                <Text style={[styles.chipCity, active && { color: colors.primaryForeground + "CC" }]}>
                  {b.city}
                </Text>
                <View style={styles.chipRate}>
                  <View
                    style={[
                      styles.chipRateDot,
                      { backgroundColor: active ? colors.primaryForeground : rateColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.chipRateText,
                      { color: active ? colors.primaryForeground : rateColor },
                    ]}
                  >
                    {b.tauxRecouvrement}% {STRINGS.recoveryAbbr[lang]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.destructive} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!data && !error && (
          <View style={styles.inlineLoading}>
            {dashboardLoading ? (
              <LoadingState
                title={STRINGS.loading[lang]}
                description={STRINGS.dashboardUnavailable[lang]}
                accentColor={colors.primary}
              />
            ) : (
              <ActivityIndicator color={colors.primary} />
            )}
          </View>
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
                      ? STRINGS.finances[lang]
                      : s === "travaux"
                      ? STRINGS.travaux[lang]
                      : STRINGS.prestataires[lang]}
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
                  colors={colors}
                  styles={styles}
                />

                {/* Recouvrement gauge */}
                <View style={styles.card}>
                  <RecoveryGauge rate={summary.tauxRecouvrement} colors={colors} styles={styles} />
                  <View style={styles.divider} />
                  <View style={styles.triRow}>
                    <View style={styles.triItem}>
                      <Text style={styles.triVal}>
                        {fmtMAD(summary.totalEncaisse, lang)}
                      </Text>
                      <Text style={[styles.triLab, { color: colors.success }]}>
                        {STRINGS.collected[lang]}
                      </Text>
                    </View>
                    <View style={[styles.triItem, styles.triMid]}>
                      <Text style={styles.triVal}>
                        {fmtMAD(summary.totalImpaye, lang)}
                      </Text>
                      <Text style={[styles.triLab, { color: colors.destructive }]}>
                        {STRINGS.unpaid[lang]}
                      </Text>
                    </View>
                    <View style={styles.triItem}>
                      <Text style={styles.triVal}>
                        {fmtMAD(summary.totalEnAttente, lang)}
                      </Text>
                      <Text style={[styles.triLab, { color: colors.warning }]}>
                        {STRINGS.pending[lang]}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* KPI cards — 2×2 responsive grid */}
                <View style={styles.kpiGrid}>
                  <KpiCard
                    label={STRINGS.annualBudget[lang]}
                    value={kpiFmtMAD(summary.budgetAnnuel, lang)}
                    color={colors.info}
                    icon="wallet-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                  <KpiCard
                    label={STRINGS.reserveFund[lang]}
                    value={kpiFmtMAD(summary.fondsReserveCollecte, lang)}
                    sub={`/ ${fmtMAD(summary.fondsReserveBudget, lang)} ${STRINGS.planned[lang]}`}
                    color={colors.tint}
                    icon="shield-checkmark-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                  <KpiCard
                    label={STRINGS.occupiedLots[lang]}
                    value={`${data.lots.occupes} / ${data.lots.total}`}
                    sub={`${data.lots.tauxOccupation}% ${STRINGS.occupationRate[lang]}`}
                    color={colors.success}
                    icon="home-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                  <KpiCard
                    label={STRINGS.callsForFunds[lang]}
                    value={String(data.appelsDeFonds.total)}
                    sub={`${data.appelsDeFonds.paid} ${STRINGS.paidCount[lang]} · ${data.appelsDeFonds.overdue} ${STRINGS.unpaidCount[lang]}`}
                    color={colors.warning}
                    icon="cash-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                </View>

                {/* Monthly bar chart */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{STRINGS.paymentHistory[lang]}</Text>
                  <BarChart data={data.monthlyHistory} colors={colors} styles={styles} />
                </View>

                {/* Budget by category */}
                {budgetCats.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                      {STRINGS.budgetDistribution[lang]} {new Date().getFullYear()}
                    </Text>
                    <Text style={styles.cardSub}>
                      {STRINGS.totalBudget[lang]} : {fmtMAD(budgetTotal, lang)}
                    </Text>
                    {budgetCats
                      .sort(([, a], [, b]) => b - a)
                      .map(([cat, amt], i) => (
                        <CategoryRow
                          key={cat}
                          label={getCategoryLabel(cat, lang)}
                          amount={amt}
                          total={budgetTotal}
                          color={CAT_COLORS[i % CAT_COLORS.length]}
                          styles={styles}
                        />
                      ))}
                  </View>
                )}

                {/* Periods table */}
                {data.periodStats.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>{STRINGS.quarterTracking[lang]}</Text>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.th, { flex: 2 }]}>{STRINGS.period[lang]}</Text>
                      <Text style={styles.th}>{STRINGS.paid[lang]}</Text>
                      <Text style={styles.th}>{STRINGS.unpaid[lang]}</Text>
                      <Text style={[styles.th, { color: colors.info }]}>{STRINGS.rate[lang]}</Text>
                    </View>
                    {data.periodStats.map((ps) => {
                      const rColor =
                        ps.rate >= 80
                          ? colors.success
                          : ps.rate >= 60
                          ? colors.warning
                          : colors.destructive;
                      return (
                        <View key={ps.period} style={styles.tableRow}>
                          <Text style={[styles.td, { flex: 2, fontWeight: "600" }]}>
                            {ps.period}
                          </Text>
                          <Text style={[styles.td, { color: colors.success }]}>
                            {fmtMAD(ps.paid, lang)}
                          </Text>
                          <Text style={[styles.td, { color: colors.destructive }]}>
                            {fmtMAD(ps.overdue, lang)}
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
                    label={STRINGS.worksInProgress[lang]}
                    value={String(data.travaux.enCours)}
                    color={colors.warning}
                    icon="construct-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                  <KpiCard
                    label={STRINGS.statusCompleted[lang]}
                    value={String(data.travaux.termines)}
                    color={colors.success}
                    icon="checkmark-circle-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                  <KpiCard
                    label={STRINGS.worksUrgent[lang]}
                    value={String(data.travaux.urgents)}
                    color={colors.destructive}
                    icon="warning-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                  <KpiCard
                    label={STRINGS.estimatedBudget[lang]}
                    value={kpiFmtMAD(data.travaux.budgetEstime, lang)}
                    sub={`${STRINGS.spent[lang]} : ${fmtMAD(data.travaux.depenseReelle, lang)}`}
                    color={colors.tint}
                    icon="bar-chart-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                </View>

                {data.travaux.items.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>{STRINGS.worksInProgressTitle[lang]}</Text>
                    {data.travaux.items.map((t) => (
                      <View key={t.id} style={styles.travauxItem}>
                        <View
                          style={[
                            styles.prioTag,
                            {
                              backgroundColor:
                                (PRIORITY_COLOR[t.priority] ?? colors.mutedForeground) + "20",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.prioText,
                              {
                                color:
                                  PRIORITY_COLOR[t.priority] ?? colors.mutedForeground,
                              },
                            ]}
                          >
                            {getPriorityLabel(t.priority, lang)}
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
                                    STATUS_COLOR[t.status] ?? colors.mutedForeground,
                                },
                              ]}
                            />
                            <Text style={styles.travauxStatus}>
                              {getStatusLabel(t.status, lang)}
                            </Text>
                            {t.estimatedAmount && (
                              <Text style={styles.travauxAmt}>
                                {" · "}
                                {fmtMAD(t.estimatedAmount, lang)}
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
                    <Text style={styles.cardTitle}>{STRINGS.worksBudgetTitle[lang]}</Text>
                    <View style={styles.gaugeRow}>
                      <Text style={styles.gaugeLabel}>{STRINGS.consumption[lang]}</Text>
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
                            // Percentage-based so this bar adapts to all screen sizes
                            width: `${Math.round(Math.min((data.travaux.depenseReelle / data.travaux.budgetEstime) * 100, 100))}%` as any,
                            backgroundColor: colors.warning,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.gaugeHints}>
                      <Text style={styles.gaugeHint}>
                        {STRINGS.spent[lang]} : {fmtMAD(data.travaux.depenseReelle, lang)}
                      </Text>
                      <Text style={styles.gaugeHint}>
                        {STRINGS.estimatedBudget[lang]} : {fmtMAD(data.travaux.budgetEstime, lang)}
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
                    label={STRINGS.activeProviders[lang]}
                    value={String(data.prestataires.actifs)}
                    color={colors.info}
                    icon="people-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                  <KpiCard
                    label={STRINGS.contractCharges[lang]}
                    value={kpiFmtMAD(data.prestataires.chargesContrats, lang)}
                    sub={STRINGS.perYear[lang]}
                    color={colors.warning}
                    icon="receipt-outline"
                    cardWidth={kpiCardWidth}
                    styles={styles}
                  />
                </View>

                {data.prestataires.contrats.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>{STRINGS.activeContractsTitle[lang]}</Text>
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
                              {fmtMAD(c.monthlyAmount, lang)} / {STRINGS.perMonth[lang]}
                            </Text>
                          ) : null}
                          {c.annualAmount ? (
                            <Text style={styles.contratAnnual}>
                              {fmtMAD(c.annualAmount, lang)} / {STRINGS.annual[lang]}
                            </Text>
                          ) : null}
                          {c.endDate ? (
                            <Text style={styles.contratEnd}>
                              {STRINGS.endsOn[lang]} : {formatDate(c.endDate, lang)}
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
// Built from the app's shared theme (useColors) so this screen follows the
// same light/dark palette and brand color as the rest of the app, instead of
// a hardcoded navy/blue palette of its own.
function createStyles(colors: Colors) {
  return StyleSheet.create({
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
      borderTopColor: colors.border,
    },
    pendingInfo: { flex: 1, gap: 4 },
    pendingName: { fontSize: 14, fontWeight: "700", color: colors.text },
    pendingLabel: { fontSize: 12, color: colors.mutedForeground },
    pendingBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      marginTop: 2,
    },
    pendingBadgeText: { fontSize: 11, fontWeight: "600" },
    pendingActions: { flexDirection: "row", gap: 8, marginStart: 8 },
    pendingBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },

    root: { flex: 1, backgroundColor: colors.background },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.background,
    },
    inlineLoading: {
      minHeight: 180,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16,
    },
    loadingText: { color: colors.mutedForeground, fontSize: 14 },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.primary,
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
    headerTitle: { color: colors.primaryForeground, fontSize: 17, fontWeight: "700" },
    headerSub: { color: colors.primaryForeground + "CC", fontSize: 12, marginTop: 2 },

    scroll: { paddingBottom: 24 },

    selectorRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 10,
    },
    buildingChip: {
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginEnd: 8,
      minWidth: 140,
      ...crossPlatformShadow({ color: "#000", offsetY: 0, opacity: 0.06, radius: 4, elevation: 2 }),
    },
    buildingChipActive: { backgroundColor: colors.primary },
    chipName: { fontSize: 13, fontWeight: "700", color: colors.text },
    chipCity: { fontSize: 11, color: colors.mutedForeground, marginTop: 2 },
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
      backgroundColor: colors.destructive + "15",
      borderRadius: 10,
      borderLeftWidth: 3,
      borderLeftColor: colors.destructive,
    },
    errorText: { color: colors.destructive, fontSize: 13, flex: 1 },

    tabs: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.muted,
      borderRadius: 10,
      padding: 3,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: 8,
    },
    tabActive: { backgroundColor: colors.card, ...crossPlatformShadow({ color: "#000", offsetY: 0, opacity: 0.08, radius: 3, elevation: 2 }) },
    tabText: { fontSize: 13, color: colors.mutedForeground, fontWeight: "500" },
    tabTextActive: { color: colors.primary, fontWeight: "700" },

    card: {
      backgroundColor: colors.card,
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: colors.radius,
      padding: 16,
      ...crossPlatformShadow({ color: "#000", offsetY: 0, opacity: 0.05, radius: 6, elevation: 2 }),
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    cardSub: { fontSize: 12, color: colors.mutedForeground, marginBottom: 12 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },

    gaugeWrap: {},
    gaugeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    gaugeLabel: { fontSize: 14, color: colors.mutedForeground, fontWeight: "500" },
    gaugeValue: { fontSize: 22, fontWeight: "800", color: colors.text },
    gaugeTrack: {
      height: 14,
      backgroundColor: colors.muted,
      borderRadius: 7,
      overflow: "hidden",
    },
    gaugeBar: { height: 14, borderRadius: 7 },
    gaugeHints: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    gaugeHint: { fontSize: 10, color: colors.mutedForeground },

    triRow: { flexDirection: "row" },
    triItem: { flex: 1, alignItems: "center" },
    triMid: {
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    triVal: { fontSize: 18, fontWeight: "800", color: colors.text },
    triLab: { fontSize: 11, fontWeight: "600", marginTop: 2 },

    kpiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: 16,
      gap: 10,
      marginBottom: 12,
    },
    // ── Enterprise KPI card — vertical, centered, Revolut/Stripe quality ──
    kpiCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      // Vertical layout: icon → value → label → optional sub-badge
      alignItems: "center",
      // Top accent bar instead of left border — no left-border width subtraction needed
      borderTopWidth: 3,
      ...crossPlatformShadow({ color: "#000", offsetY: 0, opacity: 0.06, radius: 8, elevation: 2 }),
      gap: 4,
      overflow: "hidden",
    },
    kpiIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 6,
    },
    // Value is the hero element — large, bold, centered, auto-scales with adjustsFontSizeToFit
    kpiValue: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      // Critical overflow guards — never let the value clip the card
      minWidth: 0,
      width: "100%" as any,
      letterSpacing: -0.3,
    },
    // Label sits below the value — up to 2 lines, centered
    kpiLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      textAlign: "center",
      fontWeight: "500",
      lineHeight: 15,
      minWidth: 0,
      width: "100%" as any,
    },
    // Sub-info rendered in a pill badge so it never bleeds into surrounding text
    kpiSubBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 20,
      marginTop: 4,
      maxWidth: "100%" as any,
    },
    kpiSub: {
      fontSize: 10,
      fontWeight: "600",
      textAlign: "center",
    },

    chartArea: {},
    chartLegend: {
      flexDirection: "row",
      gap: 16,
      marginBottom: 12,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendLabel: { fontSize: 12, color: colors.mutedForeground },
    bars: {
      flexDirection: "row",
      alignItems: "flex-end",
      height: CHART_HEIGHT + 20,
    },
    barGroup: { alignItems: "center" },
    barsInner: { justifyContent: "flex-end" },
    bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    barLabel: { fontSize: 9, color: colors.mutedForeground, marginTop: 4, textAlign: "center" },

    catRow: { marginBottom: 10 },
    catHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    catLabel: { fontSize: 12, color: colors.mutedForeground, fontWeight: "500" },
    catAmount: { fontSize: 12, color: colors.text, fontWeight: "700" },
    catTrack: {
      height: 8,
      backgroundColor: colors.muted,
      borderRadius: 4,
      overflow: "hidden",
    },
    catBar: { height: 8, borderRadius: 4 },

    tableHeader: {
      flexDirection: "row",
      paddingBottom: 6,
      marginBottom: 4,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    th: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.mutedForeground },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    td: { flex: 1, fontSize: 12, color: colors.text },

    travauxItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    prioTag: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 3,
      marginTop: 2,
    },
    prioText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
    travauxTitle: { fontSize: 13, fontWeight: "600", color: colors.text },
    travauxMeta: { flexDirection: "row", alignItems: "center", marginTop: 3 },
    statusDot: { width: 7, height: 7, borderRadius: 4, marginEnd: 5 },
    travauxStatus: { fontSize: 11, color: colors.mutedForeground },
    travauxAmt: { fontSize: 11, color: colors.mutedForeground },

    contratItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    contratLeft: { flexDirection: "row", gap: 10, flex: 1 },
    contratIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    contratName: { fontSize: 13, fontWeight: "700", color: colors.text },
    contratTitle: { fontSize: 11, color: colors.mutedForeground, marginTop: 1 },
    contratType: { fontSize: 10, color: colors.mutedForeground, textTransform: "capitalize" },
    contratRight: { alignItems: "flex-end" },
    contratAmt: { fontSize: 13, fontWeight: "700", color: colors.text },
    contratAnnual: { fontSize: 11, color: colors.mutedForeground, marginTop: 1 },
    contratEnd: { fontSize: 10, color: colors.mutedForeground, marginTop: 2 },
  });
}
