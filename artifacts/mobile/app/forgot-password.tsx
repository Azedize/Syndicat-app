import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth as authApi } from "@/services/api";
import { useColors } from "@/hooks/useColors";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Veuillez saisir votre adresse email.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setError("Adresse email invalide.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await authApi.forgotPassword(trimmed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch {
      // Still show success — the API always returns 200 to prevent enumeration
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="lock" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>Mot de passe oublié</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Saisissez votre email et nous vous enverrons un lien de réinitialisation.
            </Text>
          </View>

          {!sent ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.foreground }]}>Adresse email</Text>
                <View
                  style={[
                    styles.inputWrap,
                    { backgroundColor: colors.background, borderColor: error ? colors.destructive : colors.border },
                  ]}
                >
                  <Feather name="mail" size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setError(""); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    placeholder="votre@email.com"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="send"
                    onSubmitEditing={handleSubmit}
                  />
                </View>
              </View>

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.destructive + "12" }]}>
                  <Feather name="alert-circle" size={14} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: loading ? colors.primary + "80" : colors.primary },
                ]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#fff" />
                    <Text style={styles.submitBtnText}>Envoyer le lien</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={() => router.push("/reset-password")}
              >
                <Text style={[styles.secondaryText, { color: colors.mutedForeground }]}>
                  Vous avez déjà un code ?{" "}
                  <Text style={{ color: colors.primary }}>Réinitialiser avec le code</Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.card, styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.successIcon, { backgroundColor: "#10b98118" }]}>
                <Feather name="check-circle" size={40} color="#10b981" />
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>Email envoyé !</Text>
              <Text style={[styles.successText, { color: colors.mutedForeground }]}>
                Si l'adresse {email} est associée à un compte SYNDYCAT, vous recevrez un email avec un lien de réinitialisation dans quelques minutes.
              </Text>
              <Text style={[styles.successHint, { color: colors.mutedForeground }]}>
                Vérifiez aussi vos spams.
              </Text>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/reset-password")}
              >
                <Feather name="key" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>Saisir mon code de réinitialisation</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, styles.outlineBtn, { borderColor: colors.border }]}
                onPress={() => router.back()}
              >
                <Feather name="arrow-left" size={16} color={colors.foreground} />
                <Text style={[styles.submitBtnText, { color: colors.foreground }]}>Retour à la connexion</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
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
  outlineBtn: { backgroundColor: "transparent", borderWidth: 1 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  secondaryLink: { alignItems: "center", paddingVertical: 4 },
  secondaryText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
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
  successText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  successHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: -6 },
});
