/**
 * MIZAN — Email OTP Verification Screen
 *
 * Step between registration form and account creation.
 * User enters the 6-digit code sent to their email.
 */

import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { apiRequest } from "@/lib/api";
import {
  auth as authApi,
  getPendingRegistration,
  removePendingRegistration,
} from "@/services/api";

const PENDING_REGISTER_KEY = "@mizan_pending_register";
const PENDING_PLAN_KEY = "@mizan_pending_plan";
const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds before Resend is available
const EXPIRE_SECONDS = 600; // 10-minute code lifetime

export default function EmailVerifyScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const { loginWithTokens } = useAuth();
  const colors = useColors();

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [email, setEmail] = useState("");
  const [pendingData, setPendingData] = useState<any>(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [timeLeft, setTimeLeft] = useState(EXPIRE_SECONDS);
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<"verifying" | "creating">("verifying");

  const inputs = useRef<(TextInput | null)[]>([]);
  const successAnim = useRef(new Animated.Value(0)).current;

  // Load pending registration data
  useEffect(() => {
    getPendingRegistration()
      .then((raw) => {
        if (!raw) return;
        try {
          const data = JSON.parse(raw);
          setPendingData(data);
          setEmail(data.email ?? "");
        } catch {
          // Treat malformed local state as an interrupted registration.
        }
      })
      .finally(() => setPendingLoaded(true));
  }, []);

  // Countdown timers
  useEffect(() => {
    const iv = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const fullCode = code.join("");
  const isComplete = fullCode.length === CODE_LENGTH && !code.includes("");

  // Auto-submit when all 6 digits entered
  useEffect(() => {
    if (isComplete && !loading && !success) {
      handleVerify();
    }
  }, [isComplete]);

  const handleChangeText = (text: string, index: number) => {
    const char = text.replace(/[^0-9]/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = char;
    setCode(newCode);
    setError(null);
    if (char && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace") {
      const newCode = [...code];
      if (newCode[index]) {
        newCode[index] = "";
        setCode(newCode);
      } else if (index > 0) {
        newCode[index - 1] = "";
        setCode(newCode);
        inputs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerify = useCallback(async () => {
    if (loading || !isComplete) return;
    if (timeLeft <= 0) {
      setError(t("emailVerifyCodeExpired"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Step 1: Verify OTP
      setStep("verifying");
      await apiRequest("/auth/otp/verify", "POST", { email, code: fullCode });

      // Step 2: Create account
      setStep("creating");
      const res = await authApi.register({
        name: pendingData?.name ?? "",
        email,
        phone: pendingData?.phone || undefined,
        password: pendingData?.password ?? "",
      });

      const { token, refreshToken, user } = res.data;

      // Transfer plan data if needed
      if (pendingData?.planId) {
        await AsyncStorage.setItem(
          PENDING_PLAN_KEY,
          JSON.stringify({
            planId: pendingData.planId,
            planName: pendingData.planName,
            planColor: pendingData.planColor,
            planPrice: pendingData.planPrice,
            planInterval: pendingData.planInterval,
          }),
        );
      }

      await removePendingRegistration();

      // Show success
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(successAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();

      await loginWithTokens(token, refreshToken, user as any);
      setTimeout(() => router.replace("/syndicate-setup" as any), 900);
    } catch (err: any) {
      const message = String(err?.message ?? "");
      setError(
        /expired|expir|introuvable|not found/i.test(message)
          ? t("emailVerifyCodeExpired")
          : err?.httpStatus === 429
            ? t("emailVerifyResendRateLimited")
            : t("emailVerifyInvalidCode"),
      );
      setCode(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [loading, isComplete, email, fullCode, pendingData, timeLeft, t]);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setCode(Array(CODE_LENGTH).fill(""));
    try {
      await apiRequest("/auth/otp/send", "POST", { email });
      setResendCooldown(RESEND_COOLDOWN);
      setTimeLeft(EXPIRE_SECONDS);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(
        err?.httpStatus === 429
          ? t("emailVerifyResendRateLimited")
          : t("emailVerifySendError"),
      );
    }
  };

  const color = colors.primary;
  const gradColors: [string, string] = [colors.background, colors.card];
  const cardBg = colors.card;

  if (pendingLoaded && !pendingData) {
    return (
      <View
        style={[
          s.root,
          {
            backgroundColor: colors.background,
            direction: isRTL ? "rtl" : "ltr",
          },
        ]}
      >
        <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
        <View style={[s.successWrap, { paddingTop: insets.top + 40 }]}>
          <View
            style={[
              s.successCircle,
              { backgroundColor: colors.warning + "18" },
            ]}
          >
            <Feather name="mail" size={40} color={colors.warning} />
          </View>
          <Text style={[s.successTitle, { color: colors.foreground }]}>
            {t("emailVerifySessionTitle")}
          </Text>
          <Text style={[s.successSub, { color: colors.mutedForeground }]}>
            {t("emailVerifySessionMessage")}
          </Text>
          <TouchableOpacity
            style={[s.verifyBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/register" as any)}
            accessibilityRole="button"
            accessibilityLabel={t("emailVerifyBackToRegister")}
          >
            <Feather
              name={isRTL ? "arrow-left" : "arrow-right"}
              size={18}
              color={colors.primaryForeground}
            />
            <Text
              style={[s.verifyBtnText, { color: colors.primaryForeground }]}
            >
              {t("emailVerifyBackToRegister")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (success) {
    return (
      <View
        style={[
          s.root,
          {
            backgroundColor: isDark ? "#070D1A" : "#EFF6FF",
            direction: isRTL ? "rtl" : "ltr",
          },
        ]}
      >
        <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
        <View style={[s.successWrap, { paddingTop: insets.top + 60 }]}>
          <Animated.View
            style={{
              transform: [{ scale: successAnim }],
              opacity: successAnim,
            }}
          >
            <View
              style={[s.successCircle, { backgroundColor: colors.success }]}
            >
              <Feather
                name="check"
                size={40}
                color={colors.successForeground}
              />
            </View>
          </Animated.View>
          <Text
            style={[s.successTitle, { color: isDark ? "#E8F0FE" : "#0A1628" }]}
          >
            {t("emailVerifySuccessTitle")}
          </Text>
          <Text
            style={[
              s.successSub,
              { color: isDark ? "rgba(232,240,254,0.55)" : "#64748B" },
            ]}
          >
            {t("emailVerifySuccessMessage")}
          </Text>
          <ActivityIndicator color={colors.success} style={{ marginTop: 24 }} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        s.root,
        {
          backgroundColor: colors.background,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
    >
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        bottomOffset={24}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 24,
          gap: 28,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            s.backBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
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
        <View style={s.headerWrap}>
          <View style={[s.iconCircle, { backgroundColor: color + "15" }]}>
            <Feather name="mail" size={28} color={color} />
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>
            {t("emailVerifyTitle")}
          </Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
            {t("emailVerifySubtitle")}
          </Text>
          <View
            style={[
              s.emailBadge,
              { backgroundColor: color + "12", borderColor: color + "30" },
            ]}
          >
            <Feather name="mail" size={12} color={color} />
            <Text style={[s.emailBadgeText, { color }]} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>

        {/* Timer */}
        {timeLeft > 0 ? (
          <View style={s.timerRow}>
            <Feather
              name="clock"
              size={13}
              color={
                timeLeft <= 60 ? colors.destructive : colors.mutedForeground
              }
            />
            <Text
              style={[
                s.timerText,
                {
                  color:
                    timeLeft <= 60
                      ? colors.destructive
                      : colors.mutedForeground,
                },
              ]}
            >
              {t("emailVerifyCodeValidFor")} {formatTime(timeLeft)}
            </Text>
          </View>
        ) : (
          <View
            style={[
              s.expiredBadge,
              {
                backgroundColor: colors.destructive + "12",
                borderColor: colors.destructive + "40",
              },
            ]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[s.expiredText, { color: colors.destructive }]}>
              {t("emailVerifyCodeExpired")}
            </Text>
          </View>
        )}

        {/* OTP Inputs */}
        <View style={s.otpRow}>
          {code.map((digit, i) => {
            const hasError = !!error;
            return (
              <TextInput
                key={i}
                ref={(ref) => {
                  inputs.current[i] = ref;
                }}
                style={[
                  s.otpBox,
                  {
                    backgroundColor: colors.card,
                    borderColor: hasError
                      ? "#EF4444"
                      : digit
                        ? color
                        : colors.border,
                    color: colors.foreground,
                  },
                ]}
                value={digit}
                onChangeText={(t) => handleChangeText(t, i)}
                onKeyPress={({ nativeEvent }) =>
                  handleKeyPress(nativeEvent.key, i)
                }
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={i === 0}
              />
            );
          })}
        </View>

        {/* Error */}
        {error && (
          <View
            style={[
              s.errorBox,
              {
                backgroundColor: colors.destructive + "12",
                borderColor: colors.destructive + "40",
                flexDirection: isRTL ? "row-reverse" : "row",
              },
            ]}
          >
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text
              style={[
                s.errorText,
                {
                  color: colors.destructive,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
            >
              {error}
            </Text>
          </View>
        )}

        {/* Step indicator during loading */}
        {loading && (
          <View
            style={[
              s.stepCard,
              {
                backgroundColor: cardBg,
                borderColor: colors.border,
                flexDirection: isRTL ? "row-reverse" : "row",
              },
            ]}
          >
            <ActivityIndicator color={color} size="small" />
            <Text
              style={[
                s.stepText,
                {
                  color: colors.mutedForeground,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
            >
              {step === "verifying"
                ? t("emailVerifyChecking")
                : t("emailVerifyCreating")}
            </Text>
          </View>
        )}

        {/* Verify button */}
        <TouchableOpacity
          style={[
            s.verifyBtn,
            {
              backgroundColor:
                isComplete && !loading && timeLeft > 0 ? color : colors.border,
              opacity: loading ? 0.75 : 1,
            },
          ]}
          onPress={handleVerify}
          disabled={!isComplete || loading || timeLeft <= 0}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t("emailVerifyButton")}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <>
              <Text style={s.verifyBtnText}>{t("emailVerifyButton")}</Text>
              <Feather
                name={isRTL ? "arrow-left" : "arrow-right"}
                size={18}
                color={colors.primaryForeground}
              />
            </>
          )}
        </TouchableOpacity>

        {/* Resend */}
        <View style={s.resendRow}>
          <Text style={[s.resendLabel, { color: colors.mutedForeground }]}>
            {t("emailVerifyNotReceived")}
          </Text>
          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t("emailVerifyResend")}
          >
            <Text
              style={[
                s.resendBtn,
                { color: resendCooldown > 0 ? colors.border : color },
              ]}
            >
              {resendCooldown > 0
                ? `${t("emailVerifyResendIn")} ${resendCooldown}s`
                : t("emailVerifyResend")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Help hint */}
        <View
          style={[
            s.hintBox,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              flexDirection: isRTL ? "row-reverse" : "row",
            },
          ]}
        >
          <Feather name="info" size={13} color={colors.mutedForeground} />
          <Text
            style={[
              s.hintText,
              {
                color: colors.mutedForeground,
                textAlign: isRTL ? "right" : "left",
              },
            ]}
          >
            {t("emailVerifyHint")}
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },

  headerWrap: { alignItems: "center", gap: 12 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  emailBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  emailBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  timerText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  expiredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  expiredText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  otpRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  otpBox: {
    width: 48,
    height: 60,
    borderRadius: 14,
    borderWidth: 2,
    textAlign: "center",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#EF4444",
    flex: 1,
  },

  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  verifyBtn: {
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  verifyBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  resendRow: { alignItems: "center", gap: 6 },
  resendLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  resendBtn: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  hintBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  hintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },

  successWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingHorizontal: 32,
  },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    textAlign: "center",
  },
  successSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
