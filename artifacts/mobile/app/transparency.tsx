import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { useToast } from "@/context/ToastContext";
import { apiRequest } from "@/lib/api";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: "En cours",   color: "#3b82f6", bg: "#3b82f615" },
  approved:   { label: "Approuvé",  color: "#10b981", bg: "#10b98115" },
  challenged: { label: "Contesté",  color: "#ef4444", bg: "#ef444415" },
  resolved:   { label: "Résolu",    color: "#2563EB", bg: "#2563EB15" },
};

const CATEGORY_COLORS: Record<string, string> = {
  maintenance: "#f97316",
  salaires: "#2563EB",
  travaux: "#ef4444",
  fournitures: "#3b82f6",
  assurance: "#10b981",
  autre: "#6b7280",
};

type Justification = {
  id: string;
  title: string;
  description: string;
  amount: string | number;
  category?: string | null;
  receiptUrl?: string | null;
  status: string;
  submitterName?: string | null;
  challengerName?: string | null;
  challengeReason?: string | null;
  votesFor?: number;
  votesAgainst?: number;
  voteCount?: number;
  createdAt: string;
};

export default function TransparencyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const { showToast } = useToast();
  const isAdmin = user?.role === "syndicate_admin" || user?.role === "super_admin";

  const [items, setItems] = useState<Justification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showChallenge, setShowChallenge] = useState<Justification | null>(null);
  const [form, setForm] = useState({ title: "", description: "", amount: "", category: "maintenance", receiptUrl: "" });
  const [challengeReason, setChallengeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest("/expense-justifications", "GET", undefined, token);
      setItems(data.data ?? []);
    } catch (e: any) { if (!silent) showToast({ type: "error", title: "Erreur de chargement", message: e?.message ?? "Impossible de charger les justificatifs." }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(true); };

  const handleAdd = async () => {
    if (!form.title.trim()) { showToast({ type: "warning", title: "Champ requis", message: "Le titre est obligatoire." }); return; }
    if (!form.amount) { showToast({ type: "warning", title: "Champ requis", message: "Le montant est obligatoire." }); return; }
    try {
      setSubmitting(true);
      await apiRequest("/expense-justifications", "POST", {
        ...form,
        amount: parseFloat(form.amount),
      }, token);
      setShowAdd(false);
      setForm({ title: "", description: "", amount: "", category: "maintenance", receiptUrl: "" });
      showToast({ type: "success", title: "Dépense publiée", message: "La justification a été enregistrée." });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e?.message ?? "Impossible d'ajouter la justification." });
    } finally { setSubmitting(false); }
  };

  const handleChallenge = async () => {
    if (!showChallenge) return;
    if (!challengeReason.trim()) { showToast({ type: "warning", title: "Champ requis", message: "La raison de contestation est obligatoire." }); return; }
    try {
      setSubmitting(true);
      await apiRequest(`/expense-justifications/${showChallenge.id}/challenge`, "POST", { reason: challengeReason }, token);
      setShowChallenge(null);
      setChallengeReason("");
      showToast({ type: "success", title: "Contestation envoyée", message: "Votre contestation a été transmise." });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e?.message ?? "Impossible de contester." });
    } finally { setSubmitting(false); }
  };

  const handleVote = async (id: string, vote: "for" | "against") => {
    try {
      setVotingId(id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await apiRequest(`/expense-justifications/${id}/vote`, "POST", { vote }, token);
      showToast({ type: "success", title: "Vote enregistré", message: `Vous avez voté ${vote === "for" ? "pour" : "contre"} cette dépense.` });
      load(true);
    } catch (e: any) {
      showToast({ type: "error", title: "Erreur", message: e?.message ?? "Impossible de voter." });
    } finally { setVotingId(null); }
  };

  const formatMoney = (v: string | number) => `${parseFloat(String(v ?? 0)).toLocaleString("fr-MA", { minimumFractionDigits: 2 })} MAD`;
  const totalPublished = items.reduce((s, i) => s + parseFloat(String(i.amount ?? 0)), 0);
  const challenged = items.filter((i) => i.status === "challenged").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: "#1e293b" }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Transparence Financière</Text>
          <Text style={styles.headerSub}>{items.length} justificatif{items.length !== 1 ? "s" : ""} publié{items.length !== 1 ? "s" : ""}</Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { label: "Total", value: items.length, color: "#1e293b" },
          { label: "Montant total", value: `${(totalPublished / 1000).toFixed(0)}k`, color: "#3b82f6" },
          { label: "Contestés", value: challenged, color: "#ef4444" },
          { label: "Résolus", value: items.filter((i) => i.status === "resolved").length, color: "#10b981" },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statLab, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#1e293b" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: isWide ? 32 : insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e293b" />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: "#1e293b15" }]}>
                <Feather name="file-text" size={32} color="#1e293b" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aucun justificatif</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Les justificatifs de dépenses apparaîtront ici une fois publiés par l'administration.</Text>
            </View>
          ) : (
            items.map((item) => {
              const st = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
              const catColor = CATEGORY_COLORS[item.category ?? ""] ?? "#6b7280";

              return (
                <View key={item.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.catDot, { backgroundColor: catColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
                      <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
                        {item.category ?? "autre"} · {item.submitterName ?? "Admin"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[styles.amount, { color: colors.foreground }]}>{formatMoney(item.amount)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                  </View>

                  {item.description ? (
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
                  ) : null}

                  {item.status === "challenged" ? (
                    <View style={[styles.challengeBox, { backgroundColor: "#ef444410", borderColor: "#ef4444" }]}>
                      <Feather name="alert-triangle" size={12} color="#ef4444" />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.challengeWho, { color: "#ef4444" }]}>Contesté par {item.challengerName ?? "un membre"}</Text>
                        {item.challengeReason ? <Text style={[styles.challengeReason, { color: colors.mutedForeground }]}>{item.challengeReason}</Text> : null}
                      </View>
                    </View>
                  ) : null}

                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    {item.status === "challenged" ? (
                      <>
                        <View style={styles.voteInfo}>
                          <Text style={[styles.voteLabel, { color: "#10b981" }]}>Pour: {item.votesFor ?? 0}</Text>
                          <Text style={[styles.voteLabel, { color: "#ef4444" }]}>Contre: {item.votesAgainst ?? 0}</Text>
                        </View>
                        <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#10b98118", borderColor: "#10b981" }]}
                          onPress={() => handleVote(item.id, "for")} disabled={votingId === item.id}>
                          <Text style={[styles.smallBtnText, { color: "#10b981" }]}>Pour ✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#ef444418", borderColor: "#ef4444" }]}
                          onPress={() => handleVote(item.id, "against")} disabled={votingId === item.id}>
                          <Text style={[styles.smallBtnText, { color: "#ef4444" }]}>Contre ✗</Text>
                        </TouchableOpacity>
                      </>
                    ) : item.status === "pending" || item.status === "approved" ? (
                      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: "#ef444418", borderColor: "#ef4444" }]}
                        onPress={() => { setShowChallenge(item); setChallengeReason(""); }}>
                        <Feather name="alert-triangle" size={12} color="#ef4444" />
                        <Text style={[styles.smallBtnText, { color: "#ef4444" }]}>Contester</Text>
                      </TouchableOpacity>
                    ) : null}

                    {item.receiptUrl ? (
                      <View style={styles.receiptTag}>
                        <Feather name="paperclip" size={11} color={colors.mutedForeground} />
                        <Text style={[styles.receiptText, { color: colors.mutedForeground }]}>Justificatif</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add Modal (admin only) */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Publier un justificatif</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {[
              { label: "Titre *", key: "title" as const, placeholder: "Ex: Réparation ascenseur" },
              { label: "Montant (MAD) *", key: "amount" as const, placeholder: "Ex: 12500", numeric: true },
              { label: "Description", key: "description" as const, placeholder: "Détails de la dépense...", multi: true },
              { label: "URL du justificatif", key: "receiptUrl" as const, placeholder: "https://..." },
            ].map((f) => (
              <View key={f.key}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  style={[styles.input, f.multi && styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  value={form[f.key]}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  keyboardType={f.numeric ? "numeric" : "default"}
                  multiline={f.multi}
                  numberOfLines={f.multi ? 3 : 1}
                  textAlignVertical={f.multi ? "top" : "center"}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#1e293b", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleAdd} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Publier le justificatif</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Challenge Modal */}
      <Modal visible={!!showChallenge} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowChallenge(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Contester une dépense</Text>
            <TouchableOpacity onPress={() => setShowChallenge(null)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <View style={[styles.challengePreview, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{showChallenge?.title}</Text>
              <Text style={[styles.amount, { color: colors.foreground, marginTop: 4 }]}>{formatMoney(showChallenge?.amount ?? 0)}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Motif de contestation *</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Expliquez pourquoi vous contestez cette dépense..."
              placeholderTextColor={colors.mutedForeground}
              value={challengeReason}
              onChangeText={setChallengeReason}
              multiline numberOfLines={4} textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: "#ef4444", opacity: submitting ? 0.7 : 1 }]}
              onPress={handleChallenge} disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Confirmer la contestation</Text>}
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
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  amount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  challengeBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  challengeWho: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  challengeReason: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  voteInfo: { flexDirection: "row", gap: 10, flex: 1 },
  voteLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  smallBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  receiptTag: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" as any },
  receiptText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { height: 100, textAlignVertical: "top" },
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  challengePreview: { borderRadius: 12, padding: 14, marginBottom: 8 },
});
