import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { CONTACT } from "@/constants/contact";
import React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AuthHero, { AUTH_HERO_OVERLAP } from "@/components/brand/AuthHero";
import { SectionHeader } from "@/components/ui";
import { DURATION, STAGGER } from "@/constants/motion";
import { RADIUS, SPACING } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { crossPlatformShadow } from "@/lib/shadow";

// Contact address for large residences / demos. Shown only when configured:
// the previous hard-coded @mizan.ma addresses were not verified to exist.
const CONTACT_EMAIL = CONTACT.email;

interface ChoiceProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  primary?: boolean;
  index: number;
}

function Choice({ icon, label, sublabel, onPress, primary, index }: ChoiceProps) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  return (
    <Animated.View entering={FadeInDown.duration(DURATION.base).delay(index * STAGGER)}>
      <Pressable
        onPress={() => {
          if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
        style={({ pressed }) => [
          styles.choice,
          primary
            ? { backgroundColor: pressed ? colors.primaryStrong : colors.primary, borderColor: colors.primary }
            : { backgroundColor: pressed ? colors.surfaceMuted : colors.card, borderColor: colors.border },
          primary && crossPlatformShadow({ color: colors.primary, offsetY: 8, opacity: 0.28, radius: 16, elevation: 6 }),
          pressed && { transform: [{ scale: 0.985 }] },
        ]}
      >
        <View style={[styles.choiceIcon, { backgroundColor: primary ? "rgba(255,255,255,0.16)" : colors.primarySoft }]}>
          <Feather name={icon} size={20} color={primary ? "#FFFFFF" : colors.tint} />
        </View>
        <View style={styles.choiceCopy}>
          <Text style={[styles.choiceLabel, { color: primary ? "#FFFFFF" : colors.foreground }]}>{label}</Text>
          {sublabel ? <Text style={[styles.choiceSub, { color: primary ? "rgba(255,255,255,0.8)" : colors.textMuted }]}>{sublabel}</Text> : null}
        </View>
        <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={primary ? "rgba(255,255,255,0.85)" : colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

export default function GetStartedScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { t, isRTL } = useLanguage();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, direction: isRTL ? "rtl" : "ltr" }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: SPACING.LG, gap: SPACING.XL }} showsVerticalScrollIndicator={false}>
        <AuthHero icon="compass" title={t("gsTitle")} subtitle={t("gsSubtitle")} bleed={SPACING.LG} onBack={() => router.replace("/welcome" as any)} />

        <View style={[styles.section, { marginTop: -AUTH_HERO_OVERLAP - SPACING.XL }]}>
          <Choice index={0} primary icon="zap" label={t("gsCreate")} sublabel={t("gsCreateSub")} onPress={() => router.push("/register")} />
          <Choice index={1} icon="log-in" label={t("gsLogin")} sublabel={t("gsLoginSub")} onPress={() => router.replace("/login")} />
          {/* Sign-up creates a syndic (organisation) account. Residents are
              invited by their syndic, who creates their account. */}
          <View style={[styles.note, { backgroundColor: colors.infoSoft, borderColor: colors.info + "40" }]}>
            <Feather name="info" size={16} color={colors.info} />
            <Text style={[styles.noteText, { color: colors.infoText }]}>{t("gsResidentNote")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title={t("gsOther")} />
          <Choice index={2} icon="tag" label={t("gsPlans")} onPress={() => router.push("/plans")} />
          {CONTACT_EMAIL ? (
            <Choice index={3} icon="mail" label={t("gsSales")} sublabel={t("gsSalesSub")} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
          ) : null}
        </View>

        <Text style={[styles.legal, { color: colors.textMuted }]}>
          {t("gsLegalPrefix")}{" "}
          <Text style={{ color: colors.tint }} onPress={() => router.push("/cgu" as any)} accessibilityRole="link">
            {t("gsLegalTerms")}
          </Text>{" "}
          {t("gsLegalAnd")}{" "}
          <Text style={{ color: colors.tint }} onPress={() => router.push("/privacy" as any)} accessibilityRole="link">
            {t("gsLegalPrivacy")}
          </Text>
          .
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: SPACING.MD },
  choice: { flexDirection: "row", alignItems: "center", gap: SPACING.MD, padding: SPACING.LG, borderRadius: RADIUS.LG + 2, borderWidth: 1, minHeight: 76 },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  choiceCopy: { flex: 1, gap: 3 },
  choiceLabel: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22 },
  choiceSub: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18 },
  note: { flexDirection: "row", gap: 10, padding: 14, borderRadius: RADIUS.MD, borderWidth: 1 },
  noteText: { flex: 1, fontFamily: FONT.regular, fontSize: 13, lineHeight: 19 },
  legal: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 19, textAlign: "center" },
});
