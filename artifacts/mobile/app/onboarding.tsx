import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import MizanLogo from "@/components/brand/MizanLogo";

const TOTAL_STEPS = 4;

const CITIES = ["Casablanca", "Rabat", "Marrakech", "Fès", "Agadir", "Tanger", "Meknès", "Oujda", "Kénitra", "Tétouan", "Salé", "Safi", "El Jadida", "Autre"];
const SECTORS = ["Éducation", "Santé", "Administration publique", "Industrie", "Commerce", "Banque & Finance", "Ingénierie", "Juridique", "Autre"];
const SENIORITY = ["< 2 ans", "2 – 5 ans", "5 – 10 ans", "10 – 20 ans", "> 20 ans"];

const AVATAR_COLORS = ["#2563EB", "#1E40AF", "#3B82F6", "#0A1628", "#10b981", "#f59e0b", "#06b6d4", "#60A5FA"];

const STEP_ICONS: Array<keyof typeof Feather.glyphMap> = ["user", "briefcase", "image", "check-circle"];
const STEP_LABEL_KEYS = ["onboardingStep1Title", "onboardingStep2Title", "onboardingStep3Title", "onboardingStep4Title"] as const;
const CITY_LABEL_KEYS: Record<string, string> = {
  Casablanca: "cityCasablanca", Rabat: "cityRabat", Marrakech: "cityMarrakech", "Fès": "cityFes",
  Agadir: "cityAgadir", Tanger: "cityTangier", "Meknès": "cityMeknes", Oujda: "cityOujda",
  Kénitra: "cityKenitra", Tétouan: "cityTetouan", Salé: "citySale", Safi: "citySafi",
  "El Jadida": "cityElJadida", Autre: "onboardingOther",
};
const SECTOR_LABEL_KEYS: Record<string, string> = {
  "Éducation": "onboardingSectorEducation", "Santé": "onboardingSectorHealth",
  "Administration publique": "onboardingSectorPublicAdmin", Industrie: "onboardingSectorIndustry",
  Commerce: "onboardingSectorCommerce", "Banque & Finance": "onboardingSectorBanking",
  Ingénierie: "onboardingSectorEngineering", Juridique: "onboardingSectorLegal", Autre: "onboardingOther",
};
const SENIORITY_LABEL_KEYS: Record<string, string> = {
  "< 2 ans": "onboardingSeniorityUnder2", "2 – 5 ans": "onboardingSeniority2to5",
  "5 – 10 ans": "onboardingSeniority5to10", "10 – 20 ans": "onboardingSeniority10to20",
  "> 20 ans": "onboardingSeniorityOver20",
};

interface FormState {
  fullName: string;
  phone: string;
  city: string;
  address: string;
  employer: string;
  sector: string;
  seniority: string;
  avatarColor: string;
  avatarInitials: string;
  acceptTerms: boolean;
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    fullName: user?.name ?? "",
    phone: user?.phone ?? "",
    city: "",
    address: "",
    employer: "",
    sector: "Éducation",
    seniority: "2 – 5 ans",
    avatarColor: "#2563EB",
    avatarInitials: (user?.name ?? "??").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
    acceptTerms: false,
  });

  const progress = (step / TOTAL_STEPS) * 100;

  const update = (field: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const validateStep = (): boolean => {
    if (step === 1) {
       if (!form.fullName.trim()) { Alert.alert(t("onboardingRequired"), t("fullNameRequired")); return false; }
       if (!form.phone.trim()) { Alert.alert(t("onboardingRequired"), t("phoneRequired")); return false; }
       if (!form.city) { Alert.alert(t("onboardingRequired"), t("cityRequired")); return false; }
      return true;
    }
    if (step === 2) {
       if (!form.employer.trim()) { Alert.alert(t("onboardingRequired"), t("employerRequired")); return false; }
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 1) setStep((s) => s - 1);
  };

  const handleFinish = () => {
    if (!form.acceptTerms) {
       Alert.alert(t("termsRequired"), t("termsRequiredMsg"));
      return;
    }
    updateUser({ name: form.fullName, phone: form.phone });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
     Alert.alert(t("profileCompletedTitle"), t("profileCompletedMsg"), [
       { text: t("accessApp"), onPress: () => router.replace("/(tabs)/" as any) },
    ]);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
               {t("onboardingStep1Desc")}
            </Text>
            <Field label={t("fullNameLabel")} colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                 placeholder={t("fullNamePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={form.fullName}
                onChangeText={(v) => { update("fullName", v); update("avatarInitials", v.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()); }}
              />
            </Field>
            <Field label={`${t("onboardingPhoneLabel")} *`} colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                 placeholder={t("phonePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={form.phone}
                onChangeText={(v) => update("phone", v)}
                keyboardType="phone-pad"
              />
            </Field>
            <Field label={t("addressLabel")} colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                 placeholder={t("addressPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={form.address}
                onChangeText={(v) => update("address", v)}
              />
            </Field>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("cityLabel")}</Text>
            <View style={styles.chipGrid}>
              {CITIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, { backgroundColor: form.city === c ? colors.primary : colors.muted, borderColor: form.city === c ? colors.primary : colors.border }]}
                  onPress={() => { update("city", c); Haptics.selectionAsync(); }}
                >
                   <Text style={[styles.chipText, { color: form.city === c ? "#fff" : colors.foreground }]}>{t(CITY_LABEL_KEYS[c] ?? c)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
               {t("onboardingStep2Desc")}
            </Text>
            <Field label={t("employerLabel")} colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                 placeholder={t("employerPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                value={form.employer}
                onChangeText={(v) => update("employer", v)}
              />
            </Field>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("sectorLabel")}</Text>
            <View style={styles.chipGrid}>
              {SECTORS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, { backgroundColor: form.sector === s ? colors.primary : colors.muted, borderColor: form.sector === s ? colors.primary : colors.border }]}
                  onPress={() => { update("sector", s); Haptics.selectionAsync(); }}
                >
                   <Text style={[styles.chipText, { color: form.sector === s ? "#fff" : colors.foreground }]}>{t(SECTOR_LABEL_KEYS[s] ?? s)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("seniorityLabel")}</Text>
            <View style={styles.seniorityRow}>
              {SENIORITY.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.seniorityChip, { backgroundColor: form.seniority === s ? colors.primary + "18" : colors.muted, borderColor: form.seniority === s ? colors.primary : colors.border }]}
                  onPress={() => { update("seniority", s); Haptics.selectionAsync(); }}
                >
                   <Text style={[styles.seniorityText, { color: form.seniority === s ? colors.primary : colors.mutedForeground }]}>{t(SENIORITY_LABEL_KEYS[s] ?? s)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
               {t("onboardingStep3Desc")}
            </Text>
            <View style={styles.avatarPreview}>
              <View style={[styles.avatarBig, { backgroundColor: form.avatarColor }]}>
                <Text style={styles.avatarBigText}>{form.avatarInitials || "??"}</Text>
              </View>
               <Text style={[styles.avatarName, { color: colors.foreground }]}>{form.fullName || t("onboardingYourName")}</Text>
               <Text style={[styles.avatarCity, { color: colors.mutedForeground }]}>{form.city ? t(CITY_LABEL_KEYS[form.city] ?? form.city) : t("onboardingCityUndefined")}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{t("onboardingAvatarColorLabel")}</Text>
            <View style={styles.colorGrid}>
              {AVATAR_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c, borderWidth: form.avatarColor === c ? 3 : 0, borderColor: "#fff" }]}
                  onPress={() => { update("avatarColor", c); Haptics.selectionAsync(); }}
                >
                  {form.avatarColor === c && <Feather name="check" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
               {t("onboardingStep4Desc")}
            </Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryAvatar}>
                <View style={[styles.avatarMedium, { backgroundColor: form.avatarColor }]}>
                  <Text style={styles.avatarMediumText}>{form.avatarInitials}</Text>
                </View>
                <View>
                  <Text style={[styles.summaryName, { color: colors.foreground }]}>{form.fullName}</Text>
                   <Text style={[styles.summaryRole, { color: colors.mutedForeground }]}>{user?.role === "syndicate_admin" ? t("onboardingRoleSyndicateAdmin") : t("onboardingRoleMember")}</Text>
                </View>
              </View>
              <View style={[styles.summarySep, { backgroundColor: colors.border }]} />
              {[
                 { icon: "phone" as const, label: t("onboardingPhoneLabel"), value: form.phone },
                 { icon: "map-pin" as const, label: t("cityLabel").replace(" *", ""), value: form.city ? t(CITY_LABEL_KEYS[form.city] ?? form.city) : "" },
                 { icon: "briefcase" as const, label: t("onboardingEmployerSummaryLabel"), value: form.employer },
                 { icon: "layers" as const, label: t("sectorLabel"), value: t(SECTOR_LABEL_KEYS[form.sector] ?? form.sector) },
                 { icon: "clock" as const, label: t("seniorityLabel"), value: t(SENIORITY_LABEL_KEYS[form.seniority] ?? form.seniority) },
              ].map(({ icon, label, value }, i) => (
                <View key={label}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                  <View style={styles.summaryRow}>
                    <View style={[styles.summaryIcon, { backgroundColor: colors.primary + "15" }]}>
                      <Feather name={icon} size={13} color={colors.primary} />
                    </View>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground }]} numberOfLines={1}>{value || "—"}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.termsRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { update("acceptTerms", !form.acceptTerms); Haptics.selectionAsync(); }}
            >
              <View style={[styles.checkbox, { backgroundColor: form.acceptTerms ? colors.primary : "transparent", borderColor: form.acceptTerms ? colors.primary : colors.mutedForeground }]}>
                {form.acceptTerms && <Feather name="check" size={12} color="#fff" />}
              </View>
               <Text style={[styles.termsText, { color: colors.foreground }]}>
                 {t("onboardingAcceptPrefix")}{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }} onPress={() => router.push("/cgu" as any)}>
                   {t("onboardingTermsLink")}
                </Text>{" "}
                 {t("onboardingAndPrivacy")}
              </Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {/* Brand mark */}
        <View style={styles.brandRow}>
          <MizanLogo
            variant="horizontal"
            colorScheme={isDark ? "dark" : "light"}
            size={28}
            showTagline={false}
          />
        </View>
        <View style={styles.headerTop}>
          {step > 1 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.replace("/(tabs)/" as any)} style={styles.backBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, alignItems: "center" }}>
             <Text style={[styles.title, { color: colors.foreground }]}>{t("onboardingProfileTitle")}</Text>
             <Text style={[styles.stepIndicator, { color: colors.mutedForeground }]}>{t("onboardingStepIndicator")} {step} / {TOTAL_STEPS}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: colors.primary }]} />
        </View>
        {/* Step tabs */}
        <View style={styles.stepTabs}>
           {STEP_LABEL_KEYS.map((key, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
               <View key={key} style={styles.stepTab}>
                <View style={[styles.stepCircle, { backgroundColor: done ? colors.primary : active ? colors.primary + "20" : colors.muted, borderColor: active ? colors.primary : "transparent", borderWidth: active ? 2 : 0 }]}>
                  {done ? (
                    <Feather name="check" size={12} color="#fff" />
                  ) : (
                    <Feather name={STEP_ICONS[i]} size={12} color={active ? colors.primary : colors.mutedForeground} />
                  )}
                </View>
                 <Text style={[styles.stepTabText, { color: active ? colors.primary : colors.mutedForeground }]}>{t(key)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>
           {[t("onboardingPersonalInfoTitle"), t("onboardingProfessionalInfoTitle"), t("onboardingPhotoTitle"), t("onboardingSummaryTitle")][step - 1]}
        </Text>
        {renderStep()}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={step === TOTAL_STEPS ? handleFinish : handleNext}
          activeOpacity={0.85}
        >
          {step === TOTAL_STEPS ? (
            <>
              <Feather name="check-circle" size={18} color="#fff" />
               <Text style={styles.nextBtnText}>{t("onboardingFinish")}</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextBtnText}>{t("onboardingContinue")}</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.skipText, { color: colors.mutedForeground }]} onPress={() => router.replace("/(tabs)/" as any)}>
           {t("onboardingSkip")}
        </Text>
      </View>
    </View>
  );
}

function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.fieldBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  brandRow: { alignItems: "center", paddingVertical: 4 },
  headerTop: { flexDirection: "row", alignItems: "center" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  stepIndicator: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  stepTabs: { flexDirection: "row", justifyContent: "space-between" },
  stepTab: { alignItems: "center", gap: 4, flex: 1 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepTabText: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  stepTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 16 },
  stepContent: { gap: 16 },
  stepDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  fieldBox: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 14, fontFamily: "Inter_400Regular" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  seniorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  seniorityChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  seniorityText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  avatarPreview: { alignItems: "center", gap: 10, paddingVertical: 20 },
  avatarBig: { width: 100, height: 100, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  avatarBigText: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff" },
  avatarName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  avatarCity: { fontSize: 13, fontFamily: "Inter_400Regular" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center", paddingVertical: 8 },
  colorDot: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  summaryCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  summaryAvatar: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  avatarMedium: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarMediumText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  summaryName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  summaryRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  summarySep: { height: 1, marginHorizontal: 16 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 },
  summaryIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  summaryLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: "50%" as any },
  sep: { height: 1, marginHorizontal: 14 },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  termsText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12, alignItems: "center" },
  nextBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  nextBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  skipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
