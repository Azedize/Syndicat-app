/**
 * MemberDocumentRequest — Simplified document request flow for members & tenants.
 *
 * Unlike the admin DocumentWizard (7 steps, full entity pickers), this component
 * is optimised for non-admin users:
 *  1. Pick a document type (category → template)
 *  2. Confirm auto-filled personal data (name, lot, syndicate)
 *  3. Add an optional note / reason
 *  4. Submit → server creates the PDF in "pending_review" and notifies the admin
 *
 * All DB-sourced fields are pre-resolved server-side; the member never has to type
 * data that already exists.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

// ─── Template catalog — full list with role restrictions ──────────────────────
const ALL_TEMPLATES = [
  {
    id: "attestation_residence",
    labelKey: "mdrTemplateResidence",
    icon: "home" as const,
    color: "#0891b2",
    category: "attestation",
    descKey: "mdrTemplateResidenceDesc",
    autoFilledKey: "mdrTemplateResidenceAuto",
    allowedRoles: ["member", "tenant"],
    requiresBalance: false,
  },
  {
    id: "attestation_propriete",
    labelKey: "mdrTemplateOwnership",
    icon: "key" as const,
    color: "#2563EB",
    category: "attestation",
    descKey: "mdrTemplateOwnershipDesc",
    autoFilledKey: "mdrTemplateOwnershipAuto",
    allowedRoles: ["member"],
    requiresBalance: false,
  },
  {
    id: "attestation_paiement",
    labelKey: "mdrTemplatePayment",
    icon: "check-circle" as const,
    color: "#16a34a",
    category: "attestation",
    descKey: "mdrTemplatePaymentDesc",
    autoFilledKey: "mdrTemplatePaymentAuto",
    allowedRoles: ["member"],
    requiresBalance: true,
  },
  {
    id: "attestation",
    labelKey: "mdrTemplateMembership",
    icon: "award" as const,
    color: "#8b5cf6",
    category: "attestation",
    descKey: "mdrTemplateMembershipDesc",
    autoFilledKey: "mdrTemplateMembershipAuto",
    allowedRoles: ["member"],
    requiresBalance: false,
  },
  {
    id: "rapport_financier",
    labelKey: "mdrTemplateFinancialReport",
    icon: "dollar-sign" as const,
    color: "#f59e0b",
    category: "finances",
    descKey: "mdrTemplateFinancialReportDesc",
    autoFilledKey: "mdrTemplateFinancialReportAuto",
    allowedRoles: ["member"],
    requiresBalance: false,
  },
  {
    id: "demande_administrative",
    labelKey: "mdrTemplateAdministrative",
    icon: "send" as const,
    color: "#0284c7",
    category: "reglements",
    descKey: "mdrTemplateAdministrativeDesc",
    autoFilledKey: "mdrTemplateAdministrativeAuto",
    allowedRoles: ["member", "tenant"],
    requiresBalance: false,
  },
  {
    id: "decompte_charges",
    labelKey: "mdrTemplateCharges",
    icon: "bar-chart-2" as const,
    color: "#f59e0b",
    category: "finances",
    descKey: "mdrTemplateChargesDesc",
    autoFilledKey: "mdrTemplateChargesAuto",
    allowedRoles: ["member"],
    requiresBalance: false,
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: (docId?: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MemberDocumentRequest({ visible, onClose, onComplete }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // Role-filtered template list — tenants see less, members see more
  const role = user?.role ?? "member";
  const MEMBER_TEMPLATES = ALL_TEMPLATES.filter((t) => t.allowedRoles.includes(role));

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTpl, setSelectedTpl] = useState<typeof ALL_TEMPLATES[0] | null>(null);
  const [note, setNote] = useState("");
  const [periode, setPeriode] = useState("");
  const [objet, setObjet] = useState("");
  const [autofill, setAutofill] = useState<{
    memberName?: string | null;
    lotNumber?: string | null;
    buildingName?: string | null;
    syndicateName?: string | null;
  } | null>(null);
  const [autofillLoading, setAutofillLoading] = useState(false);
  // Payment cert eligibility check
  const [paymentCheck, setPaymentCheck] = useState<{
    eligible: boolean;
    blockedReason: string | null;
    totalPaid: number;
    remainingBalance: number;
    overdueCount: number;
    lastPaymentDate: string | null;
  } | null>(null);
  const [paymentCheckLoading, setPaymentCheckLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedDocId, setSubmittedDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepAnim = useRef(new Animated.Value(1)).current;

  const animateStep = useCallback(() => {
    stepAnim.setValue(0);
    Animated.spring(stepAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, [stepAnim]);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setStep(1);
      setSelectedTpl(null);
      setNote("");
      setPeriode("");
      setObjet("");
      setAutofill(null);
      setPaymentCheck(null);
      setPaymentCheckLoading(false);
      setSubmitting(false);
      setSubmitted(false);
      setSubmittedDocId(null);
      setError(null);
    }
  }, [visible]);

  // Load autofill + optional payment check when template selected
  const handleSelectTemplate = async (tpl: typeof ALL_TEMPLATES[0]) => {
    setSelectedTpl(tpl);
    setAutofillLoading(true);
    setPaymentCheck(null);
    setPaymentCheckLoading(tpl.requiresBalance);
    animateStep();
    setStep(2);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { documents: docsApi } = await import("@/services/api");
      // Run autofill and (if needed) payment cert check in parallel
      const loads: Promise<any>[] = [docsApi.autofill()];
      if (tpl.requiresBalance) loads.push(docsApi.paymentCertificateCheck());
      const [autofillRes, payRes] = await Promise.all(loads);
      const mi = autofillRes.data.memberInfo;
      const si = autofillRes.data.syndicateInfo;
      const pi = autofillRes.data.propertyInfo;
      setAutofill({
        memberName:    mi.member_name,
        lotNumber:     mi.lot_number,
        buildingName:  pi?.building_name ?? null,
        syndicateName: si.syndicate_name,
      });
      if (payRes) setPaymentCheck(payRes.data);
    } catch {
      setAutofill({});
    } finally {
      setAutofillLoading(false);
      setPaymentCheckLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedTpl || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { documents: docsApi } = await import("@/services/api");
      const res = await docsApi.request({
        templateId: selectedTpl.id,
        category:   selectedTpl.category as any,
        note:       note.trim() || undefined,
        periode:    periode.trim() || undefined,
        objet:      objet.trim() || undefined,
      });
      const docId = (res as any)?.data?.id ?? null;
      setSubmittedDocId(docId);
      setSubmitted(true);
      setStep(3);
      animateStep();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(t("mdrSubmitError"));
    } finally {
      setSubmitting(false);
    }
  };

  const needsPeriode = ["attestation_paiement", "attestation_residence", "decompte_charges"].includes(selectedTpl?.id ?? "");
  const needsObjet   = ["demande_administrative"].includes(selectedTpl?.id ?? "");
  const locale = ({ fr: "fr-MA", en: "en-US", ar: "ar-MA", es: "es-ES" } as const)[lang];
  const formatMad = (amount: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "MAD", maximumFractionDigits: 2 }).format(amount);
  const templateText = (key: string) => t(key);
  const selectedLabel = selectedTpl ? templateText(selectedTpl.labelKey) : "";
  const selectedDescription = selectedTpl ? templateText(selectedTpl.descKey) : "";

  const s = styles(colors);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.container, { paddingTop: topPad }]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t("mdrTitle")}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Step indicators */}
        <View style={s.stepsRow}>
          {[t("mdrStepTemplate"), t("mdrStepConfirm"), t("mdrStepSent")].map((label, i) => (
            <View key={i} style={s.stepItem}>
              <View style={[s.stepDot, {
                backgroundColor: step > i + 1 ? "#10b981" : step === i + 1 ? colors.primary : colors.border,
              }]}>
                {step > i + 1
                  ? <Feather name="check" size={10} color="#fff" />
                  : <Text style={[s.stepNum, { color: step === i + 1 ? "#fff" : colors.mutedForeground }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[s.stepLabel, { color: step === i + 1 ? colors.foreground : colors.mutedForeground }]}>{label}</Text>
            </View>
          ))}
        </View>

        <Animated.View style={{ flex: 1, opacity: stepAnim, transform: [{ scale: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }}>

          {/* ── Step 1: Choose template ────────────────────────────────── */}
          {step === 1 && (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}>
              <Text style={[s.stepTitle, { color: colors.foreground }]}>{t("mdrChooseTitle")}</Text>
              <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
                {role === "tenant"
                  ? t("mdrTenantDescription")
                  : t("mdrMemberDescription")}
              </Text>

              <View style={[s.autofillBanner, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
                <Feather name="zap" size={14} color="#10b981" />
                <Text style={{ fontSize: 12, color: "#10b981", flex: 1, lineHeight: 18 }}>
                  <Text style={{ fontWeight: "700" }}>{t("mdrAutofillEnabled")}</Text>
                  {" "}{t("mdrAutofillDescription")}
                </Text>
              </View>

              {MEMBER_TEMPLATES.length === 0 ? (
                <View style={[s.autofillBanner, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b30" }]}>
                  <Feather name="info" size={14} color="#f59e0b" />
                  <Text style={{ fontSize: 12, color: "#f59e0b", flex: 1, lineHeight: 18 }}>
                    {t("mdrNoTemplates")}
                  </Text>
                </View>
              ) : (
                MEMBER_TEMPLATES.map((tpl) => (
                  <TouchableOpacity
                    key={tpl.id}
                    style={[s.tplCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handleSelectTemplate(tpl)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.tplIconWrap, { backgroundColor: tpl.color + "18" }]}>
                      <Feather name={tpl.icon} size={22} color={tpl.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[s.tplName, { color: colors.foreground }]}>{templateText(tpl.labelKey)}</Text>
                        {tpl.requiresBalance && (
                          <View style={{ backgroundColor: "#f59e0b18", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: "#f59e0b" }}>{t("mdrBalanceCheck")}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.tplDesc, { color: colors.mutedForeground }]}>{templateText(tpl.descKey)}</Text>
                      <View style={[s.autoChip, { backgroundColor: tpl.color + "12", marginTop: 6 }]}>
                        <Feather name="database" size={10} color={tpl.color} />
                        <Text style={[s.autoChipText, { color: tpl.color }]}>{templateText(tpl.autoFilledKey)}</Text>
                      </View>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}

          {/* ── Step 2: Confirm + optional fields ────────────────────────── */}
          {step === 2 && selectedTpl && (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
              {/* Template banner */}
              <View style={[s.templateBanner, { backgroundColor: selectedTpl.color + "10", borderColor: selectedTpl.color + "25" }]}>
                <View style={[s.tplIconWrap, { backgroundColor: selectedTpl.color + "20" }]}>
                  <Feather name={selectedTpl.icon} size={20} color={selectedTpl.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tplName, { color: selectedTpl.color }]}>{selectedLabel}</Text>
                  <Text style={[s.tplDesc, { color: colors.mutedForeground }]}>{selectedDescription}</Text>
                </View>
              </View>

              {/* Auto-filled data card */}
              <View style={[s.dataCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[s.dataCardHeader, { borderBottomColor: colors.border }]}>
                  <Feather name="database" size={14} color="#10b981" />
                  <Text style={[s.dataCardTitle, { color: colors.foreground }]}>{t("mdrAutofillTitle")}</Text>
                  {autofillLoading && <ActivityIndicator size="small" color="#10b981" />}
                </View>

                {autofillLoading ? (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={[s.tplDesc, { color: colors.mutedForeground }]}>{t("mdrAutofillLoading")}</Text>
                  </View>
                ) : (
                  <View style={{ padding: 14, gap: 10 }}>
                    {[
                       { icon: "user" as const, label: t("mdrName"), value: autofill?.memberName ?? user?.name ?? "—" },
                       { icon: "home" as const, label: t("mdrLot"), value: autofill?.lotNumber ? `${t("mdrLot")} ${autofill.lotNumber}` : "—" },
                       { icon: "layers" as const, label: t("mdrBuilding"), value: autofill?.buildingName ?? "—" },
                       { icon: "shield" as const, label: t("mdrSyndicate"), value: autofill?.syndicateName ?? "—" },
                    ].map((row) => (
                      <View key={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#10b98115", alignItems: "center", justifyContent: "center" }}>
                          <Feather name={row.icon} size={13} color="#10b981" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.3, textTransform: "uppercase" }}>{row.label}</Text>
                          <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "600" }}>{row.value}</Text>
                        </View>
                        <View style={[s.autoChip, { backgroundColor: "#10b98110" }]}>
                          <Feather name="check" size={9} color="#10b981" />
                          <Text style={[s.autoChipText, { color: "#10b981" }]}>{t("mdrAuto")}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* ── Payment cert eligibility status ── */}
              {selectedTpl?.requiresBalance && (
                paymentCheckLoading ? (
                  <View style={[s.autofillBanner, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b30" }]}>
                    <ActivityIndicator size="small" color="#f59e0b" />
                    <Text style={{ fontSize: 12, color: "#f59e0b", flex: 1 }}>{t("mdrBalanceChecking")}</Text>
                  </View>
                ) : paymentCheck ? (
                  paymentCheck.eligible ? (
                    <View style={[s.autofillBanner, { backgroundColor: "#10b98110", borderColor: "#10b98130" }]}>
                      <Feather name="check-circle" size={14} color="#10b981" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: "#10b981", fontWeight: "700" }}>{t("mdrBalanceCurrent")} ✓</Text>
                        <Text style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>
                          {t("mdrTotalPaid")}: {formatMad(paymentCheck.totalPaid)}
                          {paymentCheck.lastPaymentDate ? `  •  ${t("mdrLastPayment")}: ${paymentCheck.lastPaymentDate}` : ""}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={[s.autofillBanner, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}>
                      <Feather name="alert-octagon" size={14} color="#ef4444" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: "#ef4444", fontWeight: "700" }}>{t("mdrCertificateBlocked")}</Text>
                        <Text style={{ fontSize: 11, color: "#ef4444", marginTop: 2, lineHeight: 16 }}>
                          {paymentCheck.blockedReason}
                        </Text>
                        {paymentCheck.overdueCount > 0 && (
                          <Text style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
                            {paymentCheck.overdueCount} {t("mdrUnpaidCalls")}  •  {t("mdrBalanceDue")}: {formatMad(paymentCheck.remainingBalance)}
                          </Text>
                        )}
                      </View>
                    </View>
                  )
                ) : null
              )}

              {/* Optional fields */}
              {needsPeriode && (
                <View>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>{t("mdrPeriod")} <Text style={{ color: colors.mutedForeground }}>({t("mdrOptional")})</Text></Text>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                     placeholder={t("mdrPeriodPlaceholder")}
                    placeholderTextColor={colors.mutedForeground}
                    value={periode}
                    onChangeText={setPeriode}
                  />
                </View>
              )}

              {needsObjet && (
                <View>
                  <Text style={[s.fieldLabel, { color: colors.foreground }]}>{t("mdrRequestSubject")} <Text style={{ color: "#ef4444" }}>*</Text></Text>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                     placeholder={t("mdrRequestSubjectPlaceholder")}
                    placeholderTextColor={colors.mutedForeground}
                    value={objet}
                    onChangeText={setObjet}
                  />
                </View>
              )}

              <View>
                <Text style={[s.fieldLabel, { color: colors.foreground }]}>{t("mdrNoteReason")} <Text style={{ color: colors.mutedForeground }}>({t("mdrOptional")})</Text></Text>
                <TextInput
                  style={[s.input, s.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  placeholder={t("mdrNotePlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Info about review */}
              <View style={[s.autofillBanner, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b30" }]}>
                <Feather name="info" size={14} color="#f59e0b" />
                <Text style={{ fontSize: 12, color: "#f59e0b", flex: 1, lineHeight: 18 }}>
                  {t("mdrReviewNotice")}
                </Text>
              </View>

              {error && (
                <View style={[s.autofillBanner, { backgroundColor: "#ef444410", borderColor: "#ef444430" }]}>
                  <Feather name="alert-circle" size={14} color="#ef4444" />
                  <Text style={{ fontSize: 12, color: "#ef4444", flex: 1 }}>{error}</Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* ── Step 3: Success ─────────────────────────────────────────── */}
          {step === 3 && (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 20 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "#10b98120", alignItems: "center", justifyContent: "center" }}>
                <Feather name="check-circle" size={44} color="#10b981" />
              </View>
              <Text style={[s.stepTitle, { color: colors.foreground, textAlign: "center" }]}>{t("mdrSubmittedTitle")}</Text>
              <Text style={[s.stepSubtitle, { color: colors.mutedForeground, textAlign: "center", lineHeight: 22 }]}>
                 {t("mdrSubmittedDescription")}
              </Text>
              <View style={[s.dataCard, { backgroundColor: colors.card, borderColor: colors.border, width: "100%" }]}>
                <View style={{ padding: 14, gap: 6 }}>
                   <Text style={{ fontSize: 11, color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("mdrRequestedDocument")}</Text>
                   <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{selectedLabel}</Text>
                  <View style={[s.autoChip, { backgroundColor: "#f59e0b10" }]}>
                    <Feather name="clock" size={10} color="#f59e0b" />
                     <Text style={[s.autoChipText, { color: "#f59e0b" }]}>{t("mdrPendingValidation")}</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: colors.primary }]}
                onPress={() => onComplete(submittedDocId ?? undefined)}
                activeOpacity={0.85}
              >
                 <Text style={s.submitBtnText}>{t("mdrViewDocuments")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* Bottom action bar */}
        {step === 2 && (
          <View style={[s.bottomBar, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
            <TouchableOpacity style={s.backBtn} onPress={() => { setStep(1); animateStep(); }} activeOpacity={0.7}>
              <Feather name="arrow-left" size={18} color={colors.foreground} />
            </TouchableOpacity>
            {/* Block submit if payment cert is NOT eligible */}
            {selectedTpl?.requiresBalance && paymentCheck && !paymentCheck.eligible ? (
              <View style={[s.submitBtn, { flex: 1, backgroundColor: "#ef444425", borderWidth: 1, borderColor: "#ef4444" }]}>
                <Feather name="lock" size={14} color="#ef4444" />
                <Text style={[s.submitBtnText, { color: "#ef4444" }]}>{t("mdrSettleBalance")}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.submitBtn, { flex: 1, backgroundColor: submitting ? colors.border : (selectedTpl?.color ?? colors.primary) }]}
                onPress={handleSubmit}
                disabled={submitting || (needsObjet && !objet.trim()) || autofillLoading}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#fff" />
                    <Text style={s.submitBtnText}>{t("mdrSubmit")}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(colors: ReturnType<typeof import("@/hooks/useColors").useColors>) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: colors.background },
    header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle:   { fontSize: 17, fontWeight: "700" },
    closeBtn:      { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.muted },
    stepsRow:      { flexDirection: "row", padding: 16, paddingTop: 12, gap: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
    stepItem:      { flex: 1, alignItems: "center", gap: 4 },
    stepDot:       { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    stepNum:       { fontSize: 11, fontWeight: "700" },
    stepLabel:     { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
    stepTitle:     { fontSize: 18, fontWeight: "700", lineHeight: 24 },
    stepSubtitle:  { fontSize: 13, lineHeight: 20 },
    autofillBanner:{ flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
    tplCard:       { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 14, padding: 14 },
    tplIconWrap:   { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    tplName:       { fontSize: 14, fontWeight: "700", marginBottom: 2 },
    tplDesc:       { fontSize: 12, lineHeight: 17 },
    autoChip:      { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    autoChipText:  { fontSize: 10, fontWeight: "700" },
    templateBanner:{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
    dataCard:      { borderWidth: 1, borderRadius: 14, overflow: "hidden" },
    dataCardHeader:{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1 },
    dataCardTitle: { fontSize: 12, fontWeight: "700", flex: 1, textTransform: "uppercase", letterSpacing: 0.4 },
    fieldLabel:    { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    input:         { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
    textarea:      { minHeight: 80 },
    bottomBar:     { padding: 16, borderTopWidth: 1, flexDirection: "row", gap: 10 },
    backBtn:       { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    submitBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14 },
    submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  });
}
