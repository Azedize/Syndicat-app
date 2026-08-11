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
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { pickAndUploadPdf } from "@/lib/upload";
import { ApiContrat, ApiEvaluation, ApiPrestataire, ApiTravail, contrats, prestataires } from "@/services/api";
import { ErrorState, LoadingState } from "@/components/DataState";

const TYPE_LABELS: Record<string, string> = {
  ascenseur: "pdTypeElevator", nettoyage: "pdTypeCleaning", gardiennage: "pdTypeSecurity",
  plomberie: "pdTypePlumbing", electricite: "pdTypeElectrical", jardinage: "pdTypeGardening",
  peinture: "pdTypePainting", autre: "pdTypeOther",
};

const CONTRACT_STATUS: Record<string, { labelKey: string; color: string }> = {
  active: { labelKey: "pdStatusActive", color: "#10b981" },
  suspended: { labelKey: "pdStatusSuspended", color: "#f59e0b" },
  expired: { labelKey: "pdStatusExpired", color: "#ef4444" },
  terminated: { labelKey: "pdStatusTerminated", color: "#6b7280" },
};

export default function PrestataireDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isWide } = useBreakpoints();
  const { showToast } = useToast();
  const { t, lang } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [data, setData] = useState<ApiPrestataire | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<"info" | "contracts" | "travaux" | "evaluations">("info");
  const [showNewContract, setShowNewContract] = useState(false);
  const [showEvaluate, setShowEvaluate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = user?.role === "syndicate_admin";
  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setLoadError(false);
      const res = await prestataires.get(id);
      setData(res as any);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── New contract form ──
  const [ctForm, setCtForm] = useState({ title: "", buildingId: "", startDate: "", endDate: "", monthlyAmount: "", documentUrl: "" });
  const [ctFileName, setCtFileName] = useState("");
  const handlePickContractPdf = async () => {
    const result = await pickAndUploadPdf();
    if (result) { setCtForm((p) => ({ ...p, documentUrl: result.objectPath })); setCtFileName(t("pdAttachPdf")); }
    else showToast({ type: "error", title: t("error"), message: t("pdUploadDocumentError") });
  };
  const handleCreateContract = async () => {
    if (!ctForm.title.trim() || !ctForm.buildingId.trim() || !ctForm.documentUrl) {
      showToast({ type: "warning", title: t("requiredFields"), message: t("pdRequiredFields") });
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
      showToast({ type: "error", title: t("error"), message: t("pdCreateContractError") });
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
    } catch { showToast({ type: "error", title: t("error"), message: t("pdActionError") }); }
    finally { setSubmitting(false); }
  };

  const handleContractAction = (c: ApiContrat, action: "suspend" | "reactivate" | "resilier") => {
    if (action === "resilier") {
      setResilierTarget(c);
      return;
    }
    Alert.alert(
      action === "suspend" ? t("pdSuspend") : t("pdReactivate"),
      `${t("pdConfirmContractAction")} "${c.title}" ?`,
      [{ text: t("cancel"), style: "cancel" }, {
        text: t("confirm"),
        onPress: async () => {
          try {
            if (action === "suspend") await contrats.suspend(c.id);
            else await contrats.reactivate(c.id);
            load();
          } catch { showToast({ type: "error", title: t("error"), message: t("pdActionError") }); }
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
      showToast({ type: "error", title: t("error"), message: t("pdEvaluationError") });
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingState title={t("loading")} description={t("pdLoadingDescription")} accentColor={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ErrorState
          title={t("error")}
          description={t("pdLoadError")}
          retryLabel={t("retry")}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>{t("pdNotFound")}</Text>
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
          <Text style={styles.headerSub}>{t(TYPE_LABELS[data.type] ?? "pdTypeOther")}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: data.status === "active" ? "#10b98130" : "#ef444430" }]}>
          <Text style={[styles.statusPillText, { color: data.status === "active" ? "#10b981" : "#ef4444" }]}>
            {data.status === "active" ? t("pdStatusActive") : t("pdStatusInactive")}
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
          {rating.toFixed(1)} ({t("pdRatingCount").replace("{count}", String(data.evaluationsCount ?? 0))})
        </Text>
        <TouchableOpacity
          style={[styles.evalBtn, { backgroundColor: "#f59e0b" }]}
          onPress={() => { Haptics.selectionAsync(); setShowEvaluate(true); }}
        >
          <Feather name="star" size={13} color="#fff" />
          <Text style={styles.evalBtnText}>{t("pdEvaluate")}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {([
          ["info", "pdTabInfo"], ["contracts", "pdTabContracts"], ["travaux", "pdTabWorks"], ["evaluations", "pdTabEvaluations"],
        ] as const).map(([k, label]) => (
          <TouchableOpacity key={k} style={styles.tabBtn} onPress={() => setTab(k)}>
            <Text style={[styles.tabLabel, { color: tab === k ? "#3b82f6" : colors.mutedForeground, fontFamily: tab === k ? "Inter_700Bold" : "Inter_500Medium" }]}>{t(label)}</Text>
            {tab === k && <View style={[styles.tabIndicator, { backgroundColor: "#3b82f6" }]} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        {tab === "info" && (
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { icon: "user" as const, label: t("pdContact"), value: data.contactName },
              { icon: "phone" as const, label: t("pdPhone"), value: data.phone, action: data.phone ? () => Linking.openURL(`tel:${data.phone}`) : undefined },
              { icon: "mail" as const, label: t("pdEmail"), value: data.email, action: data.email ? () => Linking.openURL(`mailto:${data.email}`) : undefined },
              { icon: "map-pin" as const, label: t("pdAddress"), value: data.address },
              { icon: "hash" as const, label: t("pdIce"), value: data.ice },
              { icon: "file-text" as const, label: t("pdRc"), value: data.rc },
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
                  <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{t("pdNotes")}</Text>
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
                <Text style={styles.addBtnText}>{t("pdNewContract")}</Text>
              </TouchableOpacity>
            )}
            {(data.contracts ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 30 }}>{t("pdNoContract")}</Text>
            ) : (data.contracts ?? []).map((c) => {
              const sc = CONTRACT_STATUS[c.status] ?? CONTRACT_STATUS.active;
              return (
                <View key={c.id} style={[styles.contractCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.contractTitle, { color: colors.foreground }]}>{c.title}</Text>
                    <View style={[styles.badge, { backgroundColor: sc.color + "18" }]}>
                      <Text style={[styles.badgeText, { color: sc.color }]}>{t(sc.labelKey)}</Text>
                    </View>
                  </View>
                  {c.monthlyAmount ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{Number(c.monthlyAmount).toLocaleString(lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-MA" : "fr-MA")} MAD/mois</Text> : null}
                  {c.endDate ? <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{t("pdDueDate")}: {c.endDate}</Text> : null}
                  {c.documentUrl ? (
                    <TouchableOpacity style={styles.docLink} onPress={() => Linking.openURL(c.documentUrl!)}>
                      <Feather name="paperclip" size={12} color="#3b82f6" />
                      <Text style={{ color: "#3b82f6", fontSize: 12 }}>{t("pdViewDocument")}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isAdmin && c.status !== "terminated" && (
                    <View style={styles.contractActions}>
                      {c.status === "active" ? (
                        <TouchableOpacity style={[styles.smallBtn, { borderColor: "#f59e0b" }]} onPress={() => handleContractAction(c, "suspend")}>
                          <Text style={{ color: "#f59e0b", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{t("pdSuspend")}</Text>
                        </TouchableOpacity>
                      ) : c.status === "suspended" ? (
                        <TouchableOpacity style={[styles.smallBtn, { borderColor: "#10b981" }]} onPress={() => handleContractAction(c, "reactivate")}>
                          <Text style={{ color: "#10b981", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{t("pdReactivate")}</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={[styles.smallBtn, { borderColor: "#ef4444" }]} onPress={() => handleContractAction(c, "resilier")}>
                        <Text style={{ color: "#ef4444", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{t("pdTerminate")}</Text>
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
              <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 30 }}>{t("pdNoWorks")}</Text>
            ) : (data.recentTravaux ?? []).map((work: ApiTravail) => (
              <TouchableOpacity key={work.id} style={[styles.contractCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push("/travaux" as any)}>
                <Text style={[styles.contractTitle, { color: colors.foreground }]}>{work.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  {t(work.status === "completed" ? "pdWorkCompleted" : work.status === "cancelled" ? "pdWorkCancelled" : "pdWorkActive")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {tab === "evaluations" && (
          <View style={{ gap: 12 }}>
            {(data.evaluations ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 30 }}>{t("pdNoEvaluations")}</Text>
            ) : (data.evaluations ?? []).map((e: ApiEvaluation) => (
              <View key={e.id} style={[styles.contractCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.contractTitle, { color: colors.foreground }]}>{e.ratedByName ?? t("pdAnonymous")}</Text>
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
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("pdNewContract")}</Text>
            <TouchableOpacity onPress={() => setShowNewContract(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("pdTitle")} *</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.title} onChangeText={(v) => setCtForm((p) => ({ ...p, title: v }))} placeholderTextColor={colors.mutedForeground} placeholder={t("pdContractTitlePlaceholder")} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("pdBuildingId")} *</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.buildingId} onChangeText={(v) => setCtForm((p) => ({ ...p, buildingId: v }))} placeholderTextColor={colors.mutedForeground} placeholder={t("pdBuildingIdPlaceholder")} />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("pdStartDate")} (AAAA-MM-JJ)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.startDate} onChangeText={(v) => setCtForm((p) => ({ ...p, startDate: v }))} placeholderTextColor={colors.mutedForeground} placeholder="2026-01-01" />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("pdEndDate")} (AAAA-MM-JJ)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.endDate} onChangeText={(v) => setCtForm((p) => ({ ...p, endDate: v }))} placeholderTextColor={colors.mutedForeground} placeholder="2027-01-01" />
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("pdMonthlyAmount")}</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={ctForm.monthlyAmount} onChangeText={(v) => setCtForm((p) => ({ ...p, monthlyAmount: v }))} keyboardType="numeric" placeholderTextColor={colors.mutedForeground} placeholder="1500" />

            <TouchableOpacity style={[styles.docPickBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={handlePickContractPdf}>
              <Feather name="paperclip" size={16} color="#3b82f6" />
              <Text style={{ color: "#3b82f6", fontFamily: "Inter_600SemiBold" }}>{ctFileName || t("pdAttachPdfRequired")}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: "#3b82f6", opacity: submitting ? 0.7 : 1 }]} onPress={handleCreateContract} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t("pdCreateContract")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Evaluate modal */}
      <Modal visible={showEvaluate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEvaluate(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("pdEvaluate")} {data.name}</Text>
            <TouchableOpacity onPress={() => setShowEvaluate(false)}><Feather name="x" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {([
              ["quality", "pdQuality"], ["speed", "pdSpeed"], ["communication", "pdCommunication"], ["price", "pdValueForMoney"],
            ] as const).map(([k, label]) => (
              <View key={k} style={{ marginBottom: 14 }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t(label)}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <TouchableOpacity key={v} onPress={() => setEvForm((p) => ({ ...p, [k]: v }))}>
                      <Feather name="star" size={26} color={v <= (evForm as any)[k] ? "#f59e0b" : colors.border} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("pdComment")}</Text>
            <TextInput style={[styles.input, styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={evForm.comment} onChangeText={(v) => setEvForm((p) => ({ ...p, comment: v }))} multiline placeholderTextColor={colors.mutedForeground} placeholder={t("pdReviewPlaceholder")} />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: "#f59e0b", opacity: submitting ? 0.7 : 1 }]} onPress={handleSubmitEvaluation} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t("pdSubmitEvaluation")}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Résilier reason modal */}
      <Modal visible={!!resilierTarget} animationType="fade" transparent onRequestClose={() => setResilierTarget(null)}>
        <View style={styles.centerOverlay}>
          <View style={[styles.reasonCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, marginBottom: 10 }]}>{t("pdTerminateContract")}</Text>
            <TextInput
              style={[styles.input, styles.textarea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder={t("pdTerminationReason")}
              placeholderTextColor={colors.mutedForeground}
              value={resilierReason}
              onChangeText={setResilierReason}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.smallBtn, { flex: 1, alignItems: "center", borderColor: colors.border }]} onPress={() => setResilierTarget(null)}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallBtn, { flex: 1, alignItems: "center", borderColor: "#ef4444", backgroundColor: "#ef444418", opacity: resilierReason.trim() ? 1 : 0.5 }]}
                onPress={handleConfirmResilier}
                disabled={!resilierReason.trim() || submitting}
              >
                <Text style={{ color: "#ef4444", fontFamily: "Inter_700Bold" }}>{t("pdTerminate")}</Text>
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
