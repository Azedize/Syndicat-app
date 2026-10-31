/**
 * MizanLogo — Official MIZAN brand component.
 *
 * Renders the MIZAN mark (components/brand/MizanMark: a riad arch holding a
 * level balance) with the wordmark and optional tagline.
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { MIZAN } from "@/constants/brand";
import { useLanguage } from "@/context/LanguageContext";
import MizanMark from "./MizanMark";

function Shield({ height }: { height: number; isDark: boolean }) {
  return <MizanMark size={height} tile />;
}

export type LogoVariant = "full" | "horizontal" | "icon" | "compact";
export type LogoColorScheme = "light" | "dark";

interface MizanLogoProps {
  variant?: LogoVariant;
  colorScheme?: LogoColorScheme;
  size?: number;
  showTagline?: boolean;
  style?: ViewStyle;
}

export default function MizanLogo({
  variant = "full",
  colorScheme = "light",
  size = 80,
  showTagline = true,
  style,
}: MizanLogoProps) {
  const isDark = colorScheme === "dark";
  const { t } = useLanguage();
  const textColor = isDark ? MIZAN.colors.white : MIZAN.colors.navyDeep;
  const taglineColor = isDark ? MIZAN.colors.bluePale : MIZAN.colors.blue;
  const wordmarkSize = Math.round(size * 0.31);
  const taglineSize = Math.max(8, Math.round(size * 0.11));
  const wordmarkTracking = Math.round(size * 0.05 * 10) / 10;

  if (variant === "icon" || variant === "compact") {
    const shieldHeight = variant === "compact" ? Math.round(size * 0.75) : size;
    return (
      <View style={style}>
        <Shield height={shieldHeight} isDark={isDark} />
      </View>
    );
  }

  if (variant === "horizontal") {
    const shieldHeight = Math.round(size * 0.75);
    return (
      <View style={[styles.row, style]}>
        <Shield height={shieldHeight} isDark={isDark} />
        <View style={styles.wordmarkCol}>
          <Text
            style={[styles.wordmark, { color: textColor, fontSize: wordmarkSize, letterSpacing: wordmarkTracking }]}
            allowFontScaling={false}
          >
            MIZAN
          </Text>
          {showTagline && (
            <Text
              style={[styles.tagline, { color: taglineColor, fontSize: taglineSize, letterSpacing: wordmarkTracking * 0.5 }]}
              allowFontScaling={false}
              numberOfLines={1}
            >
              {t("appTagline").toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.col, style]}>
      <Shield height={size} isDark={isDark} />
      <Text
        style={[
          styles.wordmark,
          { color: textColor, fontSize: wordmarkSize, letterSpacing: wordmarkTracking, marginTop: Math.round(size * 0.09) },
        ]}
        allowFontScaling={false}
      >
        MIZAN
      </Text>
      {showTagline && (
        <Text
          style={[
            styles.tagline,
            { color: taglineColor, fontSize: taglineSize, letterSpacing: wordmarkTracking * 0.45, marginTop: 3 },
          ]}
          allowFontScaling={false}
        >
          {t("appTagline").toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wordmarkCol: { justifyContent: "center", gap: 2 },
  // The wordmark is Latin in every language: always Fraunces.
  wordmark: { fontFamily: "Fraunces_600SemiBold" },
  tagline: { fontFamily: "Inter_500Medium" },
});