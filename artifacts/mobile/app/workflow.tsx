import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

const STRINGS = {
  statusPending: { fr: "En attente", en: "Pending", ar: "في الانتظار", es: "Pendiente" },
  statusInProgress: { fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  statusApproved: { fr: "Approuvé", en: "Approved", ar: "تمت الموافقة", es: "Aprobado" },
  statusRejected: { fr: "Rejeté", en: "Rejected", ar: "مرفوض", es: "Rechazado" },
  statusCancelled: { fr: "Annulé", en: "Cancelled", ar: "ملغى", es: "Cancelado" },
  priorityLow: { fr: "Faible", en: "Low", ar: "منخفضة", es: "Baja" },
  priorityMedium: { fr: "Moyenne", en: "Medium", ar: "متوسطة", es: "Media" },
  priorityHigh: { fr: "Haute", en: "High", ar: "عالية", es: "Alta" },
  priorityUrgent: { fr: "Urgent", en: "Urgent", ar: "عاجل", es: "Urgente" },
  catStatuts: { fr: "Statuts", en: "Bylaws", ar: "القوانين الأساسية", es: "Estatutos" },
  catReglement: { fr: "Règlement Intérieur", en: "Internal Rules", ar: "النظام الداخلي", es: "Reglamento Interno" },
  catFinance: { fr: "Finance", en: "Finance", ar: "المالية", es: "Finanzas" },
  catJuridique: { fr: "Juridique", en: "Legal", ar: "قانوني", es: "Legal" },
  catElection: { fr: "Election", en: "Election", ar: "انتخابات", es: "Elección" },
  catPublication: { fr: "Publication", en: "Publication", ar: "نشر", es: "Publicación" },
  catGouvernance: { fr: "Gouvernance", en: "Governance", ar: "الحكامة", es: "Gobernanza" },
  stepApproveTitle: { fr: "Étape approuvée", en: "Step approved", ar: "تمت الموافقة على المرحلة", es: "Etapa aprobada" },
  stepApproveMsg: { fr: "L'étape a été validée. La prochaine étape a été notifiée.", en: "The step has been validated. The next step has been notified.", ar: "تم التحقق من المرحلة. تم إخطار المرحلة التالية.", es: "La etapa ha sido validada. La siguiente etapa ha sido notificada." },
  stepRejectTitle: { fr: "Étape rejetée", en: "Step rejected", ar: "تم رفض المرحلة", es: "Etapa rechazada" },
  stepRejectMsg: { fr: "L'étape a été rejetée. L'initiateur sera informé.", en: "The step has been rejected. The initiator will be informed.", ar: "تم رفض المرحلة. سيتم إخطار المبادر.", es: "La etapa ha sido rechazada. El iniciador será informado." },
  titleRequired: { fr: "Titre requis", en: "Title required", ar: "العنوان مطلوب", es: "Título requerido" },
  wfCreated: { fr: "Workflow créé", en: "Workflow created", ar: "تم إنشاء سير العمل", es: "Workflow creado" },
  wfCreatedMsg: { fr: "Le workflow a été initié et les responsables ont été notifiés.", en: "The workflow has been initiated and those responsible have been notified.", ar: "تم بدء سير العمل وتم إخطار المسؤولين.", es: "Se ha iniciado el flujo de trabajo y se ha notificado a los responsables." },
  headerTitle: { fr: "Workflows d'Approbation", en: "Approval Workflows", ar: "سير عمل الموافقات", es: "Flujos de Trabajo de Aprobación" },
  headerSub: { fr: "Gestion des processus multi-niveaux", en: "Multi-level process management", ar: "إدارة العمليات متعددة المستويات", es: "Gestión de procesos multinivel" },
  statTotal: { fr: "Total", en: "Total", ar: "المجموع", es: "Total" },
  statInProgress: { fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  statRequired: { fr: "Approbation requise", en: "Approval required", ar: "موافقة مطلوبة", es: "Aprobación requerida" },
  statApproved: { fr: "Approuvés", en: "Approved", ar: "المقبولة", es: "Aprobados" },
  tabAll: { fr: "Tous", en: "All", ar: "الكل", es: "Todos" },
  tabInProgress: { fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  tabPending: { fr: "En attente", en: "Pending", ar: "في الانتظار", es: "Pendiente" },
  tabApproved: { fr: "Approuvés", en: "Approved", ar: "المقبولة", es: "Aprobados" },
  tabRejected: { fr: "Rejetés", en: "Rejected", ar: "المرفوضة", es: "Rechazados" },
  emptyMsg: { fr: "Aucun workflow trouvé", en: "No workflow found", ar: "لم يتم العثور على سير عمل", es: "No se encontró ningún flujo de trabajo" },
  daysLeft: { fr: "j restants", en: "days left", ar: "أيام متبقية", es: "días restantes" },
  overdue: { fr: "Délai dépassé", en: "Overdue", ar: "تجاوز المهلة", es: "Plazo vencido" },
  stepPrefix: { fr: "Étape", en: "Step", ar: "المرحلة", es: "Etapa" },
  waitingOn: { fr: "En attente:", en: "Waiting for:", ar: "في انتظار:", es: "Esperando a:" },
  workflowSteps: { fr: "Étapes du workflow", en: "Workflow steps", ar: "خطوات سير العمل", es: "Pasos del flujo de trabajo" },
  openDoc: { fr: "Ouverture du document", en: "Opening document", ar: "فتح الوثيقة", es: "Abriendo documento" },
  actionRequired: { fr: "Action requise", en: "Action required", ar: "إجراء مطلوب", es: "Acción requerida" },
  waitingForValidation: { fr: "En attente de validation par:", en: "Waiting for validation by:", ar: "في انتظار التحقق من قبل:", es: "Esperando validación por:" },
  approve: { fr: "Approuver", en: "Approve", ar: "موافقة", es: "Aprobar" },
  reject: { fr: "Rejeter", en: "Reject", ar: "رفض", es: "Rechazar" },
  approveStep: { fr: "✓ Approuver l'étape", en: "✓ Approve step", ar: "✓ الموافقة على المرحلة", es: "✓ Aprobar etapa" },
  rejectStep: { fr: "✗ Rejeter l'étape", en: "✗ Reject step", ar: "✗ رفض المرحلة", es: "✗ Rechazar etapa" },
  commentOptional: { fr: "Commentaire (optionnel)", en: "Comment (optional)", ar: "تعليق (اختياري)", es: "Comentario (opcional)" },
  commentPlaceholder: { fr: "Ajoutez un commentaire à votre décision...", en: "Add a comment to your decision...", ar: "أضف تعليقاً على قرارك...", es: "Añada un comentario a su decisión..." },
  cancel: { fr: "Annuler", en: "Cancel", ar: "إلغاء", es: "Cancelar" },
  confirm: { fr: "Confirmer", en: "Confirm", ar: "تأكيد", es: "Confirmar" },
  newWorkflow: { fr: "Nouveau Workflow", en: "New Workflow", ar: "سير عمل جديد", es: "Nuevo Flujo de Trabajo" },
  create: { fr: "Créer", en: "Create", ar: "إنشاء", es: "Crear" },
  titleLabel: { fr: "Titre *", en: "Title *", ar: "العنوان *", es: "Título *" },
  titlePlaceholder: { fr: "Ex: Révision du Règlement Intérieur", en: "Ex: Internal Rules Revision", ar: "مثال: مراجعة النظام الداخلي", es: "Ej: Revisión del Reglamento Interno" },
  categoryLabel: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  priorityLabel: { fr: "Priorité", en: "Priority", ar: "الأولوية", es: "Prioridad" },
  descriptionLabel: { fr: "Description", en: "Description", ar: "الوصف", es: "Descripción" },
  descriptionPlaceholder: { fr: "Décrivez l'objet et le contexte de ce workflow...", en: "Describe the purpose and context of this workflow...", ar: "صف الغرض وسياق سير العمل هذا...", es: "Describa el objeto y el contexto de este flujo de trabajo..." },
  initiator: { fr: "Initiateur", en: "Initiator", ar: "المبادر", es: "Iniciador" },
  admin: { fr: "Admin", en: "Admin", ar: "مدير", es: "Admin" },
  direction: { fr: "Direction", en: "Management", ar: "الإدارة", es: "Dirección" },
  initialValidation: { fr: "Validation initiale", en: "Initial validation", ar: "التحقق الأولي", es: "Validación inicial" },
  directionApproval: { fr: "Approbation direction", en: "Management approval", ar: "موافقة الإدارة", es: "Aprobación dirección" },
  publication: { fr: "Publication", en: "Publication", ar: "نشر", es: "Publicación" },
};

type WfStatus = "pending" | "in_progress" | "approved" | "rejected" | "cancelled";
type WfPriority = "low" | "medium" | "high" | "urgent";
type StepStatus = "done" | "current" | "waiting" | "rejected";

interface WorkflowStep {
  id: string;
  title: string;
  assignee: string;
  role: string;
  status: StepStatus;
  comment?: string;
  date?: string;
}

interface Workflow {
  id: string;
  title: string;
  category: string;
  description: string;
  status: WfStatus;
  priority: WfPriority;
  initiatorName: string;
  startDate: string;
  deadline: string;
  steps: WorkflowStep[];
  currentStep: number;
  document?: string;
}

const STATUS_CONFIG: Record<WfStatus, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  pending: { label: "statusPending", color: "#f59e0b", icon: "clock" },
  in_progress: { label: "statusInProgress", color: "#3b82f6", icon: "loader" },
  approved: { label: "statusApproved", color: "#10b981", icon: "check-circle" },
  rejected: { label: "statusRejected", color: "#ef4444", icon: "x-circle" },
  cancelled: { label: "statusCancelled", color: "#6b7280", icon: "slash" },
};

const PRIORITY_CONFIG: Record<WfPriority, { label: string; color: string }> = {
  low: { label: "priorityLow", color: "#6b7280" },
  medium: { label: "priorityMedium", color: "#3b82f6" },
  high: { label: "priorityHigh", color: "#f59e0b" },
  urgent: { label: "priorityUrgent", color: "#ef4444" },
};

const CAT_COLORS: Record<string, string> = {
  statuts: "#2563EB",
  reglement: "#3b82f6",
  finance: "#10b981",
  juridique: "#ef4444",
  election: "#f59e0b",
  publication: "#f97316",
  gouvernance: "#8b5cf6",
};

const CAT_LABEL_KEYS: Record<string, keyof typeof STRINGS> = {
  statuts: "catStatuts",
  reglement: "catReglement",
  finance: "catFinance",
  juridique: "catJuridique",
  election: "catElection",
  publication: "catPublication",
  gouvernance: "catGouvernance",
};

type TabFilter = "all" | WfStatus;

export default function WorkflowScreen() {
  const colors = useColors();
  const { lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { documents } = useData();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>("all");
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [showApprove, setShowApprove] = useState(false);
  const [approveComment, setApproveComment] = useState("");
  const [approveAction, setApproveAction] = useState<"approve" | "reject">("approve");
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCat, setNewCat] = useState("reglement");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<WfPriority>("medium");

  const loadWorkflows = () => {
    setLoading(true);
    setError(null);
    apiRequest<{ data: Workflow[] }>("/workflows")
      .then(({ data }) => setWorkflows(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur de chargement"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadWorkflows(); }, []);

  const filtered = tab === "all" ? workflows : workflows.filter((w) => w.status === tab);

  const counts = {
    all: workflows.length,
    pending: workflows.filter((w) => w.status === "pending").length,
    in_progress: workflows.filter((w) => w.status === "in_progress").length,
    approved: workflows.filter((w) => w.status === "approved").length,
    rejected: workflows.filter((w) => w.status === "rejected").length,
    cancelled: workflows.filter((w) => w.status === "cancelled").length,
  };

  const myPending = workflows.filter((w) => w.status === "in_progress").length;

  const handleApprove = async () => {
    if (!selected || submittingDecision) return;
    const isApprove = approveAction === "approve";
    setSubmittingDecision(true);
    try {
      const { data } = await apiRequest<{ data: Workflow }>(`/workflows/${selected.id}/decision`, "POST", {
        action: approveAction,
        comment: approveComment.trim() || undefined,
      });
      Haptics.notificationAsync(isApprove ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      setWorkflows((prev) => prev.map((w) => (w.id === data.id ? data : w)));
      setSelected(data);
      setShowApprove(false);
      setApproveComment("");
      Alert.alert(
        isApprove ? STRINGS.stepApproveTitle[lang] : STRINGS.stepRejectTitle[lang],
        isApprove ? STRINGS.stepApproveMsg[lang] : STRINGS.stepRejectMsg[lang]
      );
    } catch (err) {
      Alert.alert("Erreur", err instanceof Error ? err.message : "Impossible d'enregistrer la décision.");
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) { Alert.alert(STRINGS.titleRequired[lang]); return; }
    if (creating) return;
    setCreating(true);
    try {
      const { data } = await apiRequest<{ data: Workflow }>("/workflows", "POST", {
        title: newTitle.trim(),
        category: newCat,
        description: newDesc.trim(),
        priority: newPriority,
      });
      setWorkflows((prev) => [data, ...prev]);
      setShowCreate(false);
      setNewTitle(""); setNewDesc(""); setNewCat("reglement"); setNewPriority("medium");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(STRINGS.wfCreated[lang], STRINGS.wfCreatedMsg[lang]);
    } catch (err) {
      Alert.alert("Erreur", err instanceof Error ? err.message : "Impossible de créer le workflow.");
    } finally {
      setCreating(false);
    }
  };

  const TABS: { key: TabFilter | "all"; label: string; count: number }[] = [
    { key: "all", label: STRINGS.tabAll[lang], count: counts.all },
    { key: "in_progress", label: STRINGS.tabInProgress[lang], count: counts.in_progress },
    { key: "pending", label: STRINGS.tabPending[lang], count: counts.pending },
    { key: "approved", label: STRINGS.tabApproved[lang], count: counts.approved },
    { key: "rejected", label: STRINGS.tabRejected[lang], count: counts.rejected },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.primary }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{STRINGS.headerTitle[lang]}</Text>
            <Text style={styles.headerSub}>{STRINGS.headerSub[lang]}</Text>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
            >
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsRow}>
          {[
            { label: STRINGS.statTotal[lang], value: counts.all, color: "#fff" },
            { label: STRINGS.statInProgress[lang], value: counts.in_progress, color: "#93c5fd" },
            { label: STRINGS.statRequired[lang], value: myPending, color: "#fde68a" },
            { label: STRINGS.statApproved[lang], value: counts.approved, color: "#6ee7b7" },
          ].map((s) => (
            <View key={s.label} style={styles.statBox}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLab}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabContent}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, { backgroundColor: tab === t.key ? colors.primary : colors.muted }]}
            onPress={() => { setTab(t.key); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>{t.label}</Text>
            {t.count > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: tab === t.key ? "rgba(255,255,255,0.25)" : colors.border }]}>
                <Text style={[styles.tabBadgeText, { color: tab === t.key ? "#fff" : colors.mutedForeground }]}>{t.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Feather name="alert-triangle" size={40} color="#ef4444" />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={loadWorkflows}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="layers" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{STRINGS.emptyMsg[lang]}</Text>
          </View>
        }
        renderItem={({ item: w }) => {
          const statusCfg = STATUS_CONFIG[w.status];
          const priorityCfg = PRIORITY_CONFIG[w.priority];
          const catColor = CAT_COLORS[w.category] ?? colors.primary;
          const progress = w.steps.filter((s) => s.status === "done").length;
          const progressPct = Math.round((progress / w.steps.length) * 100);
          const daysLeft = w.deadline ? Math.ceil((new Date(w.deadline).getTime() - Date.now()) / 86400000) : null;

          return (
            <TouchableOpacity
              style={[styles.wfCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelected(w); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              {/* Top */}
              <View style={styles.cardTop}>
                <View style={[styles.catDot, { backgroundColor: catColor + "20" }]}>
                  <Feather name="layers" size={18} color={catColor} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.catBadge, { backgroundColor: catColor + "15" }]}>
                      <Text style={[styles.catText, { color: catColor }]}>{CAT_LABEL_KEYS[w.category] ? STRINGS[CAT_LABEL_KEYS[w.category]][lang] : w.category}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "15" }]}>
                      <Feather name={statusCfg.icon} size={10} color={statusCfg.color} />
                      <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                    </View>
                    <View style={[styles.priorityBadge, { borderColor: priorityCfg.color + "40" }]}>
                      <Text style={[styles.priorityText, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
                    </View>
                  </View>
                  <Text style={[styles.wfTitle, { color: colors.foreground }]}>{w.title}</Text>
                </View>
              </View>

              {/* Meta */}
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Feather name="user" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{w.initiatorName}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Feather name="calendar" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{w.startDate}</Text>
                </View>
                {daysLeft !== null && (
                  <View style={styles.metaItem}>
                    <Feather name="clock" size={11} color={daysLeft < 7 ? "#ef4444" : colors.mutedForeground} />
                    <Text style={[styles.metaText, { color: daysLeft < 7 ? "#ef4444" : colors.mutedForeground }]}>
                      {daysLeft > 0 ? `${daysLeft}${STRINGS.daysLeft[lang]}` : STRINGS.overdue[lang]}
                    </Text>
                  </View>
                )}
              </View>

              {/* Progress */}
              <View style={{ gap: 6 }}>
                <View style={styles.progressRow}>
                  <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                    Étape {Math.min(progress + 1, w.steps.length)}/{w.steps.length} — {progressPct}%
                  </Text>
                  <Text style={[styles.progressLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
                  <View style={[styles.progressFill, { width: `${progressPct}%` as any, backgroundColor: statusCfg.color }]} />
                </View>
              </View>

              {/* Steps mini */}
              <View style={styles.stepsRow}>
                {w.steps.map((step, i) => (
                  <View
                    key={step.id}
                    style={[
                      styles.stepDot,
                      {
                        backgroundColor: step.status === "done" ? "#10b981" : step.status === "current" ? colors.primary : step.status === "rejected" ? "#ef4444" : colors.muted,
                        width: step.status === "current" ? 20 : 12,
                      },
                    ]}
                  >
                    {step.status === "done" && <Feather name="check" size={8} color="#fff" />}
                    {step.status === "rejected" && <Feather name="x" size={8} color="#fff" />}
                    {step.status === "current" && <Text style={styles.stepNum}>{i + 1}</Text>}
                  </View>
                ))}
              </View>

              {w.status === "in_progress" && (
                <View style={[styles.currentStepBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                  <Feather name="arrow-right" size={12} color={colors.primary} />
                  <Text style={[styles.currentStepText, { color: colors.primary }]} numberOfLines={1}>
                    En attente: {w.steps[w.currentStep]?.assignee}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
      )}

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (() => {
          const w = selected;
          const statusCfg = STATUS_CONFIG[w.status];
          const catColor = CAT_COLORS[w.category] ?? colors.primary;
          const canAct = isAdmin && w.status === "in_progress";
          return (
            <View style={[styles.modal, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: catColor }]}>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Feather name="x" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.modalTitle} numberOfLines={2}>{w.title}</Text>
                <View style={[styles.modalStatusBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                  <Text style={styles.modalStatusText}>{statusCfg.label}</Text>
                </View>
              </View>
              <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>
                <Text style={[styles.wfDesc, { color: colors.mutedForeground }]}>{w.description}</Text>

                {w.document && (
                  <TouchableOpacity
                    style={[styles.docLink, { backgroundColor: catColor + "10", borderColor: catColor + "30" }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const match = documents.find((d) => w.document && (d.title === w.document || w.document.startsWith(d.title)));
                      if (match) {
                        router.push("/documents");
                      } else {
                        Alert.alert(
                          "Document non trouvé",
                          `"${w.document}" n'a pas encore été numérisé dans l'espace Documents. Contactez votre syndic pour l'obtenir.`,
                        );
                      }
                    }}
                  >
                    <Feather name="file-text" size={16} color={catColor} />
                    <Text style={[styles.docLinkText, { color: catColor }]} numberOfLines={1}>{w.document}</Text>
                    <Feather name="external-link" size={14} color={catColor} />
                  </TouchableOpacity>
                )}

                {/* Steps timeline */}
                <View style={{ gap: 4 }}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Étapes du workflow</Text>
                  {w.steps.map((step, i) => {
                    const isDone = step.status === "done";
                    const isCurrent = step.status === "current";
                    const isRejected = step.status === "rejected";
                    const dotColor = isDone ? "#10b981" : isCurrent ? catColor : isRejected ? "#ef4444" : colors.muted;
                    return (
                      <View key={step.id} style={styles.timelineItem}>
                        <View style={styles.timelineLeft}>
                          <View style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: isCurrent ? catColor : "transparent" }]}>
                            {isDone && <Feather name="check" size={10} color="#fff" />}
                            {isRejected && <Feather name="x" size={10} color="#fff" />}
                            {isCurrent && <View style={[styles.timelinePulse, { backgroundColor: catColor }]} />}
                            {!isDone && !isRejected && !isCurrent && <Text style={styles.timelineNum}>{i + 1}</Text>}
                          </View>
                          {i < w.steps.length - 1 && (
                            <View style={[styles.timelineLine, { backgroundColor: isDone ? "#10b981" : colors.border }]} />
                          )}
                        </View>
                        <View style={[styles.timelineContent, { backgroundColor: isCurrent ? catColor + "08" : "transparent", borderColor: isCurrent ? catColor + "30" : "transparent" }]}>
                          <View style={styles.timelineTop}>
                            <Text style={[styles.stepTitle, { color: isCurrent ? catColor : isDone ? colors.foreground : colors.mutedForeground }]}>{step.title}</Text>
                            {step.date && <Text style={[styles.stepDate, { color: colors.mutedForeground }]}>{step.date}</Text>}
                          </View>
                          <Text style={[styles.stepAssignee, { color: colors.mutedForeground }]}>{step.assignee} · {step.role}</Text>
                          {step.comment ? (
                            <View style={[styles.stepComment, { backgroundColor: isDone ? "#10b98112" : "#ef444412" }]}>
                              <Feather name={isDone ? "message-circle" : "alert-circle"} size={12} color={isDone ? "#10b981" : "#ef4444"} />
                              <Text style={[styles.stepCommentText, { color: isDone ? "#10b981" : "#ef4444" }]}>{step.comment}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Approve/Reject actions */}
                {canAct && (
                  <View style={styles.actionArea}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Action requise</Text>
                    <View style={[styles.actionCard, { backgroundColor: catColor + "08", borderColor: catColor + "30" }]}>
                      <Text style={[styles.actionCardText, { color: colors.foreground }]}>
                        En attente de validation par: <Text style={{ color: catColor, fontFamily: "Inter_700Bold" }}>{w.steps[w.currentStep]?.assignee}</Text>
                      </Text>
                    </View>
                    <View style={styles.actionBtns}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: "#10b981" }]}
                        onPress={() => { setApproveAction("approve"); setShowApprove(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                      >
                        <Feather name="check" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Approuver</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
                        onPress={() => { setApproveAction("reject"); setShowApprove(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                      >
                        <Feather name="x" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Rejeter</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
          );
        })()}
      </Modal>

      {/* Approve comment modal */}
      <Modal visible={showApprove} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.commentModal, { backgroundColor: colors.card }]}>
            <Text style={[styles.commentTitle, { color: colors.foreground }]}>
              {approveAction === "approve" ? "✓ Approuver l'étape" : "✗ Rejeter l'étape"}
            </Text>
            <Text style={[styles.commentSub, { color: colors.mutedForeground }]}>Commentaire (optionnel)</Text>
            <TextInput
              style={[styles.commentInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Ajoutez un commentaire à votre décision..."
              placeholderTextColor={colors.mutedForeground}
              value={approveComment}
              onChangeText={setApproveComment}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.commentBtns}>
              <TouchableOpacity style={[styles.commentBtn, { backgroundColor: colors.muted }]} onPress={() => { setShowApprove(false); setApproveComment(""); }}>
                <Text style={[styles.commentBtnText, { color: colors.foreground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.commentBtn, { backgroundColor: approveAction === "approve" ? "#10b981" : "#ef4444", opacity: submittingDecision ? 0.6 : 1 }]}
                onPress={handleApprove}
                disabled={submittingDecision}
              >
                {submittingDecision ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.commentBtnText, { color: "#fff" }]}>Confirmer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.primary }]}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nouveau Workflow</Text>
            <TouchableOpacity onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSave}>Créer</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Titre *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Ex: Révision du Règlement Intérieur"
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Catégorie</Text>
              <View style={styles.catGrid}>
                {Object.keys(CAT_COLORS).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catOption, {
                      backgroundColor: newCat === cat ? CAT_COLORS[cat] + "15" : colors.muted,
                      borderColor: newCat === cat ? CAT_COLORS[cat] : colors.border,
                    }]}
                    onPress={() => { setNewCat(cat); Haptics.selectionAsync(); }}
                  >
                    <Text style={[styles.catOptionText, { color: newCat === cat ? CAT_COLORS[cat] : colors.mutedForeground }]}>{STRINGS[CAT_LABEL_KEYS[cat]][lang]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Priorité</Text>
              <View style={styles.catGrid}>
                {(["low", "medium", "high", "urgent"] as WfPriority[]).map((p) => {
                  const cfg = PRIORITY_CONFIG[p];
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.catOption, {
                        backgroundColor: newPriority === p ? cfg.color + "15" : colors.muted,
                        borderColor: newPriority === p ? cfg.color : colors.border,
                      }]}
                      onPress={() => { setNewPriority(p); Haptics.selectionAsync(); }}
                    >
                      <Text style={[styles.catOptionText, { color: newPriority === p ? cfg.color : colors.mutedForeground }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Décrivez l'objet et le contexte de ce workflow..."
                placeholderTextColor={colors.mutedForeground}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)" },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, padding: 14 },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", textAlign: "center" },
  tabBar: { flexShrink: 0, borderBottomWidth: 1 },
  tabContent: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8, alignItems: "center" },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  wfCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardTop: { flexDirection: "row", gap: 12 },
  catDot: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  catText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  priorityText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  wfTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  progressBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  stepsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepDot: { height: 12, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 8, fontFamily: "Inter_700Bold", color: "#fff" },
  currentStepBox: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  currentStepText: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  modal: { flex: 1 },
  modalHeader: { padding: 20, paddingTop: 50, flexDirection: "row", alignItems: "center", gap: 14 },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  modalSave: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modalStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  modalStatusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff" },

  wfDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  docLink: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  docLinkText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },

  timelineItem: { flexDirection: "row", gap: 12 },
  timelineLeft: { alignItems: "center", width: 24 },
  timelineDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  timelinePulse: { width: 8, height: 8, borderRadius: 4 },
  timelineNum: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff" },
  timelineLine: { width: 2, flex: 1, minHeight: 16, marginVertical: 4 },
  timelineContent: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 4, gap: 4 },
  timelineTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  stepDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  stepAssignee: { fontSize: 11, fontFamily: "Inter_400Regular" },
  stepComment: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: 8, borderRadius: 8, marginTop: 4 },
  stepCommentText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular" },

  actionArea: { gap: 12 },
  actionCard: { padding: 14, borderRadius: 14, borderWidth: 1 },
  actionCardText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  actionBtns: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  commentModal: { width: "100%", borderRadius: 20, padding: 24, gap: 14 },
  commentTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  commentSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  commentInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80 },
  commentBtns: { flexDirection: "row", gap: 12 },
  commentBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  commentBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  fieldInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldTextArea: { minHeight: 100 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catOptionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
