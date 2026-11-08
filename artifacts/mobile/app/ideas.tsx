import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useFormat } from "@/hooks/useFormat";
import { LangCode, useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";
import { ErrorState } from "@/components/DataState";
import EmptyState from "@/components/EmptyState";
import ScreenHeader from "@/components/ScreenHeader";
import { Button, Card, Chip, SheetHeader, Skeleton, StatusBadge, TextField, toneColors, type StatusTone } from "@/components/ui";
import { TYPE } from "@/constants/typography";
import { RADIUS } from "@/constants/spacing";

import { errorText } from "@/lib/errorText";
type Localized = Record<LangCode, string>;

const STRINGS = {
  headerTitle: { fr: "Idées & Propositions", en: "Ideas & Proposals", ar: "الأفكار والمقترحات", es: "Ideas y Propuestas" },
  submittedOne: { fr: "1 idée soumise", en: "1 idea submitted", ar: "فكرة واحدة مرسلة", es: "1 idea enviada" },
  submittedMany: { fr: "{count} idées soumises", en: "{count} ideas submitted", ar: "{count} أفكار مرسلة", es: "{count} ideas enviadas" },
  total: { fr: "Total", en: "Total", ar: "المجموع", es: "Total" },
  inProgress: { fr: "En cours", en: "In progress", ar: "قيد التنفيذ", es: "En curso" },
  implemented: { fr: "Implémentées", en: "Implemented", ar: "منفذة", es: "Implementadas" },
  totalVotes: { fr: "Votes (total)", en: "Total votes", ar: "إجمالي الأصوات", es: "Votos totales" },
  noIdeas: { fr: "Aucune idée soumise", en: "No ideas submitted", ar: "لم يتم إرسال أي فكرة", es: "No hay ideas enviadas" },
  noIdeasDescription: {
    fr: "Soyez le premier à proposer une amélioration pour votre résidence.",
    en: "Be the first to suggest an improvement for your residence.",
    ar: "كن أول من يقترح تحسيناً لإقامتك.",
    es: "Sea el primero en proponer una mejora para su residencia.",
  },
  submitIdea: { fr: "Soumettre une idée", en: "Submit an idea", ar: "إرسال فكرة", es: "Enviar una idea" },
  votesOne: { fr: "vote", en: "vote", ar: "صوت", es: "voto" },
  votesMany: { fr: "votes", en: "votes", ar: "أصوات", es: "votos" },
  me: { fr: "moi", en: "me", ar: "أنا", es: "yo" },
  vote: { fr: "Voter", en: "Vote", ar: "صوّت", es: "Votar" },
  voted: { fr: "Voté ✓", en: "Voted ✓", ar: "تم التصويت ✓", es: "Voté ✓" },
  review: { fr: "Examiner", en: "Review", ar: "مراجعة", es: "Revisar" },
  newProposal: { fr: "Nouvelle proposition", en: "New proposal", ar: "مقترح جديد", es: "Nueva propuesta" },
  category: { fr: "Catégorie", en: "Category", ar: "الفئة", es: "Categoría" },
  titleRequiredLabel: { fr: "Titre *", en: "Title *", ar: "العنوان *", es: "Título *" },
  titlePlaceholder: {
    fr: "Résumez votre proposition en une phrase",
    en: "Summarize your proposal in one sentence",
    ar: "لخّص مقترحك في جملة واحدة",
    es: "Resuma su propuesta en una frase",
  },
  descriptionRequiredLabel: { fr: "Description *", en: "Description *", ar: "الوصف *", es: "Descripción *" },
  descriptionPlaceholder: {
    fr: "Décrivez votre idée en détail : problème identifié, solution proposée, bénéfices attendus...",
    en: "Describe your idea in detail: identified problem, proposed solution, expected benefits...",
    ar: "صف فكرتك بالتفصيل: المشكلة، الحل المقترح، والفوائد المتوقعة...",
    es: "Describa su idea en detalle: problema identificado, solución propuesta, beneficios esperados...",
  },
  submitProposal: { fr: "Soumettre la proposition", en: "Submit proposal", ar: "إرسال المقترح", es: "Enviar propuesta" },
  reviewIdea: { fr: "Examiner l'idée", en: "Review idea", ar: "مراجعة الفكرة", es: "Revisar idea" },
  decision: { fr: "Décision", en: "Decision", ar: "القرار", es: "Decisión" },
  approve: { fr: "Approuver", en: "Approve", ar: "موافقة", es: "Aprobar" },
  reject: { fr: "Rejeter", en: "Reject", ar: "رفض", es: "Rechazar" },
  markImplemented: { fr: "Marquer implémenté", en: "Mark implemented", ar: "وضع علامة منفذ", es: "Marcar implementada" },
  adminNote: { fr: "Note administrative (optionnelle)", en: "Admin note (optional)", ar: "ملاحظة إدارية (اختيارية)", es: "Nota administrativa (opcional)" },
  adminNotePlaceholder: {
    fr: "Expliquez votre décision aux membres...",
    en: "Explain your decision to members...",
    ar: "اشرح قرارك للأعضاء...",
    es: "Explique su decisión a los miembros...",
  },
  saveDecision: { fr: "Enregistrer la décision", en: "Save decision", ar: "حفظ القرار", es: "Guardar decisión" },
  titleRequired: { fr: "Le titre est obligatoire", en: "A title is required", ar: "العنوان مطلوب", es: "El título es obligatorio" },
  descriptionRequired: { fr: "La description est obligatoire", en: "A description is required", ar: "الوصف مطلوب", es: "La descripción es obligatoria" },
  error: { fr: "Erreur", en: "Error", ar: "خطأ", es: "Error" },
  loadTitle: { fr: "Impossible de charger les idées", en: "Unable to load ideas", ar: "تعذر تحميل الأفكار", es: "No se pueden cargar las ideas" },
  loadDescription: {
    fr: "Les propositions ne sont pas disponibles pour le moment. Vérifiez votre connexion puis réessayez.",
    en: "Ideas are unavailable right now. Check your connection and try again.",
    ar: "الأفكار غير متاحة حالياً. تحقق من الاتصال ثم أعد المحاولة.",
    es: "Las ideas no están disponibles ahora. Compruebe su conexión e inténtelo de nuevo.",
  },
  retry: { fr: "Réessayer", en: "Retry", ar: "إعادة المحاولة", es: "Reintentar" },
  submitError: { fr: "Impossible de soumettre l'idée.", en: "Unable to submit the idea.", ar: "تعذر إرسال الفكرة.", es: "No se puede enviar la idea." },
  yearlyLimit: { fr: "Vous avez déjà une proposition active cette année : une seule est possible par an.", en: "You already have an active proposal this year: only one is allowed per year.", ar: "لديك بالفعل اقتراح نشط هذه السنة: يسمح باقتراح واحد في السنة.", es: "Ya tiene una propuesta activa este año: solo se permite una por año." },
  voteError: { fr: "Impossible d'enregistrer le vote.", en: "Unable to record the vote.", ar: "تعذر تسجيل التصويت.", es: "No se puede registrar el voto." },
  reviewError: { fr: "Impossible de mettre à jour la proposition.", en: "Unable to update the proposal.", ar: "تعذر تحديث المقترح.", es: "No se puede actualizar la propuesta." },
  submittedSuccess: { fr: "Votre proposition a été envoyée.", en: "Your proposal was submitted.", ar: "تم إرسال مقترحك.", es: "Su propuesta ha sido enviada." },
  decisionSuccess: { fr: "La décision a été enregistrée.", en: "The decision was saved.", ar: "تم حفظ القرار.", es: "La decisión se ha guardado." },
  voteClosed: { fr: "Vote clos", en: "Voting closed", ar: "التصويت مغلق", es: "Votación cerrada" },
  voteDeadline: { fr: "Vote jusqu'au", en: "Vote until", ar: "التصويت حتى", es: "Votar hasta" },
  removeVoteHint: { fr: "Touchez à nouveau pour retirer votre vote", en: "Tap again to remove your vote", ar: "المس مرة أخرى لسحب صوتك", es: "Toque de nuevo para retirar su voto" },
  categoryInfrastructure: { fr: "Infrastructure", en: "Infrastructure", ar: "البنية التحتية", es: "Infraestructura" },
  categorySecurity: { fr: "Sécurité", en: "Security", ar: "الأمن", es: "Seguridad" },
  categoryEnvironment: { fr: "Environnement", en: "Environment", ar: "البيئة", es: "Medio ambiente" },
  categoryServices: { fr: "Services", en: "Services", ar: "الخدمات", es: "Servicios" },
  categoryFinances: { fr: "Finances", en: "Finance", ar: "المالية", es: "Finanzas" },
  categoryCommunity: { fr: "Communauté", en: "Community", ar: "المجتمع", es: "Comunidad" },
  categoryOther: { fr: "Autre", en: "Other", ar: "أخرى", es: "Otro" },
} satisfies Record<string, Localized>;


type FeatherName = keyof typeof Feather.glyphMap;

const CATEGORY_CONFIG: Record<string, { labelKey: keyof typeof STRINGS; tone: StatusTone; icon: FeatherName }> = {
  infrastructure: { labelKey: "categoryInfrastructure", tone: "primary", icon: "tool" },
  security: { labelKey: "categorySecurity", tone: "danger", icon: "shield" },
  environment: { labelKey: "categoryEnvironment", tone: "success", icon: "sun" },
  services: { labelKey: "categoryServices", tone: "info", icon: "package" },
  finances: { labelKey: "categoryFinances", tone: "warning", icon: "dollar-sign" },
  community: { labelKey: "categoryCommunity", tone: "primary", icon: "users" },
  other: { labelKey: "categoryOther", tone: "neutral", icon: "more-horizontal" },
};

const STATUS_CONFIG: Record<string, { label: Localized; tone: StatusTone; icon: FeatherName }> = {
  // The API files new ideas as "submitted".
  submitted: { label: { fr: "En attente", en: "Pending", ar: "قيد الانتظار", es: "Pendiente" }, tone: "warning", icon: "clock" },
  pending: { label: { fr: "En attente", en: "Pending", ar: "قيد الانتظار", es: "Pendiente" }, tone: "warning", icon: "clock" },
  under_review: { label: { fr: "En revue", en: "Under review", ar: "قيد المراجعة", es: "En revisión" }, tone: "info", icon: "eye" },
  approved: { label: { fr: "Approuvé", en: "Approved", ar: "تمت الموافقة", es: "Aprobada" }, tone: "success", icon: "check-circle" },
  rejected: { label: { fr: "Rejeté", en: "Rejected", ar: "مرفوضة", es: "Rechazada" }, tone: "danger", icon: "x-circle" },
  implemented: { label: { fr: "Implémenté", en: "Implemented", ar: "منفذة", es: "Implementada" }, tone: "primary", icon: "award" },
};

type Idea = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  voteCount: number;
  voteDeadline?: string | null;
  implementedAt?: string | null;
  adminNote?: string | null;
  userName: string;
  userId: string;
  createdAt: string;
  /** Returned by GET /ideas: the signed-in person already voted. */
  hasVoted?: boolean;
};

const bare = (label: string) => label.replace(/\s*\*\s*$/, "");

export default function IdeasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const { t, lang, isRTL } = useLanguage();
  const { date } = useFormat();
  const L = lang as LangCode;

  // Same roles as the API (PUT /ideas/:id is requireAdmin).
  const canReview = user?.role === "syndicate_admin" || user?.role === "super_admin";
  const { showToast } = useToast();

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showReview, setShowReview] = useState<Idea | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "infrastructure" });
  const [submitting, setSubmitting] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [adminAction, setAdminAction] = useState<"approved" | "rejected" | "implemented">("approved");
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setLoadError(false);
        }
        const data = await apiRequest("/ideas", "GET", undefined, token);
        setIdeas(data.data ?? []);
        setLoadError(false);
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

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      showToast({ type: "warning", message: STRINGS.titleRequired[L] });
      return;
    }
    if (!form.description.trim()) {
      showToast({ type: "warning", message: STRINGS.descriptionRequired[L] });
      return;
    }
    try {
      setSubmitting(true);
      await apiRequest("/ideas", "POST", { ...form, title: form.title.trim(), description: form.description.trim() }, token);
      setShowSubmit(false);
      setForm({ title: "", description: "", category: "infrastructure" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", message: STRINGS.submittedSuccess[L] });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: STRINGS.error[L], message: e?.code === "IDEA_YEARLY_LIMIT" ? STRINGS.yearlyLimit[L] : errorText(e, t, STRINGS.submitError[L]) });
    } finally {
      setSubmitting(false);
    }
  };

  // The API toggles: a second tap removes the vote.
  const handleVote = async (id: string) => {
    try {
      setVotingId(id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await apiRequest(`/ideas/${id}/vote`, "POST", {}, token);
      await load(true);
    } catch (e: any) {
      showToast({ type: "error", title: STRINGS.error[L], message: e?.message || STRINGS.voteError[L] });
    } finally {
      setVotingId(null);
    }
  };

  const handleReview = async () => {
    if (!showReview) return;
    try {
      setSubmitting(true);
      await apiRequest(`/ideas/${showReview.id}`, "PUT", { status: adminAction, adminNote }, token);
      setShowReview(null);
      setAdminNote("");
      showToast({ type: "success", message: STRINGS.decisionSuccess[L] });
      load(true);
    } catch {
      showToast({ type: "error", title: STRINGS.error[L], message: STRINGS.reviewError[L] });
    } finally {
      setSubmitting(false);
    }
  };

  const voteOpen = (i: Idea) => i.status !== "rejected" && i.status !== "implemented" && !(i.voteDeadline && new Date(i.voteDeadline) < new Date());
  const awaitingReview = (i: Idea) => i.status === "submitted" || i.status === "pending" || i.status === "under_review";
  const pending = ideas.filter(awaitingReview).length;
  const implemented = ideas.filter((i) => i.status === "implemented").length;
  const totalVotes = ideas.reduce((s, i) => s + (i.voteCount ?? 0), 0);
  const openSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSubmit(true);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader
        title={STRINGS.headerTitle[L]}
        subtitle={!loading && !loadError ? (ideas.length === 1 ? STRINGS.submittedOne : STRINGS.submittedMany)[L].replace("{count}", String(ideas.length)) : undefined}
        action={{ icon: "plus", label: STRINGS.submitIdea[L], onPress: openSubmit }}
      />

      {loading ? (
        <View style={{ padding: 16, gap: 12 }} accessibilityLabel={STRINGS.headerTitle[L]}>
          <Skeleton height={74} radius={RADIUS.LG} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={150} radius={RADIUS.LG} />
          ))}
        </View>
      ) : loadError ? (
        <ErrorState title={STRINGS.loadTitle[L]} description={STRINGS.loadDescription[L]} retryLabel={STRINGS.retry[L]} onRetry={() => load()} accentColor={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1, paddingBottom: isWide ? 32 : insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {ideas.length > 0 ? (
            <Card padding="md">
              <View style={styles.stats}>
                {[
                  { label: STRINGS.inProgress[L], value: pending, tone: "warning" as StatusTone },
                  { label: STRINGS.implemented[L], value: implemented, tone: "success" as StatusTone },
                  { label: STRINGS.totalVotes[L], value: totalVotes, tone: "info" as StatusTone },
                ].map((s) => (
                  <View key={s.label} style={styles.stat}>
                    <Text style={[TYPE.headline, { color: toneColors(colors, s.tone).text }]}>{s.value}</Text>
                    <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "center" }]} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {ideas.length === 0 ? (
            <EmptyState icon="zap" title={STRINGS.noIdeas[L]} description={STRINGS.noIdeasDescription[L]} actionLabel={STRINGS.submitIdea[L]} onAction={openSubmit} />
          ) : (
            ideas.map((idea) => {
              const cat = CATEGORY_CONFIG[idea.category] ?? CATEGORY_CONFIG.other;
              const st = STATUS_CONFIG[idea.status] ?? STATUS_CONFIG.pending;
              const ct = toneColors(colors, cat.tone);
              const isMyIdea = idea.userId === user?.id;
              const open = voteOpen(idea);
              const votes = idea.voteCount ?? 0;
              return (
                <Card key={idea.id} padding="md" style={{ gap: 12 }}>
                  <View style={styles.cardTop}>
                    <View style={[styles.catIcon, { backgroundColor: ct.bg }]}>
                      <Feather name={cat.icon} size={18} color={ct.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={[TYPE.bodyStrong, { color: colors.foreground, textAlign: "auto" }]} numberOfLines={2}>
                        {idea.title}
                      </Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]} numberOfLines={1}>
                        {STRINGS[cat.labelKey][L]} · {idea.userName}
                        {isMyIdea ? ` (${STRINGS.me[L]})` : ""} · {date(idea.createdAt)}
                      </Text>
                    </View>
                    <StatusBadge label={st.label[L]} tone={st.tone} icon={st.icon} />
                  </View>

                  <Text style={[TYPE.secondary, { color: colors.textSecondary, textAlign: "auto" }]} numberOfLines={4}>
                    {idea.description}
                  </Text>

                  {idea.adminNote ? (
                    <View style={[styles.note, { backgroundColor: colors.surfaceMuted }]}>
                      <Feather name="message-square" size={13} color={colors.textMuted} />
                      <Text style={[TYPE.secondary, { color: colors.textSecondary, flex: 1, textAlign: "auto" }]}>{idea.adminNote}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.footer, { borderTopColor: colors.border }]}>
                    {/* Vote counter: the heart of an idea board */}
                    <View style={[styles.voteTally, { backgroundColor: idea.hasVoted ? colors.primarySoft : colors.surfaceMuted }]}>
                      <Feather name="chevrons-up" size={16} color={idea.hasVoted ? colors.primary : colors.textMuted} />
                      <Text style={[TYPE.bodyStrong, { color: idea.hasVoted ? colors.secondaryForeground : colors.foreground }]}>{votes}</Text>
                      <Text style={[TYPE.caption, { color: colors.textMuted }]}>{votes === 1 ? STRINGS.votesOne[L] : STRINGS.votesMany[L]}</Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {open ? (
                      <Button
                        label={idea.hasVoted ? STRINGS.voted[L].replace(" ✓", "") : STRINGS.vote[L]}
                        icon={idea.hasVoted ? "check" : "thumbs-up"}
                        size="sm"
                        variant={idea.hasVoted ? "secondary" : "primary"}
                        loading={votingId === idea.id}
                        accessibilityHint={idea.hasVoted ? STRINGS.removeVoteHint[L] : undefined}
                        onPress={() => handleVote(idea.id)}
                      />
                    ) : (
                      <Text style={[TYPE.caption, { color: colors.textMuted }]}>{STRINGS.voteClosed[L]}</Text>
                    )}
                    {canReview && awaitingReview(idea) ? (
                      <Button
                        label={STRINGS.review[L]}
                        icon="edit-3"
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          setShowReview(idea);
                          setAdminAction("approved");
                          setAdminNote("");
                        }}
                      />
                    ) : null}
                  </View>
                  {open && idea.voteDeadline ? (
                    <Text style={[TYPE.caption, { color: colors.textMuted, textAlign: "auto" }]}>
                      {STRINGS.voteDeadline[L]} {date(idea.voteDeadline)}
                    </Text>
                  ) : null}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* New idea */}
      <Modal visible={showSubmit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSubmit(false)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={STRINGS.newProposal[L]} onClose={() => setShowSubmit(false)} />
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{STRINGS.category[L]}</Text>
              <View style={styles.chips}>
                {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                  <Chip key={k} label={STRINGS[v.labelKey][L]} icon={v.icon} selected={form.category === k} onPress={() => setForm((p) => ({ ...p, category: k }))} />
                ))}
              </View>
            </View>
            <TextField label={bare(STRINGS.titleRequiredLabel[L])} required placeholder={STRINGS.titlePlaceholder[L]} value={form.title} onChangeText={(v) => setForm((p) => ({ ...p, title: v }))} maxLength={120} />
            <TextField label={bare(STRINGS.descriptionRequiredLabel[L])} required placeholder={STRINGS.descriptionPlaceholder[L]} value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} multiline />
            <Button label={STRINGS.submitProposal[L]} icon="send" size="lg" fullWidth loading={submitting} disabled={!form.title.trim() || !form.description.trim()} onPress={handleSubmit} />
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      {/* Review (syndic) */}
      <Modal visible={!!showReview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReview(null)}>
        <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
          <SheetHeader title={STRINGS.reviewIdea[L]} subtitle={showReview?.title} onClose={() => setShowReview(null)} />
          <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Card padding="lg">
              <Text style={[TYPE.body, { color: colors.foreground, textAlign: "auto" }]}>{showReview?.description}</Text>
            </Card>
            <View style={{ gap: 8 }}>
              <Text style={[TYPE.label, { color: colors.foreground }]}>{STRINGS.decision[L]}</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {(
                  [
                    ["approved", "check-circle", STRINGS.approve[L]],
                    ["rejected", "x-circle", STRINGS.reject[L]],
                    ["implemented", "award", STRINGS.markImplemented[L]],
                  ] as const
                ).map(([a, icon, label]) => (
                  <Chip key={a} label={label} icon={icon} selected={adminAction === a} onPress={() => setAdminAction(a)} />
                ))}
              </View>
            </View>
            <TextField label={STRINGS.adminNote[L]} placeholder={STRINGS.adminNotePlaceholder[L]} value={adminNote} onChangeText={setAdminNote} multiline />
            <Button label={STRINGS.saveDecision[L]} icon="check" size="lg" fullWidth loading={submitting} onPress={handleReview} variant={adminAction === "rejected" ? "destructive" : "primary"} />
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  catIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: RADIUS.MD },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  voteTally: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sheetBody: { padding: 20, gap: 18, paddingBottom: 60 },
});
