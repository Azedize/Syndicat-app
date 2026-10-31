import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { IconButton, ZelligePattern } from "@/components/ui";
import { displayFace, FONT } from "@/constants/typography";

interface ActionButton {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  /**
   * @deprecated Module colors are no longer used for headers: every screen
   * shares the MIZAN navy header. Kept for API compatibility.
   */
  color?: string;
  onBack?: () => void;
  action?: ActionButton;
  action2?: ActionButton;
  rightContent?: React.ReactNode;
}

/** Header of every secondary screen: Nuit band (indigo dusk), zellige texture, back + up to two actions. */
export default function ScreenHeader({
  title,
  subtitle,
  color,
  onBack,
  action,
  action2,
  rightContent,
}: Props) {
  const colors = useColors();
  const { isRTL, t, lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const goBack = useBackNavigation();
  const { isDark } = useTheme();

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const handleBack = onBack ?? goBack;

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.navy,
          paddingTop: topPad + 10,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
    >
      <LinearGradient
        colors={[colors.navy, isDark ? "#1A1640" : "#2B2475"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ZelligePattern opacity={0.035} />
      <IconButton
        icon={isRTL ? "arrow-right" : "arrow-left"}
        variant="onDark"
        onPress={handleBack}
        accessibilityLabel={t("back")}
      />

      <View style={styles.titles}>
        <Text style={[styles.title, lang === "ar" && { fontFamily: displayFace(lang), lineHeight: 30 }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightContent ? (
        <View style={styles.rightSlot}>{rightContent}</View>
      ) : (
        <View style={styles.actions}>
          {action2 ? (
            <IconButton icon={action2.icon} variant="onDark" onPress={action2.onPress} accessibilityLabel={action2.label ?? title} />
          ) : null}
          {action ? (
            <IconButton icon={action.icon} variant="onDark" onPress={action.onPress} accessibilityLabel={action.label ?? title} />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    minHeight: 56,
    overflow: "hidden",
  },
  titles: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontFamily: FONT.display,
    color: "#FFFFFF",
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FONT.regular,
    color: "rgba(255,255,255,0.75)",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  rightSlot: {
    flexShrink: 0,
  },
});
