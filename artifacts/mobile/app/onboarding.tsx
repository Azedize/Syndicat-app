import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AuthHero, { AUTH_HERO_OVERLAP } from "@/components/brand/AuthHero";
import { Button, Card, TextField } from "@/components/ui";
import { RADIUS, SPACING } from "@/constants/spacing";
import { FONT, TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";
import { auth as authApi } from "@/services/api";
import { Feather } from "@expo/vector-icons";

/** Must match the version shown and recorded by app/cgu.tsx. */
const CGU_VERSION = "2026-10-21";
const STEPS = 3;

/**
 * Complete my profile — every step is saved on the server before moving on:
 *  1. name + phone            → PUT /profile
 *  2. profession (optional)   → PUT /profile
 *  3. acceptance of the CGU   → POST /me/terms-acceptances
 * The former version asked for an employer, a sector and a seniority (fields
 * of a trade-union membership form), stored nothing, and still announced
 * « Profil complété ».
 */
export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { t, isRTL } = useLanguage();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profession, setProfession] = useState(user?.profession ?? "");
  const [accept, setAccept] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneOk = /^\+?[0-9 ().-]{8,20}$/.test(phone.trim());

  const saveAndNext = async () => {
    setError(null);
    if (step === 1 && (!name.trim() || !phoneOk)) {
      setError(!name.trim() ? t("fullNameRequired") : t("onbPhoneInvalid"));
      return;
    }
    if (step === 3 && !accept) {
      setError(t("termsRequiredMsg"));
      return;
    }
    setSaving(true);
    try {
      if (step === 1) {
        const r = await authApi.updateProfile({ name: name.trim(), phone: phone.trim() });
        updateUser({ name: r.data.name, phone: r.data.phone ?? undefined });
      } else if (step === 2) {
        if (profession.trim() !== (user?.profession ?? "")) {
          const r = await authApi.updateProfile({ profession: profession.trim() });
          updateUser({ profession: r.data.profession ?? undefined });
        }
      } else {
        await apiRequest("/me/terms-acceptances", "POST", { document: "cgu", version: CGU_VERSION });
      }
      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
      if (step < STEPS) {
        setStep(step + 1);
      } else {
        showToast({ type: "success", title: t("profileCompletedTitle"), message: t("onbSavedMsg") });
        router.replace("/(tabs)/" as any);
      }
    } catch (e: any) {
      setError(e?.message ?? t("uiActionFailed"));
    } finally {
      setSaving(false);
    }
  };

  const titles = [t("onbStepIdentity"), t("onbStepProfession"), t("onbStepTerms")];

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACING.LG, paddingBottom: insets.bottom + 32, gap: SPACING.LG }} keyboardShouldPersistTaps="handled">
        <AuthHero
          icon="user-check"
          title={t("onbTitle")}
          subtitle={t("onbStepCounter").replace("{n}", String(step)).replace("{total}", String(STEPS)) + " · " + titles[step - 1]}
          bleed={SPACING.LG}
          onBack={() => (step > 1 ? setStep(step - 1) : router.replace("/(tabs)/" as any))}
        />

        <View style={[styles.progress, { backgroundColor: colors.surfaceMuted, marginTop: -AUTH_HERO_OVERLAP - SPACING.LG + 8 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS, now: step }}>
          <View style={[styles.progressFill, { width: `${(step / STEPS) * 100}%`, backgroundColor: colors.gold }]} />
        </View>

        <Card padding="lg" elevation="raised" style={{ gap: SPACING.LG }}>
          {step === 1 ? (
            <>
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("onbIdentityDesc")}</Text>
              <TextField label={t("nomComplet")} required value={name} onChangeText={setName} autoCapitalize="words" />
              <TextField label={t("phone")} required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+212 6XX XX XX XX" />
            </>
          ) : step === 2 ? (
            <>
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("onbProfessionDesc")}</Text>
              <TextField label={t("profileProfession")} value={profession} onChangeText={setProfession} />
            </>
          ) : (
            <>
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("onbTermsDesc")}</Text>
              <Pressable
                onPress={() => setAccept(!accept)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: accept }}
                style={[styles.check, { borderColor: accept ? colors.primary : colors.border, backgroundColor: accept ? colors.primarySoft : colors.card }]}
              >
                <View style={[styles.box, { borderColor: accept ? colors.primary : colors.borderStrong, backgroundColor: accept ? colors.primary : "transparent" }]}>
                  {accept ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
                </View>
                <Text style={[styles.checkText, { color: colors.foreground }]}>
                  {t("onbAcceptPrefix")}{" "}
                  <Text style={{ color: colors.tint }} onPress={() => router.push("/cgu" as any)} accessibilityRole="link">
                    {t("gsLegalTerms")}
                  </Text>
                </Text>
              </Pressable>
            </>
          )}

          {error ? (
            <View style={[styles.error, { backgroundColor: colors.dangerSoft }]} accessibilityLiveRegion="polite">
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={[TYPE.secondary, { color: colors.dangerText, flex: 1 }]}>{error}</Text>
            </View>
          ) : null}

          <Button
            label={step < STEPS ? t("onbSaveContinue") : t("onbFinish")}
            size="lg"
            fullWidth
            loading={saving}
            trailingIcon={isRTL ? "arrow-left" : "arrow-right"}
            onPress={saveAndNext}
          />
          {step === 2 ? <Button label={t("onbSkip")} variant="ghost" onPress={() => setStep(3)} /> : null}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progress: { height: 6, borderRadius: 3, overflow: "hidden", marginHorizontal: SPACING.XL },
  progressFill: { height: 6, borderRadius: 3 },
  check: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: RADIUS.MD, borderWidth: 1 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkText: { flex: 1, fontFamily: FONT.regular, fontSize: 14, lineHeight: 20 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: RADIUS.MD },
});
