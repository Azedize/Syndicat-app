import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { auth as authApi } from "@/services/api";

/**
 * Mandatory password change for accounts created with a temporary password
 * (invitations). The API rejects every other authenticated request with
 * PASSWORD_CHANGE_REQUIRED until this succeeds; the server then revokes all
 * sessions, so the user signs in again with the new password.
 */
export default function ChangePasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !!oldPwd && newPwd.length >= 8 && newPwd === confirmPwd && !submitting;

  const submit = async () => {
    if (newPwd !== confirmPwd) {
      showToast({ type: "error", title: t("error"), message: t("profilePasswordsMismatch") });
      return;
    }
    if (newPwd.length < 8) {
      showToast({ type: "error", title: t("error"), message: t("profilePasswordMinLength") });
      return;
    }
    setSubmitting(true);
    try {
      await authApi.changePassword(oldPwd, newPwd);
      showToast({
        type: "success",
        title: t("profilePasswordChanged"),
        message: t("profilePasswordChangedMessage"),
      });
      await logout();
      router.replace("/login");
    } catch {
      showToast({ type: "error", title: t("error"), message: t("profilePasswordChangeError") });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
        ]}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        placeholder="••••••••"
        placeholderTextColor={colors.mutedForeground}
      />
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.foreground }]}>
        {t("profilePasswordChange")}
      </Text>
      <View style={[styles.notice, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
        <Feather name="shield" size={16} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.primary }]}>
          {t("passwordChangeRequiredNotice")}
        </Text>
      </View>
      {field(t("profileCurrentPassword"), oldPwd, setOldPwd)}
      {field(t("profileNewPassword"), newPwd, setNewPwd)}
      {field(t("profileConfirmPassword"), confirmPwd, setConfirmPwd)}
      {confirmPwd && confirmPwd !== newPwd ? (
        <Text style={{ color: colors.destructive }}>{t("profilePasswordsMismatch")}</Text>
      ) : null}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: canSubmit ? colors.primary : colors.muted }]}
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, { color: canSubmit ? "#fff" : colors.mutedForeground }]}>
            {t("profileConfirmChange")}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={logout} style={styles.logout} accessibilityRole="button">
        <Text style={{ color: colors.mutedForeground }}>{t("logout")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 16, maxWidth: 480, width: "100%", alignSelf: "center" },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  button: { paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  buttonText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  logout: { alignItems: "center", paddingVertical: 12 },
});
