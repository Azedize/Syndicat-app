import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import MizanMark from "@/components/brand/MizanMark";
import { Button, IconButton, ZelligePattern } from "@/components/ui";
import { DURATION } from "@/constants/motion";
import { displayFace } from "@/constants/typography";
import MizanFormField from "@/components/MizanFormField";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { MIZAN } from "@/constants/brand";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { crossPlatformShadow } from "@/lib/shadow";
import { getApiBaseUrl } from "@/services/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ThemeToggleButton } from "@/components/theme/ThemeSwitcher";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t, isRTL, lang } = useLanguage();
  const { isDark, toggle } = useTheme();
  const colors = useColors();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) { setError(t("emailRequired")); return; }
    if (!password) { setError(t("passwordRequired")); return; }
    if (password.length < 6) { setError(t("passwordTooShort")); return; }
    
    setLoading(true);
    setError("");
    try {
      const ok = await login(email, password);
      if (!ok) {
        setError(t("invalidCredentials"));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)/" as any);
      }
    } catch (error: any) {
      const status = error?.status ?? error?.httpStatus;
      // No HTTP status = the request never reached the API (wrong URL,
      // server down, network). Otherwise show what the server actually said.
      // fetch() rejects with a TypeError only when the request could not be
      // sent (wrong URL, server down, network). Any other error without a
      // status happened on the device (e.g. storing the session) and must not
      // be reported as a network problem.
      const networkFailure = !status && error instanceof TypeError;
      if (networkFailure) setError(t("authServerError"));
      else if (status === 401) setError(t("invalidCredentials"));
      else if (status === 429) setError(t("authTooManyAttempts"));
      else if (status && status < 500 && error?.message) setError(String(error.message));
      else setError(t("authUnexpectedError"));
      if (!status && __DEV__) {
        console.warn(
          networkFailure ? "[login] API unreachable at" : "[login] local error after contacting",
          getApiBaseUrl(),
          error?.message,
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const fgColor = colors.foreground;
  const mutedColor = colors.mutedForeground;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <KeyboardAwareScrollViewCompat
        style={styles.kav}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        {/* ── Dusk band: the mark draws itself while the form is already usable ── */}
        <LinearGradient colors={["#2B2475", MIZAN.colors.navyDeep]} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <ZelligePattern opacity={0.035} />
          <View style={styles.headerControls}>
            <IconButton icon={isRTL ? "arrow-right" : "arrow-left"} variant="onDark" accessibilityLabel={t("back")} onPress={() => router.replace("/welcome")} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <LanguageSwitcher variant="onDark" />
              <ThemeToggleButton onDark testID="login-theme-toggle" />
            </View>
          </View>
          <View style={styles.brandArea} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <MizanMark size={84} animated />
            <Text style={styles.wordmark} allowFontScaling={false}>MIZAN</Text>
          </View>
        </LinearGradient>

        <Animated.View entering={FadeInDown.duration(DURATION.slow).delay(120)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.welcomeTitle, { color: fgColor }, lang === "ar" && { fontFamily: displayFace(lang), lineHeight: 40 }]} accessibilityRole="header">{t("authWelcomeBack")}</Text>
            <Text style={[styles.welcomeSub, { color: mutedColor }]}>{t("authSecureWorkspace")}</Text>
          </View>

          <MizanFormField label={t("email")} icon="mail" focused={emailFocused} error={error && !email.trim() ? error : undefined}>
            <TextInput
              style={[styles.input, { color: fgColor }]}
              value={email} onChangeText={(v) => { setEmail(v); setError(""); }}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username"
              placeholder={t("emailPlaceholder")} placeholderTextColor={mutedColor}
              onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)}
              returnKeyType="next"
              accessibilityLabel={t("email")}
            />
          </MizanFormField>

          <MizanFormField label={t("password")} icon="lock" focused={passFocused} error={error && !password ? error : undefined} trailing={
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={10} accessibilityRole="button" accessibilityLabel={showPassword ? t("hidePassword") : t("showPassword")}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={mutedColor} />
            </TouchableOpacity>
          }>
            <TextInput
              style={[styles.input, { color: fgColor }]}
              value={password} onChangeText={(v) => { setPassword(v); setError(""); }}
              secureTextEntry={!showPassword} autoComplete="password" textContentType="password"
              placeholder={t("passwordPlaceholder")} placeholderTextColor={mutedColor}
              onFocus={() => setPassFocused(true)} onBlur={() => setPassFocused(false)}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              accessibilityLabel={t("password")}
            />
          </MizanFormField>

          <TouchableOpacity style={styles.forgotButton} onPress={() => router.push("/forgot-password")} accessibilityRole="link" hitSlop={8}>
            <Text style={[styles.forgotLink, { color: colors.tint }]}>{t("forgotPassword")}</Text>
          </TouchableOpacity>

          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft, borderColor: colors.danger + "40" }]} accessibilityLiveRegion="polite">
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.dangerText }]}>{error}</Text>
            </View>
          )}

          <Button label={t("connect")} size="lg" fullWidth loading={loading} haptic trailingIcon={isRTL ? "arrow-left" : "arrow-right"} onPress={handleLogin} />
        </Animated.View>

        <TouchableOpacity style={styles.signup} onPress={() => router.push("/get-started")} accessibilityRole="link">
          <Text style={[styles.signupText, { color: mutedColor }]}>{t("authNoAccountYet")}</Text>
          <Text style={[styles.signupLink, { color: colors.tint }]}>{t("authGetStarted")}</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kav: { flex: 1 },
  hero: { paddingHorizontal: 16, paddingBottom: 64, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden" },
  headerControls: { flexDirection: "row", justifyContent: "space-between" },
  brandArea: { alignItems: "center", gap: 10, marginTop: 4 },
  wordmark: { fontFamily: "Fraunces_600SemiBold", fontSize: 22, letterSpacing: 4, color: "#FFFFFF" },
  card: { marginTop: -44, marginHorizontal: 16, borderRadius: 24, borderWidth: 1, padding: 22, gap: 16, ...crossPlatformShadow({ color: "#1A1640", offsetY: 12, opacity: 0.12, radius: 24, elevation: 8 }) },
  cardHead: { gap: 4 },
  welcomeTitle: { fontSize: 28, lineHeight: 35, fontFamily: "Fraunces_600SemiBold" },
  welcomeSub: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  forgotButton: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center" },
  forgotLink: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  errorText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  signup: { alignItems: "center", gap: 4, marginTop: 24, paddingHorizontal: 24, minHeight: 44 },
  signupText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  signupLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
