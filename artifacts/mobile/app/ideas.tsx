import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
  infrastructure:   { label: "Infrastructure",   color: "#2563EB", icon: "tool" },
  security:         { label: "Sécurité",          color: "#ef4444", icon: "shield" },
  environment:      { label: "Environnement",     color: "#10b981", icon: "sun" },
  services:         { label: "Services",          color: "#3b82f6", icon: "package" },
  finances:         { label: "Finances",          color: "#f59e0b", icon: "dollar-sign" },
  community:        { label: "Communauté",        color: "#ec4899", icon: "users" },
  other:            { label: "Autre",             color: "#6b7280", icon: "more-horizontal" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:      { label: "En attente", color: "#f59e0b", bg: "#f59e0b15" },
  under_review: { label: "En revue",   color: "#3b82f6", bg: "#3b82f615" },
  approved:     { label: "Approuvé",   color: "#10b981", bg: "#10b98115" },
  rejected:     { label: "Rejeté",     color: "#ef4444", bg: "#ef444415" },
  implemented:  { label: "Implémenté", color: "#2563EB", bg: "#2563EB15" },
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
  userVoted?: boolean;
};

export default function IdeasScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  // President moderates and validates ideas submitted by co-owners/members.
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "president";
  const { showToast } = useToast();

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showReview, setShowReview] = useState<Idea | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "infrastructure" });
  const [submitting, setSubmitting] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [adminAction, setAdminAction] = useState<"approved" | "rejected" | "implemented">("approved");
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest("/ideas", "GET", undefined, token);
      setIdeas(data.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleSubmit = async () => {
    if (!form.title.trim()) { showToast({ type: "warning", message: "Le titre est obligatoire" }); return; }
    if (!form.description.trim()) { showToast({ type: "warning", message: "La description est obligatoire" }); return; }
    try {
      setSubmitting(true);
      await apiRequest("/ideas", "POST", form, token);
      setShowSubmit(false);
      setForm({ title: "", description: "", category: "infrastructure" });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible de soumettre l'idée" });
    } finally { setSubmitting(false); }
  };

  const handleVote = async (id: string) => {
    try {
      setVotingId(id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await apiRequest(`/ideas/${id}/vote`, "POST", {}, token);
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible de voter" });
    } finally { setVotingId(null); }
  };

  const handleReview = async () => {
    if (!showReview) return;
    try {
      setSubmitting(true);
      await apiRequest(`/ideas/${showReview.id}`, "PUT", { status: adminAction, adminNote }, token);
      setShowReview(null);
      setAdminNote("");
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e.message ?? "Impossible de mettre à jour" });
    } finally { setSubmitting(false); }
  };

  const pending = ideas.filter((i) => i.status === "pending" || i.status === "under_review").length;
  const implemented = ideas.filter((i) => i.status === "implemented").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: "#2563EB" }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Idées & Propositions</Text>
          <Text style={styles.headerSub}>{ideas.length} idée{ideas.length !== 1 ? "s" : ""} soumise{ideas.length !== 1 ? "s" : ""}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowSubmit(true); }}>
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Total", value: ideas.length, color: "#2563EB" },
          { label: "En cours", value: pending, color: "#f59e0b" },
          { label: "Implémentées", value: implemented, color: "#10b981" },
          { label: "Votes (total)", value: ideas.reduce((s, i) => s + (i.voteCount ?? 0), 0), color: "#3b82f6" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#2563EB" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
          showsVerticalScrollIndicator={false}
        >
          {ideas.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: "#2563EB15" }]}>
                <Feather name="zap" size={32} color="#2563EB" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucune idée soumise</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Soyez le premier à proposer une amélioration pour votre résidence.</Text>
              <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: "#2563EB" }]} onPress={() => setShowSubmit(true)}>
                <Text style={styles.emptyBtnText}>Soumettre une idée</Text>
              </TouchableOpacity>
            </View>
          ) : (
            ideas.map((idea) => {
              const cat = CATEGORY_CONFIG[idea.category] ?? CATEGORY_CONFIG.other;
              const st = STATUS_CONFIG[idea.status] ?? STATUS_CONFIG.pending;
              const isMyIdea = idea.userId === user?.id;

              return (
                <View key={idea.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.catIcon, { backgroundColor: cat.color + "18" }]}>
                      <Feather name={cat.icon} size={20} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{idea.title}</Text>
                      <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                        {cat.label} · {idea.userName}{isMyIdea ? " (moi)" : ""}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>

                  <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={3}>{idea.description}</Text>

                  {idea.adminNote ? (
                    <View style={[styles.noteBox, { backgroundColor: colors.secondary }]}>
                      <Feather name="message-square" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.noteText, { color: colors.mutedForeground }]}>{idea.adminNote}</Text>
                    </View>
                  ) : null}

                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    <View style={styles.voteRow}>
                      <Feather name="chevrons-up" size={14} color="#2563EB" />
                      <Text style={[styles.voteCount, { color: colors.foreground }]}>{idea.voteCount ?? 0} vote{(idea.voteCount ?? 0) !== 1 ? "s" : ""}</Text>
                    </View>

                    {idea.status === "pending" || idea.status === "under_review" ? (
                      <TouchableOpacity
                        style={[styles.voteBtn, { backgroundColor: idea.userVoted ? "#2563EB" : colors.secondary, borderColor: "#2563EB" }]}
                        onPress={() => handleVote(idea.id)}
                        disabled={votingId === idea.id}
                      >
                        {votingId === idea.id
                          ? <ActivityIndicator size="small" color={idea.userVoted ? "#fff" : "#2563EB"} />
                          : <Text style={[styles.voteBtnText, { color: idea.userVoted ? "#fff" : "#2563EB" }]}>
                              {idea.userVoted ? "Voté ✓" : "Voter"}
                            </Text>
                        }
                      </TouchableOpacity>
                    ) : null}

                    {isAdmin && (idea.status === "pending" || idea.status === "under_review") ? (
                      <TouchableOpacity
                        style={[styles.reviewBtn, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b" }]}
                        onPress={() => { setShowReview(idea); setAdminAction("approved"); setAdminNote(""); }}
                      >
                        <Text style={[styles.reviewBtnText, { color: "#f59e0b" }]}>Examiner</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Submit Modal */}
      <Modal visible={showSubmit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSubmit(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouvelle Proposition</Text>
            <TouchableOpacity onPress={() => setShowSubmit(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Catégorie</Text>
            <View style={styles.catGrid}>
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <TouchableOpacity key={k}
                  style={[styles.catBtn, { backgroundColor: form.category === k ? v.color : colors.secondary, borderColor: form.category === k ? v.color : colors.border }]}
                  onPress={() => setForm((p) => ({ ...p, category: k }))}>
                  <Feather name={v.icon} size={14} color={form.category === k ? "#fff" : v.color} />
                  <Text style={[styles.catBtnText, { color: form.category === k ? "#fff" : colors.foreground }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Titre *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Résumez votre proposition en une phrase"
              placeholderTextColor={colors.mutedForeground}
              value={form.title}
              onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
              maxLength={120}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description *</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Décrivez votre idée en détail : problème identifié, solution proposée, bénéfices attendus..."
              placeholderTextColor={colors.mutedForeground}
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              multiline numberOfLines={5} textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#2563EB", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleSubmit} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Soumettre la proposition</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Admin Review Modal */}
      <Modal visible={!!showReview} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReview(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Examiner l'idée</Text>
            <TouchableOpacity onPress={() => setShowReview(null)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{showReview?.title}</Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground, marginTop: 8 }]}>{showReview?.description}</Text>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 16 }]}>Décision</Text>
            <View style={styles.actionRow}>
              {(["approved", "rejected", "implemented"] as const).map((a) => (
                <TouchableOpacity key={a}
                  style={[styles.actionBtn, { backgroundColor: adminAction === a ? (a === "rejected" ? "#ef4444" : a === "implemented" ? "#2563EB" : "#10b981") : colors.secondary }]}
                  onPress={() => setAdminAction(a)}>
                  <Text style={[styles.actionBtnText, { color: adminAction === a ? "#fff" : colors.foreground }]}>
                    {a === "approved" ? "Approuver" : a === "rejected" ? "Rejeter" : "Marquer implémenté"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Note administrative (optionnelle)</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Expliquez votre décision aux membres..."
              placeholderTextColor={colors.mutedForeground}
              value={adminNote}
              onChangeText={setAdminNote}
              multiline numberOfLines={3} textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#2563EB", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleReview} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Enregistrer la décision</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  statCell: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLab: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  list: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  catIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 20 },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10 },
  noteText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  voteRow: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1 },
  voteCount: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  voteBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  voteBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  reviewBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  reviewBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  catBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { height: 110, textAlignVertical: "top" },
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
