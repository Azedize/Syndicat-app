/**
 * AuthHero — the dusk band of every entry screen (password reset, codes,
 * registration): back control, the MIZAN mark, the step's icon and title.
 * Same language as the login screen; the form card below overlaps it
 * (marginTop: -AUTH_HERO_OVERLAP).
 */
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton, ZelligePattern } from "@/components/ui";
import { MIZAN } from "@/constants/brand";
import { displayFace, FONT } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import MizanMark from "./MizanMark";

/** How far the following card should overlap the band. */
export const AUTH_HERO_OVERLAP = 40;

interface AuthHeroProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
  onBack?: () => void;
  /** Horizontal padding of the parent, cancelled so the band is full width. */
  bleed?: number;
  /** Trailing control in the top row (e.g. a step counter). Defaults to the
   *  language choice, so every screen before sign-in offers it. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function AuthHero({ title, subtitle, icon, onBack, bleed = 0, right, style }: AuthHeroProps) {
  const insets = useSafeAreaInsets();
  const { t, isRTL, lang } = useLanguage();
  const goBack = useBackNavigation();
  const top = insets.top + (Platform.OS === "web" ? 16 : 10);

  return (
    <LinearGradient
      colors={["#2B2475", MIZAN.colors.navyDeep]}
      style={[styles.band, { paddingTop: top, marginHorizontal: -bleed, paddingHorizontal: 16 }, style]}
    >
      <ZelligePattern opacity={0.035} />
      <View style={styles.topRow}>
        <IconButton icon={isRTL ? "arrow-right" : "arrow-left"} variant="onDark" accessibilityLabel={t("back")} onPress={onBack ?? goBack} />
        <View style={styles.brand} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <MizanMark size={24} tile />
          <Text style={styles.word} allowFontScaling={false}>MIZAN</Text>
        </View>
        <View style={styles.right}>{right ?? <LanguageSwitcher variant="onDark" />}</View>
      </View>
      <View style={styles.copy}>
        {icon ? (
          <View style={styles.iconWrap}>
            <Feather name={icon} size={26} color="#F6DA94" />
          </View>
        ) : null}
        <Text style={[styles.title, lang === "ar" && { fontFamily: displayFace(lang), lineHeight: 38 }]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  band: { paddingBottom: AUTH_HERO_OVERLAP + 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: "hidden" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  word: { fontFamily: "Fraunces_600SemiBold", fontSize: 15, letterSpacing: 2.5, color: "#FFFFFF" },
  right: { minWidth: 44, alignItems: "flex-end" },
  copy: { alignItems: "center", gap: 10, marginTop: 18, paddingHorizontal: 8 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(246,218,148,0.35)",
  },
  title: { fontFamily: "Fraunces_600SemiBold", fontSize: 26, lineHeight: 33, color: "#FFFFFF", textAlign: "center" },
  subtitle: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 21, color: "rgba(255,255,255,0.78)", textAlign: "center", maxWidth: 420 },
});
