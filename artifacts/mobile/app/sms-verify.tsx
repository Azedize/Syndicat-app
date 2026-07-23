/**
 * SYNDYCAT — SMS OTP Verification Screen (Twilio Verify)
 *
 * Receives ?phone=+212XXXXXXXXX from the previous screen.
 * Sends → verifies via Twilio Verify API.
 */
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useTheme } from "@/context/ThemeContext";
import { apiRequest } from "@/lib/api";

const CODE_LENGTH     = 6;
const RESEND_COOLDOWN = 60;
const EXPIRE_SECONDS  = 600;

export default function SmsVerifyScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const params = useLocalSearchParams<{ phone?: string; redirect?: string }>();

  const phone    = decodeURIComponent(params.phone ?? "");
  const redirect = params.redirect ?? "/";

  const [code, setCode]             = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading]       = useState(false);
  const [sending, setSending]       = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [sendMsg, setSendMsg]       = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [verified, setVerified]     = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [timeLeft, setTimeLeft]     = useState(EXPIRE_SECONDS);

  const inputs    = useRef<(TextInput | null)[]>([]);
  const successAnim = useRef(new Animated.Value(0)).current;

  const color       = "#7C3AED";
  const gradColors: [string, string] = isDark ? ["#0D0B14", "#130E20"] : ["#F5F3FF", "#FAF8FF"];

  // ── Send OTP on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phone) doSend(false);
  }, []);

  // ── Countdown timers ───────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      setResendCooldown(c => Math.max(0, c - 1));
      setTimeLeft(t => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const fullCode  = code.join("");
  const isComplete = fullCode.length === CODE_LENGTH && !code.includes("");

  // Auto-submit when all digits entered
  useEffect(() => {
    if (isComplete && !loading && !verified) handleVerify();
  }, [isComplete]);

  // ── Send / Resend ──────────────────────────────────────────────────────────
  async function doSend(isResend: boolean) {
    if (isResend && resendCooldown > 0) return;
    setSending(true);
    setSendStatus("sending");
    setSendMsg(null);
    setError(null);
    if (isResend) {
      setCode(Array(CODE_LENGTH).fill(""));
      setResendCooldown(RESEND_COOLDOWN);
      setTimeLeft(EXPIRE_SECONDS);
    }
    try {
      await apiRequest("/auth/sms/send", "POST", { phone });
      setSendStatus("success");
      setSendMsg(`Code SMS envoyé au ${phone}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Auto-clear success banner after 3s
      setTimeout(() => setSendStatus("idle"), 3000);
    } catch (err: any) {
      setSendStatus("error");
      setSendMsg(err?.message ?? "Impossible d'envoyer le SMS. Vérifiez le numéro.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  }

  // ── Digit input ────────────────────────────────────────────────────────────
  const handleChangeText = (text: string, i: number) => {
    const char = text.replace(/[^0-9]/g, "").slice(-1);
    const next = [...code];
    next[i] = char;
    setCode(next);
    setError(null);
    if (char && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  const handleKeyPress = (key: string, i: number) => {
    if (key === "Backspace") {
      const next = [...code];
      if (next[i]) { next[i] = ""; setCode(next); }
      else if (i > 0) { next[i - 1] = ""; setCode(next); inputs.current[i - 1]?.focus(); }
    }
  };

  // ── Verify ─────────────────────────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    if (loading || !isComplete) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest("/auth/sms/verify", "POST", { phone, code: fullCode });
      setVerified(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(successAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }).start();
      setTimeout(() => router.replace(redirect as any), 1200);
    } catch (err: any) {
      setError(err?.message ?? "Code incorrect. Vérifiez et réessayez.");
      setCode(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [loading, isComplete, phone, fullCode, redirect]);

  // ── Success screen ─────────────────────────────────────────────────────────
  if (verified) {
    return (
      <View style={[st.root, { backgroundColor: isDark ? "#0D0B14" : "#F5F3FF" }]}>
        <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
        <View style={[st.successWrap, { paddingTop: insets.top + 60 }]}>
          <Animated.View style={{ transform: [{ scale: successAnim }], opacity: successAnim }}>
            <View style={[st.successCircle, { backgroundColor: "#10B981" }]}>
              <Feather name="check" size={40} color="#fff" />
            </View>
          </Animated.View>
          <Text style={[st.successTitle, { color: isDark ? "#F5F3FF" : "#1E1B3A" }]}>Téléphone vérifié !</Text>
          <Text style={[st.successSub, { color: isDark ? "rgba(245,243,255,0.55)" : "#6B7280" }]}>
            Redirection en cours…
          </Text>
          <ActivityIndicator color="#10B981" style={{ marginTop: 24 }} />
        </View>
      </View>
    );
  }

  const subText  = isDark ? "rgba(245,243,255,0.55)" : "#6B7280";
  const cardBg   = isDark ? "rgba(255,255,255,0.05)" : "#fff";
  const cardBdr  = isDark ? "rgba(124,58,237,0.2)" : "rgba(124,58,237,0.15)";

  return (
    <View style={[st.root, { backgroundColor: isDark ? "#0D0B14" : "#F5F3FF" }]}>
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 24, gap: 28 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Feather name="arrow-left" size={20} color={color} />
          </TouchableOpacity>

          {/* Header */}
          <View style={st.headerWrap}>
            <View style={[st.iconCircle, { backgroundColor: color + "18" }]}>
              <Feather name="smartphone" size={28} color={color} />
            </View>
            <Text style={[st.title, { color: isDark ? "#F5F3FF" : "#1E1B3A" }]}>
              Vérification SMS
            </Text>
            <Text style={[st.subtitle, { color: subText }]}>
              Code envoyé par SMS au
            </Text>
            <View style={[st.phoneBadge, { backgroundColor: color + "12", borderColor: color + "30" }]}>
              <Feather name="phone" size={12} color={color} />
              <Text style={[st.phoneBadgeText, { color }]}>{phone}</Text>
            </View>
          </View>

          {/* Send status banner */}
          {sendStatus !== "idle" && (
            <View style={[st.statusCard, {
              backgroundColor:
                sendStatus === "success" ? "#10B98112" :
                sendStatus === "error"   ? "#EF444412" :
                (isDark ? "rgba(124,58,237,0.1)" : "rgba(124,58,237,0.07)"),
              borderColor:
                sendStatus === "success" ? "#10B981" :
                sendStatus === "error"   ? "#EF4444" :
                color,
            }]}>
              {sendStatus === "sending" && <ActivityIndicator size="small" color={color} />}
              {sendStatus === "success" && <Feather name="check-circle" size={18} color="#10B981" />}
              {sendStatus === "error"   && <Feather name="x-circle"     size={18} color="#EF4444" />}
              <View style={{ flex: 1 }}>
                <Text style={[st.statusTitle, {
                  color: sendStatus === "success" ? "#10B981" : sendStatus === "error" ? "#EF4444" : color,
                }]}>
                  {sendStatus === "sending" && "Envoi du SMS en cours…"}
                  {sendStatus === "success" && "SMS envoyé avec succès !"}
                  {sendStatus === "error"   && "Échec de l'envoi SMS"}
                </Text>
                {sendMsg && (
                  <Text style={[st.statusSub, {
                    color: sendStatus === "error" ? "#EF4444" : (isDark ? "rgba(245,243,255,0.5)" : "#6B7280"),
                  }]}>
                    {sendMsg}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Timer */}
          {timeLeft > 0 ? (
            <View style={st.timerRow}>
              <Feather name="clock" size={13} color={timeLeft <= 60 ? "#EF4444" : (isDark ? "rgba(255,255,255,0.4)" : "#9CA3AF")} />
              <Text style={[st.timerText, { color: timeLeft <= 60 ? "#EF4444" : (isDark ? "rgba(255,255,255,0.4)" : "#9CA3AF") }]}>
                Code valide pendant {fmt(timeLeft)}
              </Text>
            </View>
          ) : (
            <View style={[st.expiredBadge, { backgroundColor: "#EF444412", borderColor: "#EF444440" }]}>
              <Feather name="alert-circle" size={14} color="#EF4444" />
              <Text style={[st.expiredText, { color: "#EF4444" }]}>Code expiré — demandez un nouveau code</Text>
            </View>
          )}

          {/* OTP boxes */}
          <View style={st.otpRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={ref => { inputs.current[i] = ref; }}
                style={[st.otpBox, {
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#fff",
                  borderColor: error
                    ? "#EF4444"
                    : digit
                    ? color
                    : (isDark ? "rgba(124,58,237,0.25)" : "rgba(124,58,237,0.2)"),
                  color: isDark ? "#F5F3FF" : "#1E1B3A",
                }]}
                value={digit}
                onChangeText={t => handleChangeText(t, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={i === 0}
              />
            ))}
          </View>

          {/* Error */}
          {error && (
            <View style={[st.errorBox, { backgroundColor: "#EF444412", borderColor: "#EF444430" }]}>
              <Feather name="alert-circle" size={14} color="#EF4444" />
              <Text style={st.errorText}>{error}</Text>
            </View>
          )}

          {/* Loading */}
          {loading && (
            <View style={[st.loadingCard, { backgroundColor: cardBg, borderColor: cardBdr }]}>
              <ActivityIndicator color={color} size="small" />
              <Text style={[st.loadingText, { color: subText }]}>Vérification du code…</Text>
            </View>
          )}

          {/* Verify button */}
          <TouchableOpacity
            style={[st.verifyBtn, {
              backgroundColor: isComplete && !loading ? color : color + "50",
              opacity: loading ? 0.75 : 1,
            }]}
            onPress={handleVerify}
            disabled={!isComplete || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={st.verifyBtnText}>Vérifier le code</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <View style={st.resendRow}>
            <Text style={[st.resendLabel, { color: subText }]}>Vous n'avez pas reçu le SMS ?</Text>
            <TouchableOpacity onPress={() => doSend(true)} disabled={resendCooldown > 0 || sending} activeOpacity={0.7}>
              <Text style={[st.resendBtn, {
                color: resendCooldown > 0 ? (isDark ? "rgba(255,255,255,0.2)" : "#D1D5DB") : color,
              }]}>
                {sending
                  ? "Envoi…"
                  : resendCooldown > 0
                  ? `Renvoyer dans ${resendCooldown}s`
                  : "Renvoyer le code SMS"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Hint */}
          <View style={[st.hintBox, {
            backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(124,58,237,0.04)",
            borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(124,58,237,0.1)",
          }]}>
            <Feather name="info" size={13} color={isDark ? "rgba(255,255,255,0.25)" : "#9CA3AF"} />
            <Text style={[st.hintText, { color: subText }]}>
              Le SMS peut prendre quelques secondes. Vérifiez que le numéro est correct et qu'il est au format international (+212…).
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },

  headerWrap: { alignItems: "center", gap: 12 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  title:    { fontFamily: "Inter_700Bold", fontSize: 26, letterSpacing: -0.3, textAlign: "center" },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  phoneBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  phoneBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  statusCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  statusTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  statusSub:   { fontFamily: "Inter_400Regular",  fontSize: 12, lineHeight: 17, marginTop: 2 },

  timerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  timerText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  expiredBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  expiredText:  { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  otpRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  otpBox: { width: 48, height: 60, borderRadius: 14, borderWidth: 2, textAlign: "center", fontSize: 24, fontFamily: "Inter_700Bold" },

  errorBox:  { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1 },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#EF4444", flex: 1 },

  loadingCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  loadingText: { fontFamily: "Inter_500Medium", fontSize: 13 },

  verifyBtn:     { height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  verifyBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  resendRow:  { alignItems: "center", gap: 6 },
  resendLabel: { fontFamily: "Inter_400Regular", fontSize: 13 },
  resendBtn:  { fontFamily: "Inter_600SemiBold", fontSize: 13 },

  hintBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  hintText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1, lineHeight: 18 },

  successWrap:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 32 },
  successCircle: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  successTitle:  { fontFamily: "Inter_700Bold", fontSize: 28, textAlign: "center" },
  successSub:    { fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center", lineHeight: 22 },
});
