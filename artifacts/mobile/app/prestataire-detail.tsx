import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { pickAndUploadPdf } from "@/lib/upload";
import { ApiContrat, ApiEvaluation, ApiPrestataire, ApiTravail, contrats, prestataires } from "@/services/api";

const TYPE_LABELS: Record<string, string> = {
  ascenseur: "Ascenseur", nettoyage: "Nettoyage", gardiennage: "Gardiennage",
  plomberie: "Plomberie", electricite: "Électricité", jardinage: "Jardinage",
  peinture: "Peinture", autre: "Autre",
};

const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "Actif", color: "#10b981" },
  suspended: { label: "Suspendu", color: "#f59e0b" },
  expired: { label: "Expiré", color: "#ef4444" },
  terminated: { label: "Résilié", color: "#6b7280" },
};

export default function PrestataireDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<ApiPrestataire | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"info" | "contracts" | "travaux" | "evaluations">("info");
  const [showNewContract, setShowNewContract] = useState(false);
  const [showEvaluate, setShowEvaluate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === "super_admin" || user?.role === "syndicate_admin";
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await prestataires.get(id);
      setData(res as any);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── New contract form ──
  const [ctForm, setCtForm] = useState({ title: "", buildingId: "", startDate: "", endDate: "", monthlyAmount: "", documentUrl: "" });
  const [ctFileName, setCtFileName] = useState("");
  const handlePickContractPdf = async () => {
    const path = await pickAndUploadPdf();
    if (path) { setCtForm((p) => ({ ...p, documentUrl: path })); setCtFileName("Document PDF joint"); }
    else Alert.alert("Erreur", "Impossible de téléverser le document");
  };
  const handleCreateContract = async () => {
    if (!ctForm.title.trim() || !ctForm.buildingId.trim() || !ctForm.documentUrl) {
      Alert.alert("Champs requis", "Titre, bâtiment et document PDF sont obligatoires");
      return;
    }
    try {
      setSubmitting(true);
      await contrats.create({
        prestataireId: id!,
        buildingId: ctForm.buildingId,
        title: ctForm.title,
        startDate: ctForm.startDate || undefined,
        endDate: ctForm.endDate || undefined,
        monthlyAmount: ctForm.monthlyAmount ? Number(ctForm.monthlyAmount) : undefined,
        documentUrl: ctForm.documentUrl,
      });
      setShowNewContract(false);
      setCtForm({ title: "", buildingId: "", startDate: "", endDate: "", monthlyAmount: "", documentUrl: "" });
      setCtFileName("");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible de créer le contrat");
    } finally { setSubmitting(false); }
  };

  const [resilierTarget, setResilierTarget] = useState<ApiContrat | null>(null);
  const [resilierReason, setResilierReason] = useState("");

  const handleConfirmResilier = async () => {
    if (!resilierTarget || !resilierReason.trim()) return;
    try {
      setSubmitting(true);
      await contrats.resilier(resilierTarget.id, resilierReason.trim());
      setResilierTarget(null);
      setResilierReason("");
      load();
    } catch (e: any) { Alert.alert("Erreur", e.message ?? "Action impossible"); }
    finally { setSubmitting(false); }
  };

  const handleContractAction = (c: ApiContrat, action: "suspend" | "reactivate" | "resilier") => {
    if (action === "resilier") {
      setResilierTarget(c);
      return;
    }
    Alert.alert(
      action === "suspend" ? "Suspendre le contrat" : "Réactiver le contrat",
      `Confirmer cette action pour "${c.title}" ?`,
      [{ text: "Annuler", style: "cancel" }, {
        text: "Confirmer",
        onPress: async () => {
          try {
            if (action === "suspend") await contrats.suspend(c.id);
            else await contrats.reactivate(c.id);
            load();
          } catch (e: any) { Alert.alert("Erreur", e.message ?? "Action impossible"); }
        },
      }],
    );
  };

  // ── Evaluation form ──
  const [evForm, setEvForm] = useState({ quality: 3, speed: 3, communication: 3, price: 3, comment: "" });
  const handleSubmitEvaluation = async () => {
    try {
      setSubmitting(true);
      await prestataires.addEvaluation(id!, evForm);
      setShowEvaluate(false);
      setEvForm({ quality: 3, speed: 3, communication: 3, price: 3, comment: "" });
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message ?? "Impossible d'enregistrer l'évaluation");
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Prestataire introuvable</Text>
      </View>
    );
  }

  const rating = data.rating ? Number(data.rating) : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: "#3b82f6", paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{data.name}</Text>
          <Text style={styles.headerSub}>{TYPE_LABELS[data.type] ?? data.type}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: data.status === "active" ? "#10b98130" : "#ef444430" }]}>
          <Text style={[styles.statusPillText, { color: data.status === "active" ? "#10b981" : "#ef4444" }]}>
            {data.status === "active" ? "Actif" : "Inactif"}
          </Text>
        </View>
      </View>

      <View style={[styles.ratingRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flexDirection: "row", gap: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Feather key={i} name="star" size={16} color={i <= Math.round(rating) ? "#f59e0b" : colors.border} />
          ))}
        </View>
        <Text style={[styles.ratingText, { color: colors.foreground }]}>
          {rating.toFixed(1)} ({data.evaluationsCount ?? 0} avis)
        </Text>
        <TouchableOpacity
          style={[styles.evalBtn, { backgroundColor: "#f59e0b" }]}
          onPress={() => { Haptics.selectionAsync(); setShowEvaluate(true); }}
        >
          <Feather name="star" size={13} color="#fff" />
          <Text style={styles.evalBtnText}>Évaluer</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {([
          ["info", "Infos"], ["contracts", "Contrats"], ["travaux", "Interventions"], ["evaluations", "Avis"],
        ] as const).map(([k, label]) => (
          <TouchableOpacity key={k} style={styles.tabBtn} onPress={() => setTab(k)}>
            <Text style={[styles.tabLabel, { color: tab === k ? "#3b82f6" : colors.mutedForeground, fontFamily: tab === k ? "Inter_700Bold" : "Inter_500Medium" }]}>{label}</Text>
            {tab === k && <View style={[styles.tabIndicator, { backgroundColor: "#3b82f6" }]} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        {tab === "info" && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { icon: "user" as const, label: "Contact", value: data.contactName },
              { icon: "phone" as const, label: "Téléphone", value: data.phone, action: data.phone ? () => Linking.openURL(`tel:${data.phone}`) : undefined },
              { icon: "mail" as const, label: "Email", value: data.email, action: data.email ? () => Linking.openURL(`mailto:${data.email}`) : undefined },
              { icon: "map-pin" as const, label: "Adresse", value: data.address },
              { icon: "hash" as const, label: "ICE", value: data.ice },
              { icon: "file-text" as const, label: "RC", value: data.rc },
            ].filter((r) => r.value).map((r, i) => (
              <TouchableOpacity key={r.label} disabled={!r.action} onPress={r.action}
                style={[styles.infoRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Feather name={r.icon} size={16} color={colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{r.label}</Text>
                  <Text style={[styles.infoValue, { color: r.action ? "#3b82f6" : colors.foreground }]}>{r.value}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {data.notes ? (
              <View style={[styles.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Feather name="clipboard" size={16} color={colors.mutedForeground} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Notes</Text>
                  <Text style={[styles.infoValue, { color: colors.foreground }]}>{data.notes}</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {tab === "contracts" && (
          <View style={{ gap: 12 }}>
            {isAdmin && (
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: "#3b82f6" }]} onPress={() => setShowNewContract(true)}>
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Nouveau contrat</Text>
              </TouchableOpacity>
            )}
            {(data.contracts ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 30 }}>Aucun contrat</Text>
            ) : (data.contracts ?? []).map((c) => {
              const sc = CONTRACT_STATUS[c.status] ?? CONTRACT_STATUS.active;
              return (
                <View key={c.id} style={[styles.contractCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.contractTitle, { color: colors.foreground }]}>{c.title}</Text>
                    <View style={[styles.badge, { backgroundColor: sc.color + "18" }]}>
                      <Text style={[styles.badgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                  </View>
                  {c.monthlyAmount ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{Number(c.monthlyAmount).toLocaleString("fr-MA")} MAD/mois</Text> : null}
                  {c.endDate ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Échéance: {c.endDate}</Text> : null}
                  {c.documentUrl ? (
                    <TouchableOpacity style={styles.docLink} onPress={() => Linking.openURL(c.documentUrl!)}>
                      <Feather name="paperclip" size={12} color="#3b82f6" />
                      <Text style={{ color: "#3b82f6", fontSize: 12 }}>Voir le document</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isAdmin && c.status !== "terminated" && (
                    <View style={styles.contractActions}>
                      {c.status === "active" ? (
                        <TouchableOpacity style={[styles.smallBtn, { borderColor: "#f59e0b" }]} onPress={() => handleContractAction(c, "suspend")}>
                          <Text style={{ color: "#f59e0b", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Suspendre</Text>
                        </TouchableOpacity>
                      ) : c.status === "suspended" ? (
                        <TouchableOpacity style={[styles.smallBtn, { borderColor: "#10b981" }]} onPress={() => handleContractAction(c, "reactivate")}>
                          <Text style={{ color: "#10b981", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Réactiver</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={[styles.smallBtn, { borderColor: "#ef4444" }]} onPress={() => handleContractAction(c, "resilier")}>
                        <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Résilier</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {tab === "travaux" && (
          <View style={{ gap: 12 }}>
            {(data.recentTravaux ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 30 }}>Aucune intervention</Text>
            ) : (data.recentTravaux ?? []).map((t: ApiTravail) => (
              <TouchableOpacity key={t.id} style={[styles.contractCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push("/travaux" as any)}>
                <Text style={[styles.contractTitle, { color: colors.foreground }]}>{t.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{t.status}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {tab === "evaluations" && (
          <View style={{ gap: 12 }}>
            {(data.evaluations ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 30 }}>Aucune évaluation</Text>
            ) : (data.evaluations ?? []).map((e: ApiEvaluation) => (
              <View key={e.id} style={[styles.contractCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.contractTitle, { color: colors.foreground }]}>{e.ratedByName ?? "Anonyme"}</Text>
                  <Text style={{ color: "#f59e0b", fontFamily: "Inter_700Bold" }}>{Number(e.average).toFixed(1)} ★</Text>
                </View>
                {e.comment ? <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>{e.comment}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New contract modal */}
      <Modal visible={showNewContract} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNewContract(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Nouveau contrat</Text>
            <TouchableOpacity onPress={() => setShowNewContract(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Titre *</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.title} onChangeText={(v) => setCtForm((p) => ({ ...p, title: v }))} placeholderTextColor={colors.mutedForeground} placeholder="Ex: Contrat entretien ascenseur" />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>ID Bâtiment *</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.buildingId} onChangeText={(v) => setCtForm((p) => ({ ...p, buildingId: v }))} placeholderTextColor={colors.mutedForeground} placeholder="ID du bâtiment" />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date de début (AAAA-MM-JJ)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.startDate} onChangeText={(v) => setCtForm((p) => ({ ...p, startDate: v }))} placeholderTextColor={colors.mutedForeground} placeholder="2026-01-01" />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date de fin (AAAA-MM-JJ)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.endDate} onChangeText={(v) => setCtForm((p) => ({ ...p, endDate: v }))} placeholderTextColor={colors.mutedForeground} placeholder="2027-01-01" />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Montant mensuel (MAD)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.monthlyAmount} onChangeText={(v) => setCtForm((p) => ({ ...p, monthlyAmount: v }))} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} placeholder="1500" />

            <TouchableOpacity style={[styles.docPickBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={handlePickContractPdf}>
              <Feather name="paperclip" size={16} color="#3b82f6" />
              <Text style={{ color: "#3b82f6", fontFamily: "Inter_600SemiBold" }}>{ctFileName || "Joindre le document PDF (obligatoire)"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: "#3b82f6", opacity: submitting ? 0.7 : 1 }]} onPress={handleCreateContract} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Créer le contrat</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Evaluate modal */}
      <Modal visible={showEvaluate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEvaluate(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Évaluer {data.name}</Text>
            <TouchableOpacity onPress={() => setShowEvaluate(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {([
              ["quality", "Qualité"], ["speed", "Rapidité"], ["communication", "Communication"], ["price", "Rapport qualité/prix"],
            ] as const).map(([k, label]) => (
              <View key={k} style={{ marginBottom: 14 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <TouchableOpacity key={v} onPress={() => setEvForm((p) => ({ ...p, [k]: v }))}>
                      <Feather name="star" size={26} color={v <= (evForm as any)[k] ? "#f59e0b" : colors.border} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Commentaire</Text>
            <TextInput style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={evForm.comment} onChangeText={(v) => setEvForm((p) => ({ ...p, comment: v }))} multiline placeholderTextColor={colors.mutedForeground} placeholder="Votre avis..." />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: "#f59e0b", opacity: submitting ? 0.7 : 1 }]} onPress={handleSubmitEvaluation} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Envoyer l'évaluation</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Résilier reason modal */}
      <Modal visible={!!resilierTarget} animationType="fade" transparent onRequestClose={() => setResilierTarget(null)}>
        <View style={styles.centerOverlay}>
          <View style={[styles.reasonCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 10 }]}>Résilier le contrat</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="Motif de résiliation"
              placeholderTextColor={colors.mutedForeground}
              value={resilierReason}
              onChangeText={setResilierReason}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.smallBtn, { flex: 1, alignItems: "center", borderColor: colors.border }]} onPress={() => setResilierTarget(null)}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, { flex: 1, alignItems: "center", borderColor: "#ef4444", backgroundColor: "#ef444418", opacity: resilierReason.trim() ? 1 : 0.5 }]}
                onPress={handleConfirmResilier}
                disabled={!resilierReason.trim() || submitting}
              >
                <Text style={{ color: "#ef4444", fontFamily: "Inter_700Bold" }}>Résilier</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  ratingText: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  evalBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  evalBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 12.5 },
  tabIndicator: { height: 2, width: "60%", borderRadius: 1, marginTop: 6 },
  body: { padding: 16 },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 13 },
  addBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  contractCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  contractTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  docLink: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  contractActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 8, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: "Inter_400Regular" },
  textarea: { height: 90, textAlignVertical: "top" },
  docPickBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
  submitBtn: { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 16 },
  submitText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  centerOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)", padding: 24 },
  reasonCard: { width: "100%", borderRadius: 16, padding: 20 },
});
