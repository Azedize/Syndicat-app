/**
 * SYNDYCAT — Enterprise Authentication Screen
 *
 * Production-grade SaaS login experience.
 * Inspired by Microsoft 365, Salesforce, Notion, Stripe Dashboard.
 *
 * Design principles:
 *   — Minimalist light surface: white card on off-white background
 *   — Single hierarchy: logo → headline → form → CTA → trust
 *   — Zero demo artifacts: no role selector, no pre-filled hints, no demo note
 *   — Role is resolved server-side after authentication
 */

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
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import VeridianLogo from "@/components/brand/VeridianLogo";

// ─── Design tokens ───────────────────────────────────────────────────────────

const T = {
  // Surfaces
  pageBg:       "#F0F4F8",
  card:         "#FFFFFF",
  inputBg:      "#F8FAFC",

  // Borders
  border:       "#E2E8F0",
  borderFocus:  "#2563EB",

  // Brand
  primary:      "#2563EB",
  primaryDeep:  "#1D4ED8",
  primaryMist:  "rgba(37,99,235,0.08)",

  // Typography
  textPrimary:  "#0F172A",
  textSecond:   "#475569",
  textMuted:    "#94A3B8",
  textLink:     "#2563EB",

  // State
  error:        "#DC2626",
  errorBg:      "#FEF2F2",
  errorBorder:  "#FECACA",

  // Trust bar
  trustBg:      "#F8FAFC",
  trustBorder:  "#E2E8F0",
  trustIcon:    "#64748B",
} as const;

// ─── Trust items ─────────────────────────────────────────────────────────────

const TRUST = [
  { icon: "lock"    as const, label: "SSL 256-bit" },
  { icon: "shield"  as const, label: "Authentification sécurisée" },
  { icon: "check-circle" as const, label: "Plateforme certifiée" },
] as const;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const insets        = useSafeAreaInsets();
  const { login }     = useAuth();
  const { t }         = useLanguage();

  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe,   setRememberMe]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused,  setPassFocused]  = useState(false);

  const handleLogin = async () => {
    if (!email.trim())   { setError(t("emailRequired"));    return; }
    if (!password)       { setError(t("passwordRequired")); return; }
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── BRAND HEADER ─────────────────────────────────────────── */}
          <View style={styles.brandArea}>
            <VeridianLogo
              variant="horizontal"
              colorScheme="light"
              size={44}
              showTagline={false}
            />
            <Text style={styles.appName}>SYNDYCAT</Text>
            <Text style={styles.tagline}>
              Gestion professionnelle des syndicats de copropriété
            </Text>
          </View>

          {/* ── LOGIN CARD ───────────────────────────────────────────── */}
          <View style={styles.card}>

            {/* Card headline */}
            <View style={styles.cardHead}>
              <Text style={styles.welcomeTitle}>Bon retour</Text>
              <Text style={styles.welcomeSub}>
                Accédez à votre espace de gestion sécurisé
              </Text>
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>{t("email")}</Text>
              <View style={[
                styles.inputRow,
                emailFocused && styles.inputRowFocused,
                !!error && styles.inputRowError,
              ]}>
                <Feather
                  name="mail"
                  size={16}
                  color={emailFocused ? T.primary : T.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  placeholderTextColor={T.textMuted}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>{t("password")}</Text>
              <View style={[
                styles.inputRow,
                passFocused && styles.inputRowFocused,
                !!error && styles.inputRowError,
              ]}>
                <Feather
                  name="lock"
                  size={16}
                  color={passFocused ? T.primary : T.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(""); }}
                  secureTextEntry={!showPassword}
                  placeholder={t("passwordPlaceholder")}
                  placeholderTextColor={T.textMuted}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((p) => !p)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.eyeBtn}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={16}
                    color={T.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Remember me + Forgot password */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRememberMe((r) => !r)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                  {rememberMe && (
                    <Feather name="check" size={10} color="#FFFFFF" />
                  )}
                </View>
                <Text style={styles.rememberLabel}>Se souvenir de moi</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/forgot-password")}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotLink}>{t("forgotPassword")}</Text>
              </TouchableOpacity>
            </View>

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={T.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Primary CTA */}
            <TouchableOpacity
              style={[styles.cta, loading && styles.ctaLoading]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.ctaLabel}>{t("connect")}</Text>
              )}
            </TouchableOpacity>

          </View>

          {/* ── SECURITY TRUST BAR ───────────────────────────────────── */}
          <View style={styles.trustBar}>
            {TRUST.map((item, i) => (
              <React.Fragment key={item.label}>
                <View style={styles.trustItem}>
                  <Feather name={item.icon} size={12} color={T.trustIcon} />
                  <Text style={styles.trustLabel}>{item.label}</Text>
                </View>
                {i < TRUST.length - 1 && <View style={styles.trustDot} />}
              </React.Fragment>
            ))}
          </View>

          {/* ── FOOTER ───────────────────────────────────────────────── */}
          <Text style={styles.footer}>
            © 2026 SYNDYCAT · Tous droits réservés
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  root: {
    flex: 1,
    backgroundColor: T.pageBg,
  },

  scroll: {
    paddingHorizontal: 24,
    gap: 0,
  },

  // ── Brand area ──
  brandArea: {
    alignItems: "center",
    marginBottom: 36,
    gap: 6,
  },
  appName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: T.textPrimary,
    letterSpacing: 3,
    marginTop: 10,
  },
  tagline: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: T.textSecond,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 260,
  },

  // ── Card ──
  card: {
    backgroundColor: T.card,
    borderRadius: 20,
    padding: 28,
    gap: 20,
    // Subtle elevation
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
    // Hairline border
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 24,
  },

  // Card headline
  cardHead: {
    gap: 4,
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: T.textPrimary,
    letterSpacing: -0.5,
  },
  welcomeSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: T.textSecond,
    lineHeight: 20,
  },

  // ── Form fields ──
  field: {
    gap: 7,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: T.textPrimary,
    letterSpacing: 0.1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.inputBg,
    borderWidth: 1.5,
    borderColor: T.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    gap: 10,
  },
  inputRowFocused: {
    borderColor: T.borderFocus,
    backgroundColor: T.card,
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  inputRowError: {
    borderColor: T.error,
  },
  inputIcon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: T.textPrimary,
    padding: 0,
  },
  eyeBtn: {
    flexShrink: 0,
    padding: 2,
  },

  // ── Options row ──
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -4,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: T.primary,
    borderColor: T.primary,
  },
  rememberLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: T.textSecond,
  },
  forgotLink: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: T.textLink,
  },

  // ── Error ──
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.errorBg,
    borderWidth: 1,
    borderColor: T.errorBorder,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    marginTop: -4,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: T.error,
    lineHeight: 18,
  },

  // ── CTA ──
  cta: {
    backgroundColor: T.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    // Depth
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaLoading: {
    backgroundColor: T.primaryDeep,
    shadowOpacity: 0.1,
  },
  ctaLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },

  // ── Trust bar ──
  trustBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trustLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: T.trustIcon,
    letterSpacing: 0.1,
  },
  trustDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: T.textMuted,
    opacity: 0.4,
  },

  // ── Footer ──
  footer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: T.textMuted,
    textAlign: "center",
    letterSpacing: 0.2,
    opacity: 0.7,
  },

});
