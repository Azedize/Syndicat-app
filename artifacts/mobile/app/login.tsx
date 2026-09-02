import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Path, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

import MizanLogo from "@/components/brand/MizanLogo";
import MizanFormField from "@/components/MizanFormField";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { MIZAN } from "@/constants/brand";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { crossPlatformShadow } from "@/lib/shadow";

function LoginBgDecor({ isDark }: { isDark: boolean }) {
  const lineStr = isDark ? "rgba(255,255,255,0.03)" : "rgba(37,99,235,0.04)";
  const bldgFill = isDark ? "rgba(59,130,246,0.05)" : "rgba(37,99,235,0.03)";
  
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <SvgGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B82F6" stopOpacity={isDark ? "0.15" : "0.08"} />
          <Stop offset="1" stopColor="#070D1A" stopOpacity="0.0" />
        </SvgGradient>
      </Defs>
      <Rect x="0" y="0" width="390" height="844" fill="url(#lg1)" />
      {/* Background buildings grid */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <Path key={i} d={`M${20 + i*60},844 L${20 + i*60},${600 + (i%3)*40} L${60 + i*60},${600 + (i%3)*40} L${60 + i*60},844 Z`} fill={bldgFill} />
      ))}
      {/* Geometric Hexagons */}
      {[[320, 100], [50, 200], [350, 300], [80, 450]].map(([x, y], i) => (
        <Path
          key={`hex${i}`}
          d={`M${x},${y - 30} L${x + 25},${y - 15} L${x + 25},${y + 15} L${x},${y + 30} L${x - 25},${y + 15} L${x - 25},${y - 15} Z`}
          fill="none"
          stroke={lineStr}
          strokeWidth="1.5"
        />
      ))}
    </Svg>
  );
}

const FEATURES = [
  { icon: "home", key: "authFeatureProperties" },
  { icon: "users", key: "authFeatureAssemblies" },
  { icon: "file-text", key: "authFeatureDocuments" },
  { icon: "pen-tool", key: "authFeatureSignatures" },
  { icon: "dollar-sign", key: "authFeatureFinance" },
  { icon: "tool", key: "authFeatureMaintenance" },
  { icon: "alert-triangle", key: "authFeatureIncidents" },
  { icon: "bell", key: "authFeatureAlerts" },
];

const TRUST = [
  { icon: "lock", key: "authTrustEncrypted" },
  { icon: "shield", key: "authTrustPrivacy" },
  { icon: "award", key: "authTrustCertified" },
  { icon: "activity", key: "authTrustAudit" },
  { icon: "eye", key: "authTrustTraceability" },
  { icon: "file-text", key: "authTrustSignature" },
];

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { t, isRTL } = useLanguage();
  const { isDark, toggle } = useTheme();
  const colors = useColors();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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
      setError(status === 401 ? t("invalidCredentials") : t("authServerError"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const bgColor = colors.background;
  const fgColor = colors.foreground;
  const mutedColor = colors.mutedForeground;
  const cardColor = colors.card;
  const cardBorder = colors.border;

  return (
    <View style={[styles.root, { backgroundColor: bgColor }]}>
      <LoginBgDecor isDark={isDark} />

      <View style={[styles.headerControls, { top: insets.top + 14 }]}>
        <TouchableOpacity onPress={() => router.replace("/welcome")} style={[styles.iconBtn, { backgroundColor: cardColor, borderColor: cardBorder }]} accessibilityRole="button" accessibilityLabel={t("back")}>
          <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={20} color={fgColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={toggle} style={[styles.iconBtn, { backgroundColor: cardColor, borderColor: cardBorder }]} accessibilityRole="button" accessibilityLabel={isDark ? t("lightMode") : t("darkMode")}>
          <Feather name={isDark ? "sun" : "moon"} size={20} color={fgColor} />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.kav}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
          
          <View style={styles.brandArea}>
            <MizanLogo variant="full" colorScheme={isDark ? "dark" : "light"} size={72} showTagline={false} />
            <Text style={[styles.appTagline, { color: mutedColor }]}>{t("authPlatformTagline")}</Text>
          </View>

          <View style={styles.featuresGrid}>
            {FEATURES.map(f => (
              <View key={f.key} style={[styles.featureTile, { backgroundColor: colors.primary + "08", borderColor: cardBorder }]}>
                <Feather name={f.icon as any} size={16} color={colors.primary} />
                <Text style={[styles.featureLabel, { color: fgColor }]}>{t(f.key)}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: cardColor, borderColor: cardBorder }]}>
            <View style={styles.cardAccent} />
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <Text style={[styles.welcomeTitle, { color: fgColor }]}>{t("authWelcomeBack")}</Text>
                <Text style={[styles.welcomeSub, { color: mutedColor }]}>{t("authSecureWorkspace")}</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: cardBorder }]} />

              <MizanFormField label={t("email")} icon="mail" focused={emailFocused} error={error && !email.trim() ? error : undefined}>
                <TextInput
                    style={[styles.input, { color: fgColor }]}
                    value={email} onChangeText={(v) => { setEmail(v); setError(""); }}
                    keyboardType="email-address" autoCapitalize="none"
                    placeholder={t("emailPlaceholder")} placeholderTextColor={mutedColor}
                    onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)}
                    returnKeyType="next"
                    accessibilityLabel={t("email")}
                  />
              </MizanFormField>

              <MizanFormField label={t("password")} icon="lock" focused={passFocused} error={error && !password ? error : undefined} trailing={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} accessibilityRole="button" accessibilityLabel={showPassword ? t("hidePassword") : t("showPassword")}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={mutedColor} />
                </TouchableOpacity>
              }>
                <TextInput
                    style={[styles.input, { color: fgColor }]}
                    value={password} onChangeText={(v) => { setPassword(v); setError(""); }}
                    secureTextEntry={!showPassword} placeholder={t("passwordPlaceholder")} placeholderTextColor={mutedColor}
                    onFocus={() => setPassFocused(true)} onBlur={() => setPassFocused(false)}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    accessibilityLabel={t("password")}
                  />
              </MizanFormField>

              <View style={[styles.optionsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <TouchableOpacity style={[styles.rememberRow, { flexDirection: isRTL ? "row-reverse" : "row" }]} onPress={() => setRememberMe(!rememberMe)} accessibilityRole="checkbox" accessibilityState={{ checked: rememberMe }}>
                  <View style={[styles.checkbox, { borderColor: rememberMe ? colors.primary : cardBorder, backgroundColor: rememberMe ? colors.primary : "transparent" }]}>
                    {rememberMe && <Feather name="check" size={12} color={colors.primaryForeground} />}
                  </View>
                  <Text style={[styles.rememberLabel, { color: mutedColor, textAlign: isRTL ? "right" : "left" }]}>{t("authRememberMe")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.forgotButton} onPress={() => router.push("/forgot-password")}>
                  <Text style={[styles.forgotLink, { color: colors.primary, textAlign: isRTL ? "left" : "right" }]}>{t("forgotPassword")}</Text>
                </TouchableOpacity>
              </View>

              {!!error && (
                <View style={[styles.errorBox, { backgroundColor: colors.destructive + "12", borderColor: colors.destructive + "40", flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <Feather name="alert-circle" size={16} color={colors.destructive} />
                  <Text style={[styles.errorText, { color: colors.destructive, textAlign: isRTL ? "right" : "left" }]}>{error}</Text>
                </View>
              )}

              <TouchableOpacity onPress={handleLogin} disabled={loading} style={[styles.ctaOuter, crossPlatformShadow({ color: colors.primary, offsetY: 6, opacity: 0.4, radius: 16, elevation: 8 })]} accessibilityRole="button" accessibilityLabel={t("connect")}>
                <LinearGradient colors={[colors.primary, colors.secondaryForeground]} style={styles.ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {loading ? <ActivityIndicator color={colors.primaryForeground} /> : (
                    <>
                      <Text style={[styles.ctaLabel, { color: colors.primaryForeground }]}>{t("connect")}</Text>
                      <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={18} color={colors.primaryForeground} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.trustGrid}>
            {TRUST.map(item => (
              <View key={item.key} style={styles.trustItem}>
                <Feather name={item.icon as any} size={14} color={colors.primary} />
                <Text style={[styles.trustLabel, { color: mutedColor }]}>{t(item.key)}</Text>
              </View>
            ))}
          </View>
          
           <Text style={[styles.footer, { color: mutedColor }]}>{MIZAN.name} • {t("authEnterprisePlatform")}</Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerControls: { position: "absolute", left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", zIndex: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", ...crossPlatformShadow({ color: "#000", offsetY: 2, opacity: 0.1, radius: 4, elevation: 3 }) },
  kav: { flex: 1 },
  scroll: { paddingHorizontal: 24, gap: 32 },
  
  brandArea: { alignItems: "center", gap: 12 },
  appTagline: { fontSize: 13, fontFamily: "Inter_500Medium", letterSpacing: 0.5, textTransform: "uppercase" },

  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  featureTile: { width: "23.5%", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center", gap: 8 },
  featureLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  card: { borderRadius: 24, borderWidth: 1, overflow: "hidden", ...crossPlatformShadow({ color: "#000", offsetY: 12, opacity: 0.15, radius: 24, elevation: 12 }) },
  cardAccent: { height: 4, backgroundColor: "#2563EB" },
  cardBody: { padding: 24, gap: 20 },
  cardHead: { gap: 6 },
  welcomeTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  welcomeSub: { fontSize: 15, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginHorizontal: -24 },

  input: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },

  optionsRow: { flexDirection: "row", alignItems: "center" },
  rememberRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  rememberLabel: { fontSize: 12, fontFamily: "Inter_500Medium", flexShrink: 1 },
  forgotButton: { marginLeft: 12, flexShrink: 0, alignItems: "flex-end" },
  forgotLink: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  errorBox: { alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  errorText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },

  ctaOuter: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  ctaGradient: { paddingVertical: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  ctaLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF" },

  trustGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16, columnGap: 8, justifyContent: "space-between" },
  trustItem: { width: "48%", flexDirection: "row", alignItems: "center", gap: 8 },
  trustLabel: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },

  footer: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 16 },
});