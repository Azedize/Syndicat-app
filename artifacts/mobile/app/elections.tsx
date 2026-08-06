import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import RoleGuard from "@/components/RoleGuard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { elections as electionsApi } from "@/services/api";
import { pickAndUploadPhoto } from "@/lib/upload";

type ElectionStatus =
  | "draft" | "candidacy_open" | "campaign" | "open" | "closed"
  | "quorum_failed" | "contested" | "cancelled" | "completed";

type CandidateStatus = "submitted" | "pending_validation" | "approved" | "rejected" | "withdrawn";

interface ApiCandidate {
  id: string;
  electionId: string;
  userId: string | null;
  name: string;
  post: string;
  apartmentNumber: string | null;
  bio: string;
  motivationLetter: string;
  program: string;
  status: CandidateStatus;
  rejectionReason: string | null;
  votes: number;
  photo: string | null;
}

interface ApiQuestion {
  id: string;
  candidateId: string;
  askedBy: string;
  askedByName: string;
  question: string;
  answer: string | null;
}

interface ApiMandate {
  id: string;
  userId: string | null;
  role: string;
  name: string;
  mandateStart: string | null;
  mandateEnd: string | null;
  status: string;
}

interface ApiElection {
  id: string;
  syndicateId: string;
  title: string;
  description: string;
  electionType: string;
  status: ElectionStatus;
  votingMethod: string;
  quorumPercent: number;
  majorityPercent: number;
  seatsCount: number;
  tenantsCanVote: boolean;
  isEmergency: boolean;
  candidacyStart: string;
  candidacyEnd: string;
  startDate: string;
  endDate: string;
  eligibleCount: number | null;
  participantCount: number;
  quorumReached: boolean | null;
  candidates: ApiCandidate[];
  createdAt: string;
}

// Elections (candidature, vote) sont un droit de copropriétaire (Loi 18-00) ; exclu aux locataires sauf autorisation.
export default function ElectionsScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "president", "secretary", "committee_member", "member"]}>
      <ElectionsScreenInner />
    </RoleGuard>
  );
}

const NEXT_ACTIONS: Record<ElectionStatus, { action: string; labelKey: string; icon: keyof typeof Feather.glyphMap; destructive?: boolean }[]> = {
  draft: [{ action: "open_candidacy", labelKey: "openCandidacy", icon: "user-plus" }, { action: "cancel", labelKey: "cancelElection", icon: "x-circle", destructive: true }],
  candidacy_open: [{ action: "start_campaign", labelKey: "startCampaign", icon: "megaphone" as any }, { action: "cancel", labelKey: "cancelElection", icon: "x-circle", destructive: true }],
  campaign: [{ action: "open_voting", labelKey: "openVoting", icon: "unlock" }, { action: "cancel", labelKey: "cancelElection", icon: "x-circle", destructive: true }],
  open: [{ action: "close_voting", labelKey: "closeVoting", icon: "lock" }],
  closed: [{ action: "publish_results", labelKey: "publishResults", icon: "award" }, { action: "contest", labelKey: "contestElection", icon: "alert-triangle", destructive: true }],
  quorum_failed: [{ action: "reopen_round", labelKey: "reopenRound", icon: "refresh-cw" }],
  contested: [{ action: "reopen_round", labelKey: "reopenRound", icon: "refresh-cw" }],
  cancelled: [{ action: "reopen_round", labelKey: "reopenRound", icon: "refresh-cw" }],
  completed: [{ action: "contest", labelKey: "contestElection", icon: "alert-triangle", destructive: true }],
};

function ElectionsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "candidates" | "vote" | "results">("info");
  const [showCreate, setShowCreate] = useState(false);
  const [showCandidacyForm, setShowCandidacyForm] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("special");
  const [newQuorum, setNewQuorum] = useState("50");
  const [newMajority, setNewMajority] = useState("50");
  const [newSeats, setNewSeats] = useState("1");
  const [newTenantsVote, setNewTenantsVote] = useState(false);
  const [newEmergency, setNewEmergency] = useState(false);
  // Default dates computed relative to today so they are never stale
  const [candStart, setCandStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); });
  const [candEnd, setCandEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); });
  const [newStart, setNewStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 8); return d.toISOString().slice(0, 10); });
  const [newEnd, setNewEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().slice(0, 10); });

  const [candBio, setCandBio] = useState("");
  const [candMotivation, setCandMotivation] = useState("");
  const [candProgram, setCandProgram] = useState("");
  const [candPhoto, setCandPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [questionDraft, setQuestionDraft] = useState<Record<string, string>>({});
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [newMandateMonths, setNewMandateMonths] = useState("");
  const [invalidVotesDraft, setInvalidVotesDraft] = useState("");
  const [showDelegatePicker, setShowDelegatePicker] = useState(false);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ELECTION_TYPES = [
    { value: "president", key: "electionTypePresident" },
    { value: "board", key: "electionTypeBoard" },
    { value: "financial_committee", key: "electionTypeFinancial" },
    { value: "maintenance_committee", key: "electionTypeMaintenance" },
    { value: "building_representative", key: "electionTypeRepresentative" },
    { value: "special", key: "electionTypeSpecial" },
  ];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["elections"],
    queryFn: () => electionsApi.list() as Promise<{ data: ApiElection[] }>,
    staleTime: 15_000,
  });

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["election", selectedId],
    queryFn: () => electionsApi.get(selectedId!),
    enabled: !!selectedId,
  });

  const { data: resultsData } = useQuery({
    queryKey: ["election-results", selectedId],
    queryFn: () => electionsApi.results(selectedId!),
    enabled: !!selectedId && ["closed", "completed", "contested"].includes((detail?.data as any)?.status),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["elections"] });
    queryClient.invalidateQueries({ queryKey: ["election", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["election-results", selectedId] });
  };

  const voteMutation = useMutation({
    mutationFn: ({ candidateId, abstain, onBehalfOfUserId }: { candidateId?: string; abstain?: boolean; onBehalfOfUserId?: string }) =>
      electionsApi.vote(selectedId!, candidateId, abstain, onBehalfOfUserId),
    onSuccess: () => { invalidate(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showToast({ type: "success", title: t("castVote"), message: "✓" }); },
    onError: (err: Error) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); showToast({ type: "error", title: t("elections"), message: err.message }); },
  });

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof electionsApi.create>[0]) => electionsApi.create(d),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ action, reason, tiebreakWinnerIds }: { action: string; reason?: string; tiebreakWinnerIds?: string[] }) =>
      electionsApi.transition(selectedId!, action, reason, tiebreakWinnerIds),
    onSuccess: (res) => { invalidate(); refetchDetail(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showToast({ type: "success", title: t("elections"), message: res.message }); },
    onError: (err: any) => {
      if (err.code === "TIE_DETECTED" && err.body?.tiedCandidates) {
        promptTieResolution(err.body.tiedCandidates, err.body.remainingSeats, []);
        return;
      }
      showToast({ type: "error", title: t("elections"), message: err.message });
    },
  });

  // A tie at the seat cutoff requires the admin to explicitly pick the
  // winner(s) instead of the backend silently resolving it by array order.
  // Prompts one seat at a time, accumulating picks, then re-submits publish_results.
  const promptTieResolution = (tiedCandidates: { id: string; name: string; votes: number }[], remainingSeats: number, picked: string[]) => {
    const remaining = tiedCandidates.filter((c) => !picked.includes(c.id));
    if (picked.length >= remainingSeats) {
      transitionMutation.mutate({ action: "publish_results", tiebreakWinnerIds: picked });
      return;
    }
    Alert.alert(
      t("tieDetected"),
      `${remainingSeats - picked.length} ${t("seatsToFill")}`,
      [
        ...remaining.map((c) => ({
          text: `${c.name} (${c.votes})`,
          onPress: () => promptTieResolution(tiedCandidates, remainingSeats, [...picked, c.id]),
        })),
        { text: t("electionClosed"), style: "cancel" as const },
      ],
    );
  };

  const submitCandidacyMutation = useMutation({
    mutationFn: () => electionsApi.submitCandidacy(selectedId!, { bio: candBio, motivationLetter: candMotivation, program: candProgram, photo: candPhoto }),
    onSuccess: () => {
      invalidate(); refetchDetail(); setShowCandidacyForm(false);
      setCandBio(""); setCandMotivation(""); setCandProgram(""); setCandPhoto(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: "success", message: t("elections") });
    },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const validateMutation = useMutation({
    mutationFn: ({ candidateId, decision }: { candidateId: string; decision: "approved" | "rejected" }) =>
      electionsApi.validateCandidacy(selectedId!, candidateId, decision),
    onSuccess: () => { invalidate(); refetchDetail(); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const withdrawMutation = useMutation({
    mutationFn: (candidateId: string) => electionsApi.withdrawCandidacy(selectedId!, candidateId),
    onSuccess: () => { invalidate(); refetchDetail(); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const askMutation = useMutation({
    mutationFn: ({ candidateId, question }: { candidateId: string; question: string }) => electionsApi.askQuestion(selectedId!, candidateId, question),
    onSuccess: (_r, vars) => { refetchDetail(); setQuestionDraft((p) => ({ ...p, [vars.candidateId]: "" })); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const answerMutation = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: string }) => electionsApi.answerQuestion(selectedId!, questionId, answer),
    onSuccess: (_r, vars) => { refetchDetail(); setAnswerDraft((p) => ({ ...p, [vars.questionId]: "" })); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const resignMutation = useMutation({
    mutationFn: (mandateId: string) => electionsApi.resignMandate(mandateId),
    onSuccess: () => { invalidate(); refetchDetail(); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const revokeMandateMutation = useMutation({
    mutationFn: ({ mandateId, reason }: { mandateId: string; reason: string }) => electionsApi.revokeMandate(mandateId, reason),
    onSuccess: () => { invalidate(); refetchDetail(); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const { data: eligibleVotersData } = useQuery({
    queryKey: ["election-eligible-voters", selectedId],
    queryFn: () => electionsApi.eligibleVoters(selectedId!),
    enabled: showDelegatePicker && !!selectedId,
  });

  const delegateMutation = useMutation({
    mutationFn: (granteeId: string) => electionsApi.delegate(selectedId!, granteeId),
    onSuccess: () => { invalidate(); refetchDetail(); setShowDelegatePicker(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showToast({ type: "success", message: t("elections") }); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const revokeDelegationMutation = useMutation({
    mutationFn: () => electionsApi.revokeDelegation(selectedId!),
    onSuccess: () => { invalidate(); refetchDetail(); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const invalidVotesMutation = useMutation({
    mutationFn: (count: number) => electionsApi.setInvalidVotes(selectedId!, count),
    onSuccess: () => { invalidate(); refetchDetail(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); showToast({ type: "success", message: t("elections") }); },
    onError: (err: Error) => showToast({ type: "error", title: t("elections"), message: err.message }),
  });

  const electionList = data?.data ?? [];
  const selected = (detail?.data as ApiElection | undefined) ?? null;
  const candidates = (detail?.candidates as ApiCandidate[] | undefined) ?? [];
  const questions = (detail?.questions as ApiQuestion[] | undefined) ?? [];
  const mandates = (detail?.mandates as ApiMandate[] | undefined) ?? [];
  const myCandidacy = candidates.find((c) => c.userId === user?.id) ?? null;
  const isEligible = detail?.isEligible ?? false;
  const hasVoted = detail?.hasVoted ?? false;
  const myDelegation = (detail as any)?.myDelegation ?? null;
  const delegatedToMe = ((detail as any)?.delegatedToMe as { grantorId: string; grantorName: string; grantorHasVoted: boolean }[] | undefined) ?? [];

  const statusConfig = (status: ElectionStatus) => ({
    draft: { color: colors.mutedForeground, label: t("statusDraft"), icon: "edit-3" as const, bg: colors.muted },
    candidacy_open: { color: "#3b82f6", label: t("statusCandidacyOpen"), icon: "user-plus" as const, bg: "#3b82f615" },
    campaign: { color: "#8b5cf6", label: t("statusCampaign"), icon: "flag" as const, bg: "#8b5cf615" },
    open: { color: colors.success, label: t("statusOpen"), icon: "unlock" as const, bg: colors.success + "15" },
    closed: { color: colors.mutedForeground, label: t("statusClosed"), icon: "lock" as const, bg: colors.muted },
    quorum_failed: { color: "#f59e0b", label: t("statusQuorumFailed"), icon: "alert-triangle" as const, bg: "#f59e0b15" },
    contested: { color: colors.destructive, label: t("statusContested"), icon: "alert-octagon" as const, bg: colors.destructive + "15" },
    cancelled: { color: colors.destructive, label: t("statusCancelled"), icon: "x-circle" as const, bg: colors.destructive + "15" },
    completed: { color: colors.primary, label: t("statusCompleted"), icon: "check-circle" as const, bg: colors.primary + "15" },
  }[status] ?? { color: colors.mutedForeground, label: status, icon: "help-circle" as const, bg: colors.muted });

  const candidateStatusLabel = (status: CandidateStatus) => ({
    submitted: t("candidacyPending"),
    pending_validation: t("candidacyPending"),
    approved: t("candidacyApproved"),
    rejected: t("candidacyRejected"),
    withdrawn: t("candidacyWithdrawn"),
  }[status]);

  const handleVote = (candidateId: string, onBehalfOfUserId?: string) => {
    const name = candidates.find((c) => c.id === candidateId)?.name ?? "";
    Alert.alert(t("castVote"), name, [
      { text: t("electionClosed"), style: "cancel" },
      { text: t("castVote"), onPress: () => voteMutation.mutate({ candidateId, onBehalfOfUserId } as any) },
    ]);
  };

  const handleAbstain = (onBehalfOfUserId?: string) => {
    Alert.alert(t("abstain"), "", [
      { text: t("electionClosed"), style: "cancel" },
      { text: t("abstain"), onPress: () => voteMutation.mutate({ abstain: true, onBehalfOfUserId } as any) },
    ]);
  };

  const handleTransition = (action: string, destructive?: boolean) => {
    if (destructive) {
      Alert.prompt
        ? Alert.prompt(t("cancelReasonPrompt"), undefined, (reason) => transitionMutation.mutate({ action, reason: reason || undefined }))
        : Alert.alert(t("actionConfirm"), action, [
            { text: t("electionClosed"), style: "cancel" },
            { text: t("actionConfirm"), style: "destructive", onPress: () => transitionMutation.mutate({ action }) },
          ]);
      return;
    }
    Alert.alert(t("actionConfirm"), action, [
      { text: t("electionClosed"), style: "cancel" },
      { text: t("actionConfirm"), onPress: () => transitionMutation.mutate({ action }) },
    ]);
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    for (const v of [candStart, candEnd, newStart, newEnd]) {
      if (!DATE_RE.test(v)) { handleDateError(); return; }
    }
    createMutation.mutate({
      title: newTitle.trim(),
      description: newDesc.trim(),
      electionType: newType,
      quorumPercent: parseInt(newQuorum, 10) || 50,
      majorityPercent: parseInt(newMajority, 10) || 50,
      seatsCount: parseInt(newSeats, 10) || 1,
      tenantsCanVote: newTenantsVote,
      isEmergency: newEmergency,
      candidacyStart: candStart,
      candidacyEnd: candEnd,
      startDate: newStart,
      endDate: newEnd,
      votingMethod: "simple_majority",
      mandateDurationMonths: newMandateMonths.trim() ? parseInt(newMandateMonths, 10) : null,
    } as any);
  };

  const handleDateError = () => showToast({ type: "error", title: t("elections"), message: t("invalidDateFormat") });

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Header colors={colors} topPad={topPad} title={t("elections")} onBack={() => router.back()} />
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Header colors={colors} topPad={topPad} title={t("elections")} onBack={() => router.back()} />
        <View style={styles.center}>
          <Feather name="wifi-off" size={40} color={colors.destructive} />
          <Text style={[styles.centerText, { color: colors.mutedForeground }]}>{t("noElections")}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}><Text style={styles.retryBtnText}>{t("voteNow")}</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("elections")}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {electionList.filter((e) => e.status === "open").length} {t("openElections")}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.secondary }]}
          onPress={() => router.push("/elected-members" as any)}
        >
          <Feather name="award" size={18} color={colors.primary} />
        </TouchableOpacity>
        {isAdmin ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => { setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          >
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={electionList}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name="check-square" size={40} color={colors.mutedForeground} />
            <Text style={[styles.centerText, { color: colors.mutedForeground }]}>{t("noElections")}</Text>
          </View>
        }
        renderItem={({ item: e }) => {
          const sc = statusConfig(e.status);
          const candidateCount = e.candidates?.filter((c) => c.status === "approved").length ?? 0;
          const totalVotes = e.candidates?.reduce((s, c) => s + (c.votes ?? 0), 0) ?? 0;
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelectedId(e.id); setActiveTab("info"); }}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <View style={[styles.elIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Feather name="check-square" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.elTitle, { color: colors.foreground }]}>{e.title}</Text>
                  <Text style={[styles.elDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{e.description}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                  <Feather name={sc.icon} size={11} color={sc.color} />
                  <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Feather name="users" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{candidateCount} {t("candidateList")}</Text>
                </View>
                <View style={styles.stat}>
                  <Feather name="bar-chart-2" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{totalVotes} {t("votesCount")}</Text>
                </View>
                <View style={styles.stat}>
                  <Feather name="calendar" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{e.endDate}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ─── Detail Modal ─── */}
      <Modal visible={!!selectedId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedId(null)}>
        {selected ? (
          <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setSelectedId(null)} style={styles.backBtn}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={2}>{selected.title}</Text>
                <Text style={[styles.subtitle, { color: statusConfig(selected.status).color }]}>{statusConfig(selected.status).label}</Text>
              </View>
            </View>

            <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
              {(["info", "candidates", selected.status === "open" ? "vote" : "results"] as const).map((tab) => (
                <TouchableOpacity key={tab} style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setActiveTab(tab)}>
                  <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
                    {tab === "info" ? t("tabInfo") : tab === "candidates" ? t("tabCandidates") : tab === "vote" ? t("tabVote") : t("tabResults")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              {isAdmin && NEXT_ACTIONS[selected.status]?.length ? (
                <View style={styles.actionsRow}>
                  {NEXT_ACTIONS[selected.status].map((a) => (
                    <TouchableOpacity
                      key={a.action}
                      style={[styles.actionChip, { backgroundColor: a.destructive ? colors.destructive + "15" : colors.primary + "15" }]}
                      onPress={() => handleTransition(a.action, a.destructive)}
                      disabled={transitionMutation.isPending}
                    >
                      <Feather name={a.icon} size={13} color={a.destructive ? colors.destructive : colors.primary} />
                      <Text style={[styles.actionChipText, { color: a.destructive ? colors.destructive : colors.primary }]}>{t(a.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {activeTab === "info" && (
                <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.descText, { color: colors.mutedForeground }]}>{selected.description}</Text>
                  <InfoRow icon="tag" label={t("electionType")} value={t(ELECTION_TYPES.find((x) => x.value === selected.electionType)?.key ?? "electionTypeSpecial")} colors={colors} />
                  <InfoRow icon="calendar" label={t("candidacyPeriod")} value={`${selected.candidacyStart} → ${selected.candidacyEnd}`} colors={colors} />
                  <InfoRow icon="calendar" label={t("votingPeriod")} value={`${selected.startDate} → ${selected.endDate}`} colors={colors} />
                  <InfoRow icon="percent" label={t("quorumRequired")} value={`${selected.quorumPercent}%`} colors={colors} />
                  <InfoRow icon="percent" label={t("majorityRequired")} value={`${selected.majorityPercent}%`} colors={colors} />
                  <InfoRow icon="users" label={t("seatsToFill")} value={String(selected.seatsCount)} colors={colors} />
                  {selected.tenantsCanVote ? <InfoRow icon="key" label={t("allowTenantsVote")} value="✓" colors={colors} /> : null}
                </View>
              )}

              {activeTab === "candidates" && (
                <>
                  {selected.status === "candidacy_open" && !isAdmin && (!myCandidacy || myCandidacy.status === "withdrawn" || myCandidacy.status === "rejected") ? (
                    <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={() => setShowCandidacyForm(true)}>
                      <Feather name="user-plus" size={16} color="#fff" />
                      <Text style={styles.submitBtnText}>{t("submitCandidacy")}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {candidates.length === 0 ? (
                    <View style={styles.center}>
                      <Feather name="users" size={32} color={colors.mutedForeground} />
                      <Text style={[styles.centerText, { color: colors.mutedForeground }]}>{t("noElections")}</Text>
                    </View>
                  ) : candidates.map((c) => (
                    <CandidateCard
                      key={c.id}
                      candidate={c}
                      colors={colors}
                      t={t}
                      isAdmin={isAdmin}
                      isMine={c.userId === user?.id}
                      isCampaignPhase={selected.status === "campaign" || selected.status === "open"}
                      questions={questions.filter((q) => q.candidateId === c.id)}
                      questionDraft={questionDraft[c.id] ?? ""}
                      onQuestionChange={(v: string) => setQuestionDraft((p) => ({ ...p, [c.id]: v }))}
                      onAsk={() => questionDraft[c.id]?.trim() && askMutation.mutate({ candidateId: c.id, question: questionDraft[c.id].trim() })}
                      answerDraft={answerDraft}
                      onAnswerChange={(qId: string, v: string) => setAnswerDraft((p) => ({ ...p, [qId]: v }))}
                      onAnswer={(qId: string) => answerDraft[qId]?.trim() && answerMutation.mutate({ questionId: qId, answer: answerDraft[qId].trim() })}
                      onApprove={() => validateMutation.mutate({ candidateId: c.id, decision: "approved" })}
                      onReject={() => validateMutation.mutate({ candidateId: c.id, decision: "rejected" })}
                      onWithdraw={() => withdrawMutation.mutate(c.id)}
                    />
                  ))}
                </>
              )}

              {activeTab === "vote" && (
                <>
                  {/* Proxy delegation — give/revoke your own vote to another eligible voter.
                      Ballots are anonymous, so once cast (by you or your proxy) no one — including
                      you — can see which candidate was chosen; only "hasVoted" is ever exposed. */}
                  {isEligible && !hasVoted ? (
                    <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("proxyDelegation")}</Text>
                      {myDelegation ? (
                        <View style={styles.mandateRow}>
                          <Feather name="user-check" size={14} color={colors.primary} />
                          <Text style={[styles.candidateName, { color: colors.foreground, fontSize: 13, flex: 1 }]}>{t("delegatedTo")}: {myDelegation.granteeName}</Text>
                          <TouchableOpacity onPress={() => revokeDelegationMutation.mutate()}><Text style={{ color: colors.destructive, fontSize: 11, fontWeight: "700" }}>{t("revokeDelegation")}</Text></TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.primary + "15", alignSelf: "flex-start" }]} onPress={() => setShowDelegatePicker(true)}>
                          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{t("delegateMyVote")}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : null}

                  {delegatedToMe.filter((d) => !d.grantorHasVoted).map((d) => (
                    <View key={d.grantorId} style={[styles.warnBox, { backgroundColor: colors.primary + "15" }]}>
                      <Feather name="user-check" size={14} color={colors.primary} />
                      <Text style={[styles.warnText, { color: colors.primary }]}>{t("votingOnBehalfOf")} {d.grantorName}</Text>
                    </View>
                  ))}

                  {myDelegation ? (
                    <View style={[styles.voteBtn, { backgroundColor: colors.muted }]}>
                      <Feather name="user-check" size={15} color={colors.mutedForeground} />
                      <Text style={[styles.voteBtnText, { color: colors.mutedForeground }]}>{t("voteDelegated")}</Text>
                    </View>
                  ) : hasVoted ? (
                    <View style={[styles.voteBtn, { backgroundColor: colors.success + "20" }]}>
                      <Feather name="check-circle" size={15} color={colors.success} />
                      <Text style={[styles.voteBtnText, { color: colors.success }]}>{t("alreadyVoted")} ✓</Text>
                    </View>
                  ) : !isEligible ? (
                    <View style={[styles.voteBtn, { backgroundColor: colors.muted }]}>
                      <Feather name="slash" size={15} color={colors.mutedForeground} />
                      <Text style={[styles.voteBtnText, { color: colors.mutedForeground }]}>{t("notEligible")}</Text>
                    </View>
                  ) : (
                    <>
                      {candidates.filter((c) => c.status === "approved").map((c) => (
                        <View key={c.id} style={[styles.candidateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={styles.candidateTop}>
                            <CandidateAvatar candidate={c} colors={colors} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.candidateName, { color: colors.foreground }]}>{c.name}</Text>
                              <Text style={[styles.candidatePost, { color: colors.mutedForeground }]}>{c.post}</Text>
                            </View>
                          </View>
                          <TouchableOpacity style={[styles.voteForBtn, { backgroundColor: colors.primary }]} onPress={() => handleVote(c.id)} disabled={voteMutation.isPending}>
                            {voteMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : (<><Feather name="check-circle" size={15} color="#fff" /><Text style={styles.voteForBtnText}>{t("castVote")}</Text></>)}
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity style={[styles.voteBtn, { backgroundColor: colors.muted, marginTop: 4 }]} onPress={() => handleAbstain()} disabled={voteMutation.isPending}>
                        <Feather name="minus-circle" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.voteBtnText, { color: colors.mutedForeground }]}>{t("abstain")}</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Cast a vote on behalf of each grantor who delegated to me and hasn't voted yet */}
                  {delegatedToMe.filter((d) => !d.grantorHasVoted).map((d) => (
                    <View key={"proxy-" + d.grantorId} style={{ gap: 8, marginTop: 8 }}>
                      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("castVote")} — {d.grantorName}</Text>
                      {candidates.filter((c) => c.status === "approved").map((c) => (
                        <View key={c.id} style={[styles.candidateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <View style={styles.candidateTop}>
                            <CandidateAvatar candidate={c} colors={colors} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.candidateName, { color: colors.foreground }]}>{c.name}</Text>
                              <Text style={[styles.candidatePost, { color: colors.mutedForeground }]}>{c.post}</Text>
                            </View>
                          </View>
                          <TouchableOpacity style={[styles.voteForBtn, { backgroundColor: colors.primary }]} onPress={() => handleVote(c.id, d.grantorId)} disabled={voteMutation.isPending}>
                            {voteMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : (<><Feather name="check-circle" size={15} color="#fff" /><Text style={styles.voteForBtnText}>{t("castVote")}</Text></>)}
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity style={[styles.voteBtn, { backgroundColor: colors.muted }]} onPress={() => handleAbstain(d.grantorId)} disabled={voteMutation.isPending}>
                        <Feather name="minus-circle" size={15} color={colors.mutedForeground} />
                        <Text style={[styles.voteBtnText, { color: colors.mutedForeground }]}>{t("abstain")}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              {activeTab === "results" && (
                <ResultsPanel
                  resultsData={resultsData?.data}
                  colors={colors}
                  t={t}
                  mandates={mandates}
                  isAdmin={isAdmin}
                  currentUserId={user?.id}
                  onResign={(id: string) => resignMutation.mutate(id)}
                  onRevoke={(id: string, reason: string) => revokeMandateMutation.mutate({ mandateId: id, reason })}
                  electionStatus={selected.status}
                  invalidVotesDraft={invalidVotesDraft}
                  onInvalidVotesChange={setInvalidVotesDraft}
                  onSaveInvalidVotes={() => invalidVotesMutation.mutate(parseInt(invalidVotesDraft, 10) || 0)}
                  savingInvalidVotes={invalidVotesMutation.isPending}
                />
              )}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        )}
      </Modal>

      {/* ─── Candidacy Form Modal ─── */}
      <Modal visible={showCandidacyForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCandidacyForm(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCandidacyForm(false)} style={styles.backBtn}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("submitCandidacy")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("candidatePhoto")}</Text>
              <TouchableOpacity
                style={styles.photoPicker}
                onPress={async () => {
                  setPhotoUploading(true);
                  try {
                    const result = await pickAndUploadPhoto();
                    if (result) setCandPhoto(result.objectPath);
                  } catch (err: any) {
                    showToast({ type: "error", title: t("elections"), message: err?.message ?? String(err) });
                  } finally {
                    setPhotoUploading(false);
                  }
                }}
                disabled={photoUploading}
              >
                {photoUploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : candPhoto ? (
                  <Image source={{ uri: candPhoto }} style={[styles.avatar, { width: 64, height: 64, borderRadius: 32 }]} />
                ) : (
                  <View style={[styles.avatar, { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.muted }]}>
                    <Feather name="camera" size={22} color={colors.mutedForeground} />
                  </View>
                )}
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>{candPhoto ? t("changePhoto") : t("uploadPhoto")}</Text>
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("candidateBio")}</Text>
              <TextInput style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border }]} value={candBio} onChangeText={setCandBio} multiline numberOfLines={3} placeholder={t("candidateBio")} placeholderTextColor={colors.mutedForeground} />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("motivationLetter")} *</Text>
              <TextInput style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border }]} value={candMotivation} onChangeText={setCandMotivation} multiline numberOfLines={4} placeholderTextColor={colors.mutedForeground} />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("candidateProgram")} *</Text>
              <TextInput style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border }]} value={candProgram} onChangeText={setCandProgram} multiline numberOfLines={5} placeholderTextColor={colors.mutedForeground} />
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: !candMotivation.trim() || !candProgram.trim() ? colors.muted : colors.primary }]}
              onPress={() => submitCandidacyMutation.mutate()}
              disabled={!candMotivation.trim() || !candProgram.trim() || submitCandidacyMutation.isPending}
            >
              {submitCandidacyMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : (<><Feather name="check-circle" size={16} color="#fff" /><Text style={styles.submitBtnText}>{t("submitCandidacy")}</Text></>)}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Delegate Vote Picker Modal ─── */}
      <Modal visible={showDelegatePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDelegatePicker(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowDelegatePicker(false)} style={styles.backBtn}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("delegateMyVote")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
            {(eligibleVotersData?.data ?? []).filter((v) => v.id !== user?.id).length === 0 ? (
              <Text style={[styles.centerText, { color: colors.mutedForeground }]}>{t("noElections")}</Text>
            ) : (
              (eligibleVotersData?.data ?? []).filter((v) => v.id !== user?.id).map((v) => (
                <View key={v.id} style={[styles.voterPickRow, { borderColor: colors.border }]}>
                  <Text style={[styles.candidateName, { color: colors.foreground, fontSize: 14 }]}>{v.name}</Text>
                  <TouchableOpacity onPress={() => delegateMutation.mutate(v.id)} disabled={delegateMutation.isPending}>
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{t("delegateMyVote")}</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Create Election Modal ─── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.backBtn}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("electionCreate")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("elections")} *</Text>
              <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} value={newTitle} onChangeText={setNewTitle} placeholderTextColor={colors.mutedForeground} />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("openElections")}</Text>
              <TextInput style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border }]} value={newDesc} onChangeText={setNewDesc} multiline numberOfLines={3} placeholderTextColor={colors.mutedForeground} />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("electionType")}</Text>
              <View style={styles.chipRow}>
                {ELECTION_TYPES.map((type) => (
                  <TouchableOpacity key={type.value} style={[styles.typeChip, { backgroundColor: newType === type.value ? colors.primary : colors.muted }]} onPress={() => setNewType(type.value)}>
                    <Text style={{ color: newType === type.value ? "#fff" : colors.foreground, fontSize: 12, fontWeight: "600" }}>{t(type.key)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("quorumRequired")}</Text>
                  <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} value={newQuorum} onChangeText={setNewQuorum} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("majorityRequired")}</Text>
                  <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} value={newMajority} onChangeText={setNewMajority} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("seatsToFill")}</Text>
                  <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} value={newSeats} onChangeText={setNewSeats} keyboardType="numeric" />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("mandateDuration")}</Text>
              <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} value={newMandateMonths} onChangeText={setNewMandateMonths} keyboardType="numeric" placeholder={t("indefinite")} placeholderTextColor={colors.mutedForeground} />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("candidacyPeriod")} *</Text>
              <View style={styles.rowFields}>
                <TextInput style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border }]} value={candStart} onChangeText={setCandStart} placeholder={t("dateFormatPlaceholder")} placeholderTextColor={colors.mutedForeground} />
                <TextInput style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border }]} value={candEnd} onChangeText={setCandEnd} placeholder={t("dateFormatPlaceholder")} placeholderTextColor={colors.mutedForeground} />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("votingPeriod")} *</Text>
              <View style={styles.rowFields}>
                <TextInput style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border }]} value={newStart} onChangeText={setNewStart} placeholder={t("dateFormatPlaceholder")} placeholderTextColor={colors.mutedForeground} />
                <TextInput style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border }]} value={newEnd} onChangeText={setNewEnd} placeholder={t("dateFormatPlaceholder")} placeholderTextColor={colors.mutedForeground} />
              </View>

              <TouchableOpacity style={styles.toggleRow} onPress={() => setNewTenantsVote((p) => !p)}>
                <Feather name={newTenantsVote ? "check-square" : "square"} size={18} color={colors.primary} />
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t("allowTenantsVote")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setNewEmergency((p) => !p)}>
                <Feather name={newEmergency ? "check-square" : "square"} size={18} color={colors.destructive} />
                <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t("emergencyElection")}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: !newTitle.trim() ? colors.muted : colors.primary }]} onPress={handleCreate} disabled={!newTitle.trim() || createMutation.isPending}>
              {createMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : (<><Feather name="check-circle" size={16} color="#fff" /><Text style={styles.submitBtnText}>{t("electionCreate")}</Text></>)}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Header({ colors, topPad, title, onBack }: any) {
  return (
    <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}><Feather name="arrow-left" size={22} color={colors.foreground} /></TouchableOpacity>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
    </View>
  );
}

function CandidateAvatar({ candidate: c, colors }: { candidate: ApiCandidate; colors: any }) {
  if (c.photo) {
    return <Image source={{ uri: c.photo }} style={[styles.avatar, { backgroundColor: colors.muted }]} />;
  }
  return (
    <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
      <Text style={[styles.avatarText, { color: colors.primary }]}>{c.name.charAt(0)}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, colors }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; colors: any }) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={13} color={colors.mutedForeground} />
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function CandidateCard({
  candidate: c, colors, t, isAdmin, isMine, isCampaignPhase, questions, questionDraft, onQuestionChange, onAsk,
  answerDraft, onAnswerChange, onAnswer, onApprove, onReject, onWithdraw,
}: any) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = c.status === "approved" ? colors.success : c.status === "rejected" ? colors.destructive : c.status === "withdrawn" ? colors.mutedForeground : "#f59e0b";
  return (
    <View style={[styles.candidateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <TouchableOpacity style={styles.candidateTop} onPress={() => setExpanded((p) => !p)}>
        <CandidateAvatar candidate={c} colors={colors} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.candidateName, { color: colors.foreground }]}>{c.name}{isMine ? ` (${t("yourVote")})` : ""}</Text>
          <Text style={[styles.candidatePost, { color: colors.mutedForeground }]}>{c.post}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "15" }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{c.status === "approved" ? "✓" : c.status === "rejected" ? "✕" : c.status === "withdrawn" ? "–" : "…"}</Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ gap: 8, marginTop: 6 }}>
          {c.motivationLetter ? <Text style={[styles.bioText, { color: colors.mutedForeground }]}>💬 {c.motivationLetter}</Text> : null}
          {c.program ? <Text style={[styles.bioText, { color: colors.mutedForeground }]}>📋 {c.program}</Text> : null}
          {c.rejectionReason ? <Text style={[styles.bioText, { color: colors.destructive }]}>{c.rejectionReason}</Text> : null}

          {isCampaignPhase && c.status === "approved" ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {questions.map((q: ApiQuestion) => (
                <View key={q.id} style={[styles.qaBox, { borderColor: colors.border }]}>
                  <Text style={[styles.qaQuestion, { color: colors.foreground }]}>{q.askedByName}: {q.question}</Text>
                  {q.answer ? (
                    <Text style={[styles.qaAnswer, { color: colors.primary }]}>→ {q.answer}</Text>
                  ) : isMine ? (
                    <View style={styles.qaAnswerRow}>
                      <TextInput style={[styles.qaInput, { color: colors.foreground, borderColor: colors.border }]} value={answerDraft[q.id] ?? ""} onChangeText={(v) => onAnswerChange(q.id, v)} placeholder={t("answerQuestion")} placeholderTextColor={colors.mutedForeground} />
                      <TouchableOpacity onPress={() => onAnswer(q.id)}><Feather name="send" size={16} color={colors.primary} /></TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ))}
              {questions.length === 0 ? <Text style={[styles.bioText, { color: colors.mutedForeground }]}>{t("noQuestions")}</Text> : null}
              {!isMine ? (
                <View style={styles.qaAnswerRow}>
                  <TextInput style={[styles.qaInput, { color: colors.foreground, borderColor: colors.border }]} value={questionDraft} onChangeText={onQuestionChange} placeholder={t("yourQuestion")} placeholderTextColor={colors.mutedForeground} />
                  <TouchableOpacity onPress={onAsk}><Feather name="send" size={16} color={colors.primary} /></TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.chipRow}>
            {isAdmin && (c.status === "submitted" || c.status === "pending_validation") ? (
              <>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.success + "20" }]} onPress={onApprove}><Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>{t("approveCandidacy")}</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.destructive + "20" }]} onPress={onReject}><Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "700" }}>{t("rejectCandidacy")}</Text></TouchableOpacity>
              </>
            ) : null}
            {(isMine || isAdmin) && c.status === "approved" ? (
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.destructive + "20" }]} onPress={onWithdraw}><Text style={{ color: colors.destructive, fontSize: 12, fontWeight: "700" }}>{t("withdrawCandidacy")}</Text></TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

function ResultsPanel({
  resultsData, colors, t, mandates, isAdmin, currentUserId, onResign, onRevoke,
  electionStatus, invalidVotesDraft, onInvalidVotesChange, onSaveInvalidVotes, savingInvalidVotes,
}: any) {
  if (!resultsData) {
    return (
      <View style={{ gap: 12 }}>
        {isAdmin && electionStatus === "closed" ? (
          <View style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("invalidVotesCount")}</Text>
            <View style={styles.rowFields}>
              <TextInput style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border }]} value={invalidVotesDraft} onChangeText={onInvalidVotesChange} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.mutedForeground} />
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.primary + "15", justifyContent: "center" }]} onPress={onSaveInvalidVotes} disabled={savingInvalidVotes}>
                {savingInvalidVotes ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{t("save")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        <View style={styles.center}>
          <Feather name="pie-chart" size={32} color={colors.mutedForeground} />
          <Text style={[styles.centerText, { color: colors.mutedForeground }]}>{t("electionClosed")}</Text>
        </View>
      </View>
    );
  }
  const { ranking, totalVotes, abstentions, invalidVotes, participationRate, quorumReached, winners, tie } = resultsData;
  const winnerIds = new Set((winners ?? []).map((w: any) => w.id));

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.statsGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statCell}>
          <Text style={[styles.statCellValue, { color: quorumReached ? colors.success : colors.destructive }]}>{quorumReached ? t("quorumReached") : t("quorumNotReached")}</Text>
        </View>
        <View style={styles.statCell}><Text style={[styles.statCellValue, { color: colors.foreground }]}>{participationRate}%</Text><Text style={[styles.statCellLabel, { color: colors.mutedForeground }]}>{t("participationRate")}</Text></View>
        <View style={styles.statCell}><Text style={[styles.statCellValue, { color: colors.foreground }]}>{totalVotes}</Text><Text style={[styles.statCellLabel, { color: colors.mutedForeground }]}>{t("votesCount")}</Text></View>
        <View style={styles.statCell}><Text style={[styles.statCellValue, { color: colors.foreground }]}>{abstentions}</Text><Text style={[styles.statCellLabel, { color: colors.mutedForeground }]}>{t("abstentions")}</Text></View>
        {invalidVotes > 0 ? <View style={styles.statCell}><Text style={[styles.statCellValue, { color: colors.foreground }]}>{invalidVotes}</Text><Text style={[styles.statCellLabel, { color: colors.mutedForeground }]}>{t("invalidVotesCount")}</Text></View> : null}
      </View>

      {tie ? (
        <View style={[styles.warnBox, { backgroundColor: colors.destructive + "15" }]}>
          <Feather name="alert-triangle" size={14} color={colors.destructive} />
          <Text style={[styles.warnText, { color: colors.destructive }]}>{t("tieDetected")}</Text>
        </View>
      ) : null}

      {(ranking ?? []).map((c: any) => (
        <View key={c.id} style={[styles.candidateCard, { backgroundColor: colors.card, borderColor: winnerIds.has(c.id) ? colors.primary : colors.border }]}>
          <View style={styles.candidateTop}>
            <CandidateAvatar candidate={c} colors={colors} />
            <View style={{ flex: 1 }}>
              <View style={styles.candidateNameRow}>
                <Text style={[styles.candidateName, { color: colors.foreground }]}>#{c.rank} {c.name}</Text>
                {winnerIds.has(c.id) ? (
                  <View style={[styles.myVoteBadge, { backgroundColor: colors.primary + "20" }]}><Feather name="award" size={10} color={colors.primary} /><Text style={[styles.myVoteText, { color: colors.primary }]}>{t("winner")}</Text></View>
                ) : null}
              </View>
              <Text style={[styles.candidatePost, { color: colors.mutedForeground }]}>{c.post}</Text>
            </View>
            <Text style={[styles.pctText, { color: colors.primary }]}>{c.pct}%</Text>
          </View>
          <View style={{ marginTop: 8, gap: 4 }}>
            <View style={[styles.progressBg, { backgroundColor: colors.muted }]}><View style={[styles.progressFill, { width: `${c.pct}%`, backgroundColor: colors.primary }]} /></View>
            <Text style={[styles.votesText, { color: colors.mutedForeground }]}>{c.votes} {t("votesCount")}</Text>
          </View>
        </View>
      ))}

      {mandates.length > 0 ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("electedMembers")}</Text>
          {mandates.map((m: ApiMandate) => (
            <View key={m.id} style={[styles.mandateRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="award" size={14} color={m.status === "active" ? colors.success : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.candidateName, { color: colors.foreground, fontSize: 13 }]}>{m.name} — {m.role}</Text>
                {m.mandateEnd ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{t("mandateUntil")} {m.mandateEnd}</Text> : null}
              </View>
              {m.status === "active" && (isAdmin || m.userId === currentUserId) ? (
                <TouchableOpacity onPress={() => onResign(m.id)}><Text style={{ color: colors.destructive, fontSize: 11, fontWeight: "700" }}>{t("resignMandate")}</Text></TouchableOpacity>
              ) : null}
              {m.status === "active" && isAdmin ? (
                <TouchableOpacity
                  onPress={() =>
                    Alert.prompt
                      ? Alert.prompt(t("revokeMandate"), t("revokeReasonPrompt"), (reason) => reason && onRevoke(m.id, reason))
                      : Alert.alert(t("revokeMandate"), t("revokeReasonPrompt"), [{ text: t("electionClosed"), style: "cancel" }, { text: t("revokeMandate"), style: "destructive", onPress: () => onRevoke(m.id, t("revokeMandate")) }])
                  }
                >
                  <Text style={{ color: colors.destructive, fontSize: 11, fontWeight: "700" }}>{t("revokeMandate")}</Text>
                </TouchableOpacity>
              ) : null}
              {m.status !== "active" ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                  {m.status === "resigned" ? t("mandateResigned") : m.status === "revoked" ? t("mandateRevoked") : m.status === "expired" ? t("mandateExpired") : m.status}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  centerText: { fontSize: 15, textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  retryBtnText: { color: "#fff", fontWeight: "600" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  elIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  elTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  elDesc: { fontSize: 13, lineHeight: 18 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "600" },
  divider: { height: 1 },
  statsRow: { flexDirection: "row", gap: 14 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statLabel: { fontSize: 12 },
  voteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 10 },
  voteBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: "700", flex: 1 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  actionChipText: { fontSize: 12, fontWeight: "700" },
  descCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  descText: { fontSize: 14, lineHeight: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { fontSize: 12, flex: 1 },
  infoValue: { fontSize: 12, fontWeight: "700" },
  candidateCard: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 8 },
  candidateTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700" },
  candidateNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  candidateName: { fontSize: 15, fontWeight: "700" },
  myVoteBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  myVoteText: { fontSize: 10, fontWeight: "600" },
  candidatePost: { fontSize: 12, marginTop: 2 },
  bioText: { fontSize: 13, lineHeight: 18 },
  pctText: { fontSize: 20, fontWeight: "800" },
  progressBg: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  votesText: { fontSize: 11 },
  voteForBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10, marginTop: 4 },
  voteForBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  fieldCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  rowFields: { flexDirection: "row", gap: 8 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  toggleLabel: { fontSize: 13, fontWeight: "600" },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  qaBox: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 4 },
  qaQuestion: { fontSize: 12, fontWeight: "600" },
  qaAnswer: { fontSize: 12 },
  qaAnswerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qaInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  statCell: { flex: 1, minWidth: "45%", alignItems: "center", gap: 2 },
  statCellValue: { fontSize: 15, fontWeight: "800" },
  statCellLabel: { fontSize: 11 },
  warnBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10 },
  warnText: { fontSize: 12, fontWeight: "600", flex: 1 },
  mandateRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  photoPicker: { flexDirection: "row", alignItems: "center", gap: 12 },
  voterPickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 10, padding: 12 },
});
