import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "@/components/ScreenHeader";
import { Button, Card, TextField } from "@/components/ui";
import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

/**
 * Confirm / change my e-mail address. The new address is adopted only once
 * the code sent to it is typed back (POST /me/email-change/confirm); the
 * server moves the linked owner / tenant records in the same transaction and
 * the session is then renewed so it carries the new address.
 */
export default function EmailChangeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, refreshSession } = useAuth();
  const { t, isRTL } = useLanguage();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const undeliverable = user?.emailStatus === "undeliverable";

  const request = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest("/me/email-change/request", "POST", { email: email.trim() });
      setStep("code");
    } catch (e: any) {
      setError(e?.message ?? t("uiActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest("/me/email-change/confirm", "POST", { email: email.trim(), code: code.trim() });
      await refreshSession();
      showToast({ type: "success", title: t("emcDoneTitle"), message: t("emcDoneMsg") });
      router.back();
    } catch (e: any) {
      setError(e?.message ?? t("uiActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScreenHeader title={t("emcTitle")} subtitle={user?.email} />
      <ScrollView contentContainerStyle={{ padding: SPACING.LG, gap: SPACING.LG, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {undeliverable ? (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft, borderColor: colors.warning + "55" }]}>
            <Feather name="mail" size={18} color={colors.warning} />
            <Text style={[TYPE.secondary, { color: colors.warningText, flex: 1 }]}>{t("emcUndeliverableNotice")}</Text>
          </View>
        ) : null}

        <Card padding="lg" elevation="raised" style={{ gap: SPACING.LG }}>
          {step === "email" ? (
            <>
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("emcEmailDesc")}</Text>
              <TextField
                label={t("emcNewEmail")}
                required
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="prenom.nom@exemple.ma"
              />
              <Button label={t("emcSendCode")} size="lg" fullWidth loading={busy} disabled={!email.includes("@")} onPress={request} />
            </>
          ) : (
            <>
              <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{t("emcCodeDesc").replace("{email}", email.trim())}</Text>
              <TextField
                label={t("emcCode")}
                required
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
              />
              <Button label={t("emcConfirm")} size="lg" fullWidth loading={busy} disabled={code.length !== 6} onPress={confirm} />
              <Button label={t("emcChangeAddress")} variant="ghost" onPress={() => { setStep("email"); setCode(""); setError(null); }} />
            </>
          )}

          {error ? (
            <View style={[styles.error, { backgroundColor: colors.dangerSoft }]} accessibilityLiveRegion="polite">
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={[TYPE.secondary, { color: colors.dangerText, flex: 1 }]}>{error}</Text>
            </View>
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: RADIUS.MD, borderWidth: 1, alignItems: "flex-start" },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: RADIUS.MD },
});
