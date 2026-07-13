import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { elections as electionsApi } from "@/services/api";

interface ApiCandidate {
  id: string;
  electionId: string;
  name: string;
  post: string;
  bio: string;
  votes: number;
}

interface ApiElection {
  id: string;
  syndicateId: string;
  title: string;
  description: string;
  status: "open" | "upcoming" | "closed" | "completed";
  startDate: string;
  endDate: string;
  candidates: ApiCandidate[];
  userVotedCandidateId: string | null;
  createdAt: string;
}

// Elections (candidature, vote) sont un droit de copropriétaire (Loi 18-00) ; exclu aux locataires.
export default function ElectionsScreen() {
  return (
    <RoleGuard allow={["super_admin", "syndicate_admin", "member"]}>
      <ElectionsScreenInner />
    </RoleGuard>
  );
}

function ElectionsScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const queryClient = useQueryClient();
  const isAdmin = user?.role !== "member";

  const [selected, setSelected] = useState<ApiElection | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStart, setNewStart] = useState("2026-07-01");
  const [newEnd, setNewEnd] = useState("2026-07-31");

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["elections"],
    queryFn: () => electionsApi.list() as Promise<{ data: ApiElection[] }>,
    staleTime: 30_000,
  });

  const voteMutation = useMutation({
    mutationFn: ({ electionId, candidateId }: { electionId: string; candidateId: string }) =>
      electionsApi.vote(electionId, candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("castVote") + " ✓", t("alreadyVoted"));
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t("electionResults"), err.message);
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof electionsApi.create>[0]) => electionsApi.create(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      setShowCreate(false);
      setNewTitle(""); setNewDesc(""); setNewStart("2026-07-01"); setNewEnd("2026-07-31");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("elections"), t("openElections"));
    },
    onError: (err: Error) => Alert.alert(t("electionClosed"), err.message),
  });

  const electionList = data?.data ?? [];

  const statusConfig = (status: ApiElection["status"]) => ({
    open: { color: colors.success, label: t("statusOpen"), icon: "unlock" as const, bg: colors.success + "15" },
    upcoming: { color: "#f59e0b", label: t("statusUpcoming"), icon: "clock" as const, bg: "#f59e0b15" },
    closed: { color: colors.mutedForeground, label: t("statusClosed"), icon: "lock" as const, bg: colors.muted },
    completed: { color: colors.mutedForeground, label: t("statusClosed"), icon: "check-circle" as const, bg: colors.muted },
  }[status] ?? { color: colors.mutedForeground, label: status, icon: "help-circle" as const, bg: colors.muted });

  const handleVote = (candidateId: string) => {
    if (!selected) return;
    const candidateName = selected.candidates.find((c) => c.id === candidateId)?.name ?? t("candidateList");
    Alert.alert(
      t("castVote"),
      `${t("voteNow")} ${candidateName}?`,
      [
        { text: t("electionClosed"), style: "cancel" },
        {
          text: t("castVote"),
          onPress: () => voteMutation.mutate({ electionId: selected.id, candidateId }),
        },
      ]
    );
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    if (!DATE_RE.test(newStart) || !DATE_RE.test(newEnd)) {
      Alert.alert(t("electionClosed"), t("electionClosed")); return;
    }
    if (newEnd <= newStart) {
      Alert.alert(t("electionClosed"), t("electionClosed")); return;
    }
    createMutation.mutate({
      title: newTitle.trim(),
      description: newDesc.trim() || t("elections"),
      startDate: newStart,
      endDate: newEnd,
    } as any);
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("elections")}</Text>
        </View>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Feather name="arrow-left" size={22} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>{t("elections")}</Text>
        </View>
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
          const candidateCount = e.candidates.length;
          const totalVotes = e.candidates.reduce((s, c) => s + c.votes, 0);
          const hasVoted = e.userVotedCandidateId !== null;
          return (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { setSelected(e); setShowResults(e.status === "closed"); }}
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

              {e.status === "open" && hasVoted ? (
                <View style={[styles.voteBtn, { backgroundColor: colors.success + "20" }]}>
                  <Feather name="check-circle" size={15} color={colors.success} />
                  <Text style={[styles.voteBtnText, { color: colors.success }]}>{t("alreadyVoted")} ✓</Text>
                </View>
              ) : e.status === "open" ? (
                <View style={[styles.voteBtn, { backgroundColor: colors.primary }]}>
                  <Feather name="check-circle" size={15} color="#fff" />
                  <Text style={styles.voteBtnText}>{t("voteNow")}</Text>
                </View>
              ) : e.status === "closed" ? (
                <View style={[styles.voteBtn, { backgroundColor: colors.secondary }]}>
                  <Feather name="pie-chart" size={15} color={colors.primary} />
                  <Text style={[styles.voteBtnText, { color: colors.primary }]}>{t("electionResults")}</Text>
                </View>
              ) : (
                <View style={[styles.voteBtn, { backgroundColor: colors.muted }]}>
                  <Feather name="clock" size={15} color="#f59e0b" />
                  <Text style={[styles.voteBtnText, { color: "#f59e0b" }]}>{t("statusUpcoming")} {e.startDate}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* ─── Detail / Vote Modal ─── */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setSelected(null); setShowResults(false); }}>
        {selected ? (
          <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => { setSelected(null); setShowResults(false); }} style={styles.backBtn}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={2}>{selected.title}</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  {selected.status === "open" ? t("statusOpen") : selected.status === "closed" ? t("electionResults") : t("statusUpcoming")}
                </Text>
              </View>
              {selected.status === "open" || selected.status === "closed" ? (
                <TouchableOpacity
                  style={[styles.toggleBtn, { backgroundColor: showResults ? colors.primary : colors.muted }]}
                  onPress={() => setShowResults((p) => !p)}
                >
                  <Feather name={showResults ? "list" : "pie-chart"} size={15} color={showResults ? "#fff" : colors.foreground} />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.descText, { color: colors.mutedForeground }]}>{selected.description}</Text>
                <View style={styles.datesRow}>
                  <Feather name="calendar" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.datesText, { color: colors.mutedForeground }]}>
                    {selected.startDate} → {selected.endDate}
                  </Text>
                </View>
              </View>

              {selected.candidates.map((c) => {
                const totalVotes = selected.candidates.reduce((s, x) => s + x.votes, 0);
                const pct = totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0;
                const isVotedFor = selected.userVotedCandidateId === c.id;
                return (
                  <View key={c.id} style={[styles.candidateCard, { backgroundColor: colors.card, borderColor: isVotedFor ? colors.primary : colors.border }]}>
                    <View style={styles.candidateTop}>
                      <View style={[styles.avatar, { backgroundColor: colors.primary + "20" }]}>
                        <Text style={[styles.avatarText, { color: colors.primary }]}>{c.name.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.candidateNameRow}>
                          <Text style={[styles.candidateName, { color: colors.foreground }]}>{c.name}</Text>
                          {isVotedFor && (
                            <View style={[styles.myVoteBadge, { backgroundColor: colors.primary + "20" }]}>
                              <Feather name="check" size={10} color={colors.primary} />
                              <Text style={[styles.myVoteText, { color: colors.primary }]}>{t("yourVote")}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.candidatePost, { color: colors.mutedForeground }]}>{c.post}</Text>
                      </View>
                      {showResults && (
                        <Text style={[styles.pctText, { color: colors.primary }]}>{pct}%</Text>
                      )}
                    </View>

                    {c.bio ? (
                      <Text style={[styles.bioText, { color: colors.mutedForeground }]}>{c.bio}</Text>
                    ) : null}

                    {showResults && (
                      <View style={{ marginTop: 10, gap: 4 }}>
                        <View style={[styles.progressBg, { backgroundColor: colors.muted }]}>
                          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                        </View>
                        <Text style={[styles.votesText, { color: colors.mutedForeground }]}>{c.votes} {t("votesCount")}</Text>
                      </View>
                    )}

                    {selected.status === "open" && !selected.userVotedCandidateId && (
                      <TouchableOpacity
                        style={[styles.voteForBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handleVote(c.id)}
                        disabled={voteMutation.isPending}
                      >
                        {voteMutation.isPending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Feather name="check-circle" size={15} color="#fff" />
                            <Text style={styles.voteForBtnText}>{t("castVote")}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      {/* ─── Create Election Modal ─── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.backBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("elections")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("elections")} *</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                placeholder={t("elections")}
                placeholderTextColor={colors.mutedForeground}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("openElections")}</Text>
              <TextInput
                style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border }]}
                placeholder={t("openElections")}
                placeholderTextColor={colors.mutedForeground}
                value={newDesc}
                onChangeText={setNewDesc}
                multiline
                numberOfLines={4}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("statusUpcoming")} *</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="2026-07-01"
                placeholderTextColor={colors.mutedForeground}
                value={newStart}
                onChangeText={setNewStart}
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>{t("statusClosed")} *</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="2026-07-31"
                placeholderTextColor={colors.mutedForeground}
                value={newEnd}
                onChangeText={setNewEnd}
              />
            </View>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: !newTitle.trim() ? colors.muted : colors.primary }]}
              onPress={handleCreate}
              disabled={!newTitle.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="check-circle" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>{t("castVote")}</Text>
                </>
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
  toggleBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  descCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  descText: { fontSize: 14, lineHeight: 20 },
  datesRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  datesText: { fontSize: 12 },
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
});
