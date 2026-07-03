import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";

const TOTAL_STEPS = 4;

const CITIES = ["Casablanca", "Rabat", "Marrakech", "Fès", "Agadir", "Tanger", "Meknès", "Oujda", "Kénitra", "Tétouan", "Salé", "Safi", "El Jadida", "Autre"];
const SECTORS = ["Éducation", "Santé", "Administration publique", "Industrie", "Commerce", "Banque & Finance", "Ingénierie", "Juridique", "Autre"];
const SENIORITY = ["< 2 ans", "2 – 5 ans", "5 – 10 ans", "10 – 20 ans", "> 20 ans"];

const AVATAR_COLORS = ["#7c3aed", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#8b5cf6"];

const STEP_LABELS = ["Informations", "Profession", "Avatar", "Confirmation"];
const STEP_ICONS: Array<keyof typeof Feather.glyphMap> = ["user", "briefcase", "image", "check-circle"];

interface FormState {
  fullName: string;
  phone: string;
  city: string;
  address: string;
  employer: string;
  sector: string;
  seniority: string;
  avatarColor: string;
  avatarInitials: string;
  acceptTerms: boolean;
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuth();
  const { isWide } = useBreakpoints();
  const topPad = isWide ? 0 : (Platform.OS === "web" ? 67 : insets.top);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    fullName: user?.name ?? "",
    phone: user?.phone ?? "",
    city: "",
    address: "",
    employer: "",
    sector: "Éducation",
    seniority: "2 – 5 ans",
    avatarColor: "#7c3aed",
    avatarInitials: (user?.name ?? "??").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
    acceptTerms: false,
  });

  const progress = (step / TOTAL_STEPS) * 100;

  const update = (field: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!form.fullName.trim()) { Alert.alert("Requis", "Le nom complet est obligatoire."); return false; }
      if (!form.phone.trim()) { Alert.alert("Requis", "Le téléphone est obligatoire."); return false; }
      if (!form.city) { Alert.alert("Requis", "Veuillez sélectionner une ville."); return false; }
      return true;
    }
    if (step === 2) {
      if (!form.employer.trim()) { Alert.alert("Requis", "L'employeur est obligatoire."); return false; }
      return true;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 1) setStep((s) => s - 1);
  };

  const handleFinish = () => {
    if (!form.acceptTerms) {
      Alert.alert("Conditions requises", "Veuillez accepter les conditions d'utilisation pour continuer.");
      return;
    }
    updateUser({ name: form.fullName, phone: form.phone });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Profil complété !", "Votre profil a été enregistré avec succès.", [
      { text: "Accéder à l'application", onPress: () => router.replace("/(tabs)/" as any) },
    ]);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Ces informations permettront aux autres membres de vous identifier.
            </Text>
            <Field label="Nom complet *" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Prénom et NOM"
                placeholderTextColor={colors.mutedForeground}
                value={form.fullName}
                onChangeText={(v) => { update("fullName", v); update("avatarInitials", v.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()); }}
              />
            </Field>
            <Field label="Téléphone *" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="+212 6 00 00 00 00"
                placeholderTextColor={colors.mutedForeground}
                value={form.phone}
                onChangeText={(v) => update("phone", v)}
                keyboardType="phone-pad"
              />
            </Field>
            <Field label="Adresse" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Rue, quartier..."
                placeholderTextColor={colors.mutedForeground}
                value={form.address}
                onChangeText={(v) => update("address", v)}
              />
            </Field>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Ville *</Text>
            <View style={styles.chipGrid}>
              {CITIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, { backgroundColor: form.city === c ? colors.primary : colors.muted, borderColor: form.city === c ? colors.primary : colors.border }]}
                  onPress={() => { update("city", c); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, { color: form.city === c ? "#fff" : colors.foreground }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Informations professionnelles pour personnaliser votre expérience syndicale.
            </Text>
            <Field label="Établissement / Employeur *" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Ex: Lycée Al Kindi, Casablanca"
                placeholderTextColor={colors.mutedForeground}
                value={form.employer}
                onChangeText={(v) => update("employer", v)}
              />
            </Field>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Secteur d'activité</Text>
            <View style={styles.chipGrid}>
              {SECTORS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, { backgroundColor: form.sector === s ? colors.primary : colors.muted, borderColor: form.sector === s ? colors.primary : colors.border }]}
                  onPress={() => { update("sector", s); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.chipText, { color: form.sector === s ? "#fff" : colors.foreground }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Ancienneté</Text>
            <View style={styles.seniorityRow}>
              {SENIORITY.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.seniorityChip, { backgroundColor: form.seniority === s ? colors.primary + "18" : colors.muted, borderColor: form.seniority === s ? colors.primary : colors.border }]}
                  onPress={() => { update("seniority", s); Haptics.selectionAsync(); }}
                >
                  <Text style={[styles.seniorityText, { color: form.seniority === s ? colors.primary : colors.mutedForeground }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Choisissez la couleur de votre avatar. Vos initiales seront affichées automatiquement.
            </Text>
            <View style={styles.avatarPreview}>
              <View style={[styles.avatarBig, { backgroundColor: form.avatarColor }]}>
                <Text style={styles.avatarBigText}>{form.avatarInitials || "??"}</Text>
              </View>
              <Text style={[styles.avatarName, { color: colors.foreground }]}>{form.fullName || "Votre nom"}</Text>
              <Text style={[styles.avatarCity, { color: colors.mutedForeground }]}>{form.city || "Ville non définie"}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Couleur de l'avatar</Text>
            <View style={styles.colorGrid}>
              {AVATAR_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c, borderWidth: form.avatarColor === c ? 3 : 0, borderColor: "#fff" }]}
                  onPress={() => { update("avatarColor", c); Haptics.selectionAsync(); }}
                >
                  {form.avatarColor === c && <Feather name="check" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>
              Vérifiez vos informations avant de finaliser la création de votre profil.
            </Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryAvatar}>
                <View style={[styles.avatarMedium, { backgroundColor: form.avatarColor }]}>
                  <Text style={styles.avatarMediumText}>{form.avatarInitials}</Text>
                </View>
                <View>
                  <Text style={[styles.summaryName, { color: colors.foreground }]}>{form.fullName}</Text>
                  <Text style={[styles.summaryRole, { color: colors.mutedForeground }]}>{user?.role === "syndicate_admin" ? "Admin Syndicat" : "Membre"}</Text>
                </View>
              </View>
              <View style={[styles.summarySep, { backgroundColor: colors.border }]} />
              {[
                { icon: "phone" as const, label: "Téléphone", value: form.phone },
                { icon: "map-pin" as const, label: "Ville", value: form.city },
                { icon: "briefcase" as const, label: "Employeur", value: form.employer },
                { icon: "layers" as const, label: "Secteur", value: form.sector },
                { icon: "clock" as const, label: "Ancienneté", value: form.seniority },
              ].map(({ icon, label, value }, i) => (
                <View key={label}>
                  {i > 0 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
                  <View style={styles.summaryRow}>
                    <View style={[styles.summaryIcon, { backgroundColor: colors.primary + "15" }]}>
                      <Feather name={icon} size={13} color={colors.primary} />
                    </View>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground }]} numberOfLines={1}>{value || "—"}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.termsRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => { update("acceptTerms", !form.acceptTerms); Haptics.selectionAsync(); }}
            >
              <View style={[styles.checkbox, { backgroundColor: form.acceptTerms ? colors.primary : "transparent", borderColor: form.acceptTerms ? colors.primary : colors.mutedForeground }]}>
                {form.acceptTerms && <Feather name="check" size={12} color="#fff" />}
              </View>
              <Text style={[styles.termsText, { color: colors.foreground }]}>
                J'accepte les{" "}
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }} onPress={() => router.push("/cgu" as any)}>
                  conditions d'utilisation
                </Text>{" "}
                et la politique de confidentialité (Loi 09-08 CNDP)
              </Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          {step > 1 ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.foreground} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.replace("/(tabs)/" as any)} style={styles.backBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Compléter le profil</Text>
            <Text style={[styles.stepIndicator, { color: colors.mutedForeground }]}>Étape {step} / {TOTAL_STEPS}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { width: `${progress}%` as any, backgroundColor: colors.primary }]} />
        </View>
        {/* Step tabs */}
        <View style={styles.stepTabs}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <View key={label} style={styles.stepTab}>
                <View style={[styles.stepCircle, { backgroundColor: done ? colors.primary : active ? colors.primary + "20" : colors.muted, borderColor: active ? colors.primary : "transparent", borderWidth: active ? 2 : 0 }]}>
                  {done ? (
                    <Feather name="check" size={12} color="#fff" />
                  ) : (
                    <Feather name={STEP_ICONS[i]} size={12} color={active ? colors.primary : colors.mutedForeground} />
                  )}
                </View>
                <Text style={[styles.stepTabText, { color: active ? colors.primary : colors.mutedForeground }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.stepTitle, { color: colors.foreground }]}>
          {["Informations personnelles", "Informations professionnelles", "Photo de profil", "Récapitulatif"][step - 1]}
        </Text>
        {renderStep()}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: colors.primary }]}
          onPress={step === TOTAL_STEPS ? handleFinish : handleNext}
          activeOpacity={0.85}
        >
          {step === TOTAL_STEPS ? (
            <>
              <Feather name="check-circle" size={18} color="#fff" />
              <Text style={styles.nextBtnText}>Finaliser le profil</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextBtnText}>Continuer</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.skipText, { color: colors.mutedForeground }]} onPress={() => router.replace("/(tabs)/" as any)}>
          Compléter plus tard
        </Text>
      </View>
    </View>
  );
}

function Field({ label, colors, children }: { label: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.fieldBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  headerTop: { flexDirection: "row", alignItems: "center" },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontFamily: "Inter_700Bold" },
  stepIndicator: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  stepTabs: { flexDirection: "row", justifyContent: "space-between" },
  stepTab: { alignItems: "center", gap: 4, flex: 1 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepTabText: { fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  stepTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 16 },
  stepContent: { gap: 16 },
  stepDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  fieldBox: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  input: { fontSize: 14, fontFamily: "Inter_400Regular" },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  seniorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  seniorityChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  seniorityText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  avatarPreview: { alignItems: "center", gap: 10, paddingVertical: 20 },
  avatarBig: { width: 100, height: 100, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  avatarBigText: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff" },
  avatarName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  avatarCity: { fontSize: 13, fontFamily: "Inter_400Regular" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center", paddingVertical: 8 },
  colorDot: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  summaryCard: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  summaryAvatar: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  avatarMedium: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarMediumText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#fff" },
  summaryName: { fontSize: 16, fontFamily: "Inter_700Bold" },
  summaryRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  summarySep: { height: 1, marginHorizontal: 16 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 },
  summaryIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  summaryLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: "50%" as any },
  sep: { height: 1, marginHorizontal: 14 },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  termsText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12, alignItems: "center" },
  nextBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16, borderRadius: 16 },
  nextBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" },
  skipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
