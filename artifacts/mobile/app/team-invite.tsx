/**
 * MIZAN — Team Invitation Wizard
 *
 * Step 3 of the SaaS onboarding flow (post-payment):
 * Register → Syndicate Setup → Payment → Team Invite → Dashboard
 *
 * Guides the new syndicate admin to invite their management team:
 * President, Treasurer, Secretary, and optional Committee Member.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useTheme } from "@/context/ThemeContext";
import { team as teamApi } from "@/services/api";

// ─── Team roles config ────────────────────────────────────────────────────────

const ROLES = [
  {
    id: "president",
    label: "Président",
    description: "Gouvernance, signatures, assemblées générales",
    icon: "award" as const,
    color: "#2563EB",
    required: false,
  },
  {
    id: "treasurer",
    label: "Trésorier",
    description: "Finance, budgets, charges et recouvrement",
    icon: "dollar-sign" as const,
    color: "#059669",
    required: false,
  },
  {
    id: "secretary",
    label: "Secrétaire",
    description: "Documents, réunions, procès-verbaux",
    icon: "file-text" as const,
    color: "#7C3AED",
    required: false,
  },
  {
    id: "committee_member",
    label: "Membre du Conseil",
    description: "Participation aux votes et décisions",
    icon: "users" as const,
    color: "#D97706",
    required: false,
  },
];

interface MemberForm {
  name: string;
  email: string;
  phone: string;
  skip: boolean;
}

const emptyForm = (): MemberForm => ({ name: "", email: "", phone: "", skip: false });

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  isDark,
  color,
  error,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  isDark: boolean;
  color: string;
  error?: string;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={[s.fieldLabel, { color: isDark ? "rgba(232,240,254,0.6)" : "#475569" }]}>{label}</Text>
      <View style={[s.fieldWrap, {
        backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.9)",
        borderColor: error ? "#EF4444" : (isDark ? "rgba(255,255,255,0.12)" : "rgba(37,99,235,0.2)"),
      }]}>
        <Feather name={icon} size={15} color={color} style={{ marginLeft: 12 }} />
        <TextInput
          style={[s.input, { color: isDark ? "#E8F0FE" : "#0A1628" }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={isDark ? "rgba(232,240,254,0.3)" : "#94A3B8"}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
          autoCorrect={false}
        />
      </View>
      {error ? (
        <View style={s.errorRow}>
          <Feather name="alert-circle" size={11} color="#EF4444" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TeamInviteScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { token } = useAuth();

  const [currentStep, setCurrentStep] = useState(0);
  const [forms, setForms] = useState<MemberForm[]>(ROLES.map(() => emptyForm()));
  const [errors, setErrors] = useState<string[]>(ROLES.map(() => ""));
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  const gradColors: [string, string] = isDark ? ["#070D1A", "#0D1929"] : ["#EFF6FF", "#F8FAFF"];
  const role = ROLES[currentStep];
  const form = forms[currentStep];

  function updateForm(field: keyof MemberForm, value: string) {
    setForms((prev) => {
      const next = [...prev];
      next[currentStep] = { ...next[currentStep], [field]: value };
      return next;
    });
    setErrors((prev) => { const next = [...prev]; next[currentStep] = ""; return next; });
  }

  function validate(): boolean {
    if (form.skip) return true;
    if (!form.name.trim() || form.name.trim().length < 2) {
      setErrors((prev) => { const n = [...prev]; n[currentStep] = "Nom complet requis"; return n; });
      return false;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErrors((prev) => { const n = [...prev]; n[currentStep] = "Adresse email invalide"; return n; });
      return false;
    }
    return true;
  }

  async function handleNext() {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!form.skip && form.name.trim()) {
      setInviting(true);
      try {
        await teamApi.invite({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          role: role.id,
        });
        setInvited((prev) => [...prev, role.label]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        Alert.alert(
          "Erreur d'invitation",
          err?.message ?? "Impossible d'envoyer l'invitation. Continuez, vous pourrez les ajouter depuis les paramètres.",
          [{ text: "Continuer", onPress: () => goNext() }]
        );
        setInviting(false);
        return;
      }
      setInviting(false);
    }

    goNext();
  }

  function goNext() {
    if (currentStep < ROLES.length - 1) {
      setCurrentStep(currentStep + 1);
      Haptics.selectionAsync();
    } else {
      setCompleted(true);
    }
  }

  function handleSkip() {
    Haptics.selectionAsync();
    goNext();
  }

  function goToDashboard() {
    router.replace("/(tabs)/" as any);
  }

  // ── Completion screen ─────────────────────────────────────────────────────

  if (completed) {
    return (
      <View style={[s.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}>
        <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40),
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: 24,
            alignItems: "center",
            gap: 24,
          }}
        >
          {/* Success animation */}
          <View style={[s.successCircle, { backgroundColor: "#10B98120", borderColor: "#10B981" }]}>
            <Feather name="check" size={48} color="#10B981" />
          </View>

          <View style={{ alignItems: "center", gap: 8 }}>
            <Text style={[s.doneTitle, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
              Résidence prête !
            </Text>
            <Text style={[s.doneSub, { color: isDark ? "rgba(232,240,254,0.6)" : "#64748B" }]}>
              Votre syndicat est entièrement configuré et opérationnel.
            </Text>
          </View>

          {/* Invitations sent */}
          {invited.length > 0 && (
            <View style={[s.invitedCard, { backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#fff", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.12)" }]}>
              <Text style={[s.invitedTitle, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
                Invitations envoyées
              </Text>
              {invited.map((name) => (
                <View key={name} style={s.invitedRow}>
                  <Feather name="mail" size={14} color="#10B981" />
                  <Text style={[s.invitedText, { color: isDark ? "rgba(232,240,254,0.75)" : "#374151" }]}>
                    {name}
                  </Text>
                  <View style={[s.invitedBadge, { backgroundColor: "#10B98118" }]}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#10B981" }}>Envoyé</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* What's next */}
          <View style={[s.nextStepsCard, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(37,99,235,0.04)", borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(37,99,235,0.12)" }]}>
            <Text style={[s.nextStepsTitle, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" }]}>
              PROCHAINES ÉTAPES
            </Text>
            {[
              { icon: "user-plus" as const, text: "Ajouter les copropriétaires et locataires" },
              { icon: "home" as const, text: "Configurer les appartements et lots" },
              { icon: "dollar-sign" as const, text: "Créer le premier budget prévisionnel" },
              { icon: "calendar" as const, text: "Planifier la première assemblée générale" },
            ].map((item) => (
              <View key={item.text} style={s.nextStepRow}>
                <View style={[s.nextStepIcon, { backgroundColor: "#2563EB18" }]}>
                  <Feather name={item.icon} size={14} color="#2563EB" />
                </View>
                <Text style={[s.nextStepText, { color: isDark ? "rgba(232,240,254,0.7)" : "#374151" }]}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: "#2563EB" }]}
            onPress={goToDashboard}
            activeOpacity={0.85}
          >
            <Feather name="grid" size={17} color="#fff" />
            <Text style={s.ctaBtnText}>Accéder au tableau de bord</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Invitation step ───────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: isDark ? "#070D1A" : "#EFF6FF" }]}>
      <LinearGradient colors={gradColors} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
          {/* Header */}
          <View style={{ gap: 6 }}>
            <Text style={[s.title, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>
              Constituer l'équipe
            </Text>
            <Text style={[s.subtitle, { color: isDark ? "rgba(232,240,254,0.55)" : "#64748B" }]}>
              Étape 3 sur 3 — Invitez votre équipe de gestion
            </Text>
          </View>

          {/* Progress dots */}
          <View style={s.progressRow}>
            {ROLES.map((r, i) => (
              <View
                key={r.id}
                style={[s.progressDot, {
                  flex: 1,
                  height: 4,
                  backgroundColor: i < currentStep
                    ? "#10B981"
                    : i === currentStep
                    ? r.color
                    : (isDark ? "rgba(255,255,255,0.1)" : "rgba(37,99,235,0.12)"),
                  borderRadius: 2,
                }]}
              />
            ))}
          </View>

          {/* Role card */}
          <View style={[s.roleCard, {
            backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#fff",
            borderColor: role.color + "40",
          }]}>
            <View style={[s.roleIconWrap, { backgroundColor: role.color + "18" }]}>
              <Feather name={role.icon} size={28} color={role.color} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={[s.roleName, { color: isDark ? "#E8F0FE" : "#0A1628" }]}>{role.label}</Text>
              <Text style={[s.roleDesc, { color: isDark ? "rgba(232,240,254,0.5)" : "#64748B" }]}>{role.description}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Text style={[s.stepCounter, { color: isDark ? "rgba(232,240,254,0.35)" : "#94A3B8" }]}>
              {currentStep + 1}/{ROLES.length}
            </Text>
          </View>

          {/* Previously invited */}
          {invited.length > 0 && (
            <View style={s.invitedMini}>
              {invited.map((name) => (
                <View key={name} style={[s.invitedChip, { backgroundColor: "#10B98115", borderColor: "#10B981" }]}>
                  <Feather name="check" size={11} color="#10B981" />
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#10B981" }}>{name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Form */}
          {!form.skip ? (
            <View style={{ gap: 16 }}>
              <Field
                label="Nom complet *"
                icon="user"
                value={form.name}
                onChangeText={(v) => updateForm("name", v)}
                placeholder={`Ex: Ali ${role.label}`}
                isDark={isDark}
                color={role.color}
                error={errors[currentStep] && !form.email ? errors[currentStep] : undefined}
              />
              <Field
                label="Adresse email *"
                icon="mail"
                value={form.email}
                onChangeText={(v) => updateForm("email", v)}
                placeholder="email@example.ma"
                keyboardType="email-address"
                isDark={isDark}
                color={role.color}
                error={errors[currentStep] && form.name ? errors[currentStep] : undefined}
              />
              <Field
                label="Téléphone (optionnel)"
                icon="phone"
                value={form.phone}
                onChangeText={(v) => updateForm("phone", v)}
                placeholder="+212 6XX XXX XXX"
                keyboardType="phone-pad"
                isDark={isDark}
                color={role.color}
              />
              {errors[currentStep] ? (
                <View style={s.formError}>
                  <Feather name="alert-circle" size={13} color="#EF4444" />
                  <Text style={s.formErrorText}>{errors[currentStep]}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[s.skippedCard, { backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(37,99,235,0.04)", borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(37,99,235,0.1)" }]}>
              <Feather name="skip-forward" size={20} color={isDark ? "rgba(232,240,254,0.3)" : "#94A3B8"} />
              <Text style={[s.skippedText, { color: isDark ? "rgba(232,240,254,0.4)" : "#94A3B8" }]}>
                Ce rôle sera ignoré. Vous pourrez ajouter un {role.label} ultérieurement depuis les paramètres.
              </Text>
            </View>
          )}

          {/* Info box */}
          <View style={[s.infoBox, { backgroundColor: role.color + "10", borderColor: role.color + "25" }]}>
            <Feather name="info" size={13} color={role.color} />
            <Text style={[s.infoText, { color: isDark ? "rgba(232,240,254,0.6)" : "#475569" }]}>
              Un email d'invitation avec un mot de passe temporaire sera envoyé à l'adresse indiquée.
            </Text>
          </View>

          {/* Action buttons */}
          <View style={{ gap: 10 }}>
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: role.color, opacity: inviting ? 0.7 : 1 }]}
              onPress={handleNext}
              disabled={inviting}
              activeOpacity={0.85}
            >
              {inviting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={s.ctaBtnText}>
                    {form.skip ? "Passer" : currentStep === ROLES.length - 1 ? "Terminer" : "Inviter et continuer"}
                  </Text>
                  <Feather name="arrow-right" size={17} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            {!form.skip ? (
              <TouchableOpacity
                style={[s.skipBtn, { borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(37,99,235,0.18)" }]}
                onPress={() => { updateForm("skip", "true" as any); setErrors((p) => { const n = [...p]; n[currentStep] = ""; return n; }); }}
              >
                <Text style={[s.skipBtnText, { color: isDark ? "rgba(232,240,254,0.45)" : "#94A3B8" }]}>
                  Ignorer ce rôle pour l'instant
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.skipBtn, { borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(37,99,235,0.18)" }]}
                onPress={() => updateForm("skip", "false" as any)}
              >
                <Text style={[s.skipBtnText, { color: role.color }]}>
                  Remplir les informations
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Early exit */}
          <TouchableOpacity
            style={{ alignItems: "center", paddingVertical: 4 }}
            onPress={goToDashboard}
          >
            <Text style={[s.earlyExitText, { color: isDark ? "rgba(232,240,254,0.25)" : "#CBD5E1" }]}>
              Configurer l'équipe plus tard
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  title: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.3 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },

  progressRow: { flexDirection: "row", gap: 6 },
  progressDot: {},

  roleCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 20, borderWidth: 1.5, padding: 18,
  },
  roleIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  roleName: { fontFamily: "Inter_700Bold", fontSize: 18 },
  roleDesc: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  stepCounter: { fontFamily: "Inter_500Medium", fontSize: 13 },

  invitedMini: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  invitedChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },

  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  fieldWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: 1.5, minHeight: 50,
  },
  input: {
    fontFamily: "Inter_400Regular", fontSize: 15,
    paddingVertical: 12, paddingHorizontal: 10, flex: 1,
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 12, color: "#EF4444" },

  formError: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: 10,
    backgroundColor: "#EF444412", borderColor: "#EF4444", borderWidth: 1,
  },
  formErrorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#EF4444", flex: 1 },

  skippedCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 16,
  },
  skippedText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, flex: 1 },

  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, flex: 1 },

  ctaBtn: {
    borderRadius: 16, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
  },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },

  skipBtn: {
    borderRadius: 14, borderWidth: 1,
    paddingVertical: 13, alignItems: "center",
  },
  skipBtnText: { fontFamily: "Inter_500Medium", fontSize: 14 },

  earlyExitText: { fontFamily: "Inter_400Regular", fontSize: 12 },

  // Completion screen
  successCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, marginTop: 20,
  },
  doneTitle: { fontFamily: "Inter_700Bold", fontSize: 28, textAlign: "center", letterSpacing: -0.3 },
  doneSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },

  invitedCard: {
    width: "100%", borderRadius: 16, borderWidth: 1, padding: 16, gap: 12,
  },
  invitedTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 4 },
  invitedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  invitedText: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
  invitedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  nextStepsCard: {
    width: "100%", borderRadius: 16, borderWidth: 1, padding: 16, gap: 12,
  },
  nextStepsTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 11,
    letterSpacing: 1.2, textTransform: "uppercase",
  },
  nextStepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nextStepIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  nextStepText: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
});
