import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth as authApi } from "@/services/api";
import MizanFormField from "@/components/MizanFormField";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useLanguage();
  const params = useLocalSearchParams<{ token?: string }>();

  const [token, setToken] = useState(params.token ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const validate = () => {
    if (!token.trim()) return t("codeRequired");
    if (token.trim().length !== 64) return t("codeLength");
    if (!newPassword) return t("newPasswordRequired");
    if (newPassword.length < 8) return t("newPasswordTooShort");
    if (newPassword !== confirmPassword) return t("passwordsMismatch");
    return null;
  };

  const getPasswordStrength = () => {
    const pw = newPassword;
    if (!pw) return null;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1)
      return { label: t("passwordWeak"), color: "#ef4444", width: "25%" };
    if (score <= 2)
      return { label: t("passwordMedium"), color: "#f59e0b", width: "50%" };
    if (score <= 3)
      return { label: t("passwordGood"), color: "#3b82f6", width: "75%" };
    return { label: t("passwordExcellent"), color: "#10b981", width: "100%" };
  };

  const strength = getPasswordStrength();

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError("");
    try {
      await authApi.resetPassword(token.trim(), newPassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (err: any) {
      setError(t("resetPasswordError"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
    >
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        bottomOffset={24}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity
          style={[
            styles.backBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("back")}
        >
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={20}
            color={colors.foreground}
          />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: colors.success + "18" },
            ]}
          >
            <Feather name="key" size={32} color={colors.success} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {t("resetPasswordTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {t("resetPasswordSubtitle")}
          </Text>
        </View>

        {!success ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {/* Token */}
            <MizanFormField
              label={t("resetCodeLabel")}
              icon="hash"
              focused={focusedField === "token"}
              error={
                error === t("codeRequired") || error === t("codeLength")
                  ? error
                  : undefined
              }
            >
              <TextInput
                style={[
                  styles.input,
                  styles.tokenInput,
                  { color: colors.foreground },
                ]}
                value={token}
                onChangeText={(v) => {
                  setToken(v);
                  setError("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("pasteCodePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                onFocus={() => setFocusedField("token")}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
                onSubmitEditing={() => newPasswordRef.current?.focus()}
                accessibilityLabel={t("resetCodeLabel")}
              />
            </MizanFormField>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              {t("copyFromEmailHint")}
            </Text>

            {/* New password */}
            <MizanFormField
              label={t("newPasswordLabel")}
              icon="lock"
              focused={focusedField === "newPassword"}
              error={
                error === t("newPasswordRequired") ||
                error === t("newPasswordTooShort")
                  ? error
                  : undefined
              }
              trailing={
                <TouchableOpacity
                  onPress={() => setShowNew((p) => !p)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showNew ? t("hidePassword") : t("showPassword")
                  }
                >
                  <Feather
                    name={showNew ? "eye-off" : "eye"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              }
            >
              <TextInput
                ref={newPasswordRef}
                style={[styles.input, { color: colors.foreground }]}
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  setError("");
                }}
                secureTextEntry={!showNew}
                placeholder={t("minCharsPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                onFocus={() => setFocusedField("newPassword")}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                accessibilityLabel={t("newPasswordLabel")}
              />
            </MizanFormField>

            {/* Strength meter */}
            {strength ? (
              <View style={styles.strengthRow}>
                <View
                  style={[
                    styles.strengthBar,
                    { backgroundColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.strengthFill,
                      {
                        width: strength.width as any,
                        backgroundColor: strength.color,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>
                  {strength.label}
                </Text>
              </View>
            ) : null}

            {/* Confirm password */}
            <MizanFormField
              label={t("confirmPasswordLabel")}
              icon="lock"
              focused={focusedField === "confirmPassword"}
              error={
                error === t("passwordsMismatch")
                  ? error
                  : confirmPassword && confirmPassword !== newPassword
                    ? t("passwordsMismatch")
                    : undefined
              }
              trailing={
                <TouchableOpacity
                  onPress={() => setShowConfirm((p) => !p)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showConfirm ? t("hidePassword") : t("showPassword")
                  }
                >
                  <Feather
                    name={showConfirm ? "eye-off" : "eye"}
                    size={16}
                    color={colors.mutedForeground}
                  />
                </TouchableOpacity>
              }
            >
              <TextInput
                ref={confirmPasswordRef}
                style={[styles.input, { color: colors.foreground }]}
                value={confirmPassword}
                onChangeText={(v) => {
                  setConfirmPassword(v);
                  setError("");
                }}
                secureTextEntry={!showConfirm}
                placeholder={t("repeatPasswordPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => setFocusedField(null)}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel={t("confirmPasswordLabel")}
              />
            </MizanFormField>

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: colors.destructive + "12" },
                ]}
              >
                <Feather
                  name="alert-circle"
                  size={14}
                  color={colors.destructive}
                />
                <Text style={[styles.errorText, { color: colors.destructive }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: loading
                    ? colors.success + "80"
                    : colors.success,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t("resetPasswordBtn")}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather
                    name="check"
                    size={16}
                    color={colors.successForeground}
                  />
                  <Text style={styles.submitBtnText}>
                    {t("resetPasswordBtn")}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryLink}
              onPress={() => router.push("/forgot-password")}
              accessibilityRole="button"
              accessibilityLabel={t("requestNewLink")}
            >
              <Text
                style={[
                  styles.secondaryText,
                  { color: colors.mutedForeground },
                ]}
              >
                {t("noCode")}
                <Text style={{ color: colors.primary }}>
                  {t("requestNewLink")}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              styles.successCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.successIcon,
                { backgroundColor: colors.success + "18" },
              ]}
            >
              <Feather name="check-circle" size={44} color={colors.success} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              {t("passwordChangedTitle")}
            </Text>
            <Text
              style={[styles.successText, { color: colors.mutedForeground }]}
            >
              {t("passwordChangedMsg")}
            </Text>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/login" as any)}
              accessibilityRole="button"
              accessibilityLabel={t("resetLogin")}
            >
              <Feather
                name="log-in"
                size={16}
                color={colors.primaryForeground}
              />
              <Text style={styles.submitBtnText}>{t("resetLogin")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: 24, gap: 24 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  header: { alignItems: "center", gap: 12 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  card: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  input: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  tokenInput: { letterSpacing: 0.5 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular" },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 2 },
  strengthLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    minWidth: 60,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 15,
    gap: 8,
  },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  secondaryLink: { alignItems: "center", paddingVertical: 4 },
  secondaryText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  successCard: { alignItems: "center" },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  successText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
});
