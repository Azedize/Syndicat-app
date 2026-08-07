/**
 * MIZAN — Registration Screen
 *
 * Step 3 of the SaaS onboarding flow:
 * Intro → Plans → Register → Syndicate Setup → Payment → Team Invite → Dashboard
 *
 * Receives optional planId / planName / planColor query params from the Plans screen.
 */

import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
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
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/lib/api";
import { auth as authApi } from "@/services/api";

const PENDING_PLAN_KEY = "@mizan_pending_plan";
const PENDING_REGISTER_KEY = "@mizan_pending_register";

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  error,
  keyboardType,
  isDark,
  color,
  rightElement,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  error?: string;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  isDark: boolean;
  color: string;
  rightElement?: React.ReactNode;
}) {
  const bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.9)";
  const border = error
    ? "#EF4444"
    : isDark
      ? "rgba(255,255,255,0.12)"
      : "rgba(37,99,235,0.2)";
  const textColor = isDark ? "#E8F0FE" : "#0A1628";
  const phColor = isDark ? "rgba(232,240,254,0.3)" : "#94A3B8";

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={[
          s.fieldLabel,
          { color: isDark ? "rgba(232,240,254,0.6)" : "#475569" },
        ]}
      >
        {label}
      </Text>
      <View style={[s.fieldWrap, { backgroundColor: bg, borderColor: border }]}>
        <Feather
          name={icon}
          size={16}
          color={error ? "#EF4444" : color}
          style={{ marginLeft: 14 }}
        />
        <TextInput
          style={[s.input, { color: textColor, flex: 1 }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={phColor}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {rightElement}
      </View>
      {error ? (
        <View style={s.errorRow}>
          <Feather name="alert-circle" size={12} color="#EF4444" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const { isDark } = useTheme();
  const { loginWithTokens } = useAuth();

  const params = useLocalSearchParams<{
    planId?: string;
    planName?: string;
    planColor?: string;
    planPrice?: string;
    planInterval?: string;
  }>();

  const hasPlan = !!(params.planId && params.planName);
  const planColor = params.planColor ?? "#2563EB";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [sendError, setSendError] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const pwRef = useRef<TextInput>(null);
  const cpwRef = useRef<TextInput>(null);

  const color = planColor;
  const planLocale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "fr-MA";
  const gradColors: [string, string] = isDark
    ? ["#070D1A", "#0D1929"]
    : ["#EFF6FF", "#F8FAFF"];

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2)
      errs.name = t("authFullNameRequired");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = t("authEmailInvalid");
    if (phone.trim() && !/^\+212[5-7]\d{8}$/.test(phone.replace(/[\s-]/g, "")))
      errs.phone = t("authPhoneInvalid");
    if (password.length < 8) errs.password = t("authPasswordTooShort");
    if (password !== confirmPassword)
      errs.confirmPassword = t("authPasswordsMismatch");
    if (!agreed) errs.agreed = t("termsRequiredMsg");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setApiError(null);
    setSendError(null);
    setSendStatus("sending");

    try {
      // Send OTP verification code to email
      await apiRequest("/auth/otp/send", "POST", {
        email: email.trim().toLowerCase(),
      });

      // Store all registration data for the OTP screen to use after verification
      await AsyncStorage.setItem(
        PENDING_REGISTER_KEY,
        JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          password,
          planId: params.planId ?? undefined,
          planName: params.planName ?? undefined,
          planColor: params.planColor ?? undefined,
          planPrice: params.planPrice ?? undefined,
          planInterval: params.planInterval ?? undefined,
        }),
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSendStatus("success");

      // Navigate after showing success for 1.5 seconds
      setTimeout(() => {
        router.push("/email-verify" as any);
        setSendStatus("idle");
      }, 1500);
    } catch (err: any) {
      const msg = t("authVerificationSendError");
      setSendStatus("error");
      setSendError(msg);
      setApiError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}>
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: 24,
            gap: 24,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Feather
              name="arrow-left"
              size={20}
              color={isDark ? "#93C5FD" : "#2563EB"}
            />
          </TouchableOpacity>

          {/* Header */}
          <View style={{ gap: 8 }}>
            <Text style={[s.title, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
              {t("authCreateAccount")}
            </Text>
            <Text
              style={[
                s.subtitle,
                { color: isDark ? "rgba(232,240,254,0.55)" : "#64748B" },
              ]}
            >
              {t("authStepPersonalInfo")}
            </Text>
          </View>

          {/* Selected plan badge */}
          {hasPlan && (
            <View
              style={[
                s.planBadge,
                { backgroundColor: color + "18", borderColor: color + "40" },
              ]}
            >
              <Feather name="check-circle" size={14} color={color} />
              <Text style={[s.planBadgeText, { color }]}>
                {t("authSelectedPlan")}:{" "}
                <Text style={{ fontFamily: "Inter_700Bold" }}>
                  {params.planName}
                </Text>
                {params.planPrice
                  ? ` · ${new Intl.NumberFormat(planLocale, { maximumFractionDigits: 2 }).format(Number(params.planPrice))} ${lang === "ar" ? "د.م." : "MAD"}/${params.planInterval === "yearly" ? t("authYear") : t("authMonth")}`
                  : ""}
              </Text>
            </View>
          )}

          {/* Progress steps */}
          <View style={s.steps}>
            {[
              t("authStepAccount"),
              t("authStepSyndicate"),
              t("authStepTeam"),
            ].map((step, i) => (
              <View key={step} style={s.stepItem}>
                <View
                  style={[
                    s.stepDot,
                    {
                      backgroundColor:
                        i === 0
                          ? color
                          : isDark
                            ? "rgba(255,255,255,0.1)"
                            : "rgba(37,99,235,0.12)",
                      borderColor: i === 0 ? color : "transparent",
                    },
                  ]}
                >
                  {i < 0 ? (
                    <Feather name="check" size={10} color="#fff" />
                  ) : (
                    <Text
                      style={[
                        s.stepNum,
                        {
                          color:
                            i === 0
                              ? "#fff"
                              : isDark
                                ? "rgba(255,255,255,0.3)"
                                : "#94A3B8",
                        },
                      ]}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    s.stepLabel,
                    {
                      color:
                        i === 0
                          ? color
                          : isDark
                            ? "rgba(232,240,254,0.35)"
                            : "#94A3B8",
                    },
                  ]}
                >
                  {step}
                </Text>
              </View>
            ))}
          </View>

          {/* Form */}
          <View style={{ gap: 16 }}>
            <Field
              label={t("fullNameLabel")}
              icon="user"
              value={name}
              onChangeText={(v) => {
                setName(v);
                setErrors((e) => ({ ...e, name: "" }));
              }}
              placeholder={t("fullNamePlaceholder")}
              error={errors.name}
              isDark={isDark}
              color={color}
            />

            <Field
              label={`${t("emailAddress")} *`}
              icon="mail"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setErrors((e) => ({ ...e, email: "" }));
              }}
              placeholder={t("emailPlaceholder")}
              keyboardType="email-address"
              error={errors.email}
              isDark={isDark}
              color={color}
            />

            <Field
              label={t("authPhoneOptional")}
              icon="phone"
              value={phone}
              onChangeText={(value) => {
                setPhone(value);
                if (errors.phone) {
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.phone;
                    return next;
                  });
                }
              }}
              placeholder={t("phonePlaceholder")}
              error={errors.phone}
              keyboardType="phone-pad"
              isDark={isDark}
              color={color}
            />

            <Field
              label={`${t("password")} *`}
              icon="lock"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setErrors((e) => ({ ...e, password: "" }));
              }}
              placeholder={t("authPasswordMin")}
              secureTextEntry={!showPassword}
              error={errors.password}
              isDark={isDark}
              color={color}
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ paddingHorizontal: 14 }}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={16}
                    color={isDark ? "rgba(232,240,254,0.4)" : "#94A3B8"}
                  />
                </TouchableOpacity>
              }
            />

            <Field
              label={t("authConfirmPassword")}
              icon="lock"
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                setErrors((e) => ({ ...e, confirmPassword: "" }));
              }}
              placeholder={t("authConfirmPasswordPlaceholder")}
              secureTextEntry={!showConfirm}
              error={errors.confirmPassword}
              isDark={isDark}
              color={color}
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowConfirm(!showConfirm)}
                  style={{ paddingHorizontal: 14 }}
                >
                  <Feather
                    name={showConfirm ? "eye-off" : "eye"}
                    size={16}
                    color={isDark ? "rgba(232,240,254,0.4)" : "#94A3B8"}
                  />
                </TouchableOpacity>
              }
            />
          </View>

          {/* Password strength indicator */}
          {password.length > 0 && (
            <View style={{ gap: 4 }}>
              <View style={s.strengthBar}>
                {[1, 2, 3, 4].map((level) => {
                  const strength = Math.min(
                    4,
                    Math.floor(password.length / 3) +
                      (password.length >= 8 ? 1 : 0),
                  );
                  const colors = ["#EF4444", "#F59E0B", "#3B82F6", "#10B981"];
                  return (
                    <View
                      key={level}
                      style={[
                        s.strengthSegment,
                        {
                          backgroundColor:
                            level <= strength
                              ? (colors[strength - 1] ?? "#10B981")
                              : isDark
                                ? "rgba(255,255,255,0.1)"
                                : "#E2E8F0",
                        },
                      ]}
                    />
                  );
                })}
              </View>
              <Text
                style={[
                  s.strengthLabel,
                  { color: isDark ? "rgba(232,240,254,0.4)" : "#94A3B8" },
                ]}
              >
                {password.length < 6
                  ? t("authStrengthTooShort")
                  : password.length < 9
                    ? t("authStrengthWeak")
                    : password.length < 12
                      ? t("authStrengthMedium")
                      : t("authStrengthStrong")}
              </Text>
            </View>
          )}

          {/* Terms checkbox */}
          <View style={s.termsRow}>
            <TouchableOpacity
              onPress={() => {
                setAgreed(!agreed);
                setErrors((e) => ({ ...e, agreed: "" }));
              }}
              activeOpacity={0.8}
              style={[
                s.checkbox,
                {
                  backgroundColor: agreed ? color : "transparent",
                  borderColor: errors.agreed
                    ? "#EF4444"
                    : agreed
                      ? color
                      : isDark
                        ? "rgba(255,255,255,0.2)"
                        : "rgba(37,99,235,0.3)",
                },
              ]}
            >
              {agreed && <Feather name="check" size={11} color="#fff" />}
            </TouchableOpacity>
            <Text
              style={[
                s.termsText,
                { color: isDark ? "rgba(232,240,254,0.6)" : "#475569" },
              ]}
            >
              {t("authAcceptPrefix")}{" "}
              <Text
                style={{ color: isDark ? "#60A5FA" : "#2563EB" }}
                onPress={() => router.push("/terms" as any)}
              >
                {t("termsOfUse")}
              </Text>{" "}
              {t("authAcceptJoin")}{" "}
              <Text
                style={{ color: isDark ? "#60A5FA" : "#2563EB" }}
                onPress={() => router.push("/privacy" as any)}
              >
                {t("privacyPolicy")}
              </Text>
            </Text>
          </View>
          {errors.agreed ? (
            <Text style={[s.errorText, { marginTop: -8 }]}>
              {errors.agreed}
            </Text>
          ) : null}

          {/* Email send status card */}
          {sendStatus !== "idle" && (
            <View
              style={[
                s.statusCard,
                {
                  backgroundColor:
                    sendStatus === "success"
                      ? "#10B98115"
                      : sendStatus === "error"
                        ? "#EF444415"
                        : isDark
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(37,99,235,0.06)",
                  borderColor:
                    sendStatus === "success"
                      ? "#10B981"
                      : sendStatus === "error"
                        ? "#EF4444"
                        : isDark
                          ? "rgba(255,255,255,0.15)"
                          : "rgba(37,99,235,0.25)",
                },
              ]}
            >
              {sendStatus === "sending" && (
                <ActivityIndicator size="small" color={color} />
              )}
              {sendStatus === "success" && (
                <Feather name="check-circle" size={20} color="#10B981" />
              )}
              {sendStatus === "error" && (
                <Feather name="x-circle" size={20} color="#EF4444" />
              )}

              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={[
                    s.statusTitle,
                    {
                      color:
                        sendStatus === "success"
                          ? "#10B981"
                          : sendStatus === "error"
                            ? "#EF4444"
                            : isDark
                              ? "#E8F0FE"
                              : "#0A1628",
                    },
                  ]}
                >
                  {sendStatus === "sending" && t("authSendingCode")}
                  {sendStatus === "success" && t("authCodeSent")}
                  {sendStatus === "error" && t("authSendFailed")}
                </Text>

                {sendStatus === "sending" && (
                  <Text
                    style={[
                      s.statusSub,
                      { color: isDark ? "rgba(232,240,254,0.45)" : "#64748B" },
                    ]}
                  >
                    {t("authCodeSentTo")} {email.trim()}…
                  </Text>
                )}
                {sendStatus === "success" && (
                  <Text style={[s.statusSub, { color: "#059669" }]}>
                    {t("authCheckInbox")}
                  </Text>
                )}
                {sendStatus === "error" && sendError && (
                  <Text style={[s.statusSub, { color: "#EF4444" }]}>
                    {sendError}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Submit button */}
          <TouchableOpacity
            style={[
              s.submitBtn,
              {
                backgroundColor: color,
                opacity: loading || sendStatus === "success" ? 0.7 : 1,
              },
            ]}
            onPress={handleSubmit}
            disabled={loading || sendStatus === "success"}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={s.submitBtnText}>
                  {sendStatus === "error"
                    ? t("retryLabel")
                    : t("authSendVerificationCode")}
                </Text>
                <Feather
                  name={sendStatus === "error" ? "refresh-cw" : "send"}
                  size={16}
                  color="#fff"
                />
              </>
            )}
          </TouchableOpacity>

          {/* Already have account */}
          <View style={s.loginRow}>
            <Text
              style={[
                s.loginText,
                { color: isDark ? "rgba(232,240,254,0.45)" : "#64748B" },
              ]}
            >
              {t("authAlreadyHaveAccount")}
            </Text>
            <TouchableOpacity onPress={() => router.replace("/login")}>
              <Text
                style={[s.loginLink, { color: isDark ? "#60A5FA" : "#2563EB" }]}
              >
                {t("authSignIn")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },

  title: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.3 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },

  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  planBadgeText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  steps: { flexDirection: "row", alignItems: "center", gap: 0 },
  stepItem: { flex: 1, alignItems: "center", gap: 6 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  stepNum: { fontFamily: "Inter_700Bold", fontSize: 12 },
  stepLabel: { fontFamily: "Inter_500Medium", fontSize: 11 },

  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  fieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    minHeight: 52,
  },
  input: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#EF4444" },

  strengthBar: { flexDirection: "row", gap: 4 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },

  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  termsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },

  apiError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  apiErrorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#EF4444",
    flex: 1,
  },

  submitBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  loginText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  loginLink: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  statusCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  statusTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  statusSub: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
});
