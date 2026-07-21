/**
 * VeridianLogo — Official brand logo component
 *
 * Renders the VERIDIAN shield icon (SVG vector) combined with the wordmark
 * and optional tagline.
 *
 * Variants:
 *   "full"       — Shield stacked above wordmark + tagline (login, splash, onboarding)
 *   "horizontal" — Shield left, wordmark right (sidebar, header, docs)
 *   "icon"       — Shield only, no text (nav bar icon, avatar, app icon slot)
 *   "compact"    — Small shield only (tight spaces, PDF corner mark)
 *
 * Color schemes:
 *   "light"  — Dark navy shield + navy/blue wordmark on white/light bg
 *   "dark"   — White shield + white/blue wordmark on dark/navy bg
 *
 * Size:
 *   Controls the shield height in pixels; all other dimensions scale proportionally.
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { VERIDIAN } from "@/constants/brand";

// ─── Shield Icon ─────────────────────────────────────────────────────────────

interface ShieldProps {
  /** Total height of the shield in dp */
  height: number;
  isDark: boolean;
}

/**
 * The VERIDIAN shield — a hexagonal heraldic shield with three stylised
 * building bars and five community dots at the base.
 *
 * Coordinate space: viewBox "0 0 88 100".
 * Shield occupies x 4–84, y 3–98.
 */
function Shield({ height, isDark }: ShieldProps) {
  // Maintain aspect ratio 88:100
  const width = (height * 88) / 100;

  const shieldFill = isDark
    ? "rgba(255,255,255,0.07)"
    : `${VERIDIAN.colors.blue}09`;
  const shieldStroke = isDark ? "#FFFFFF" : VERIDIAN.colors.navyDeep;
  const dotFill = isDark ? "rgba(255,255,255,0.8)" : VERIDIAN.colors.blue;
  const gradId = isDark ? "bgDark" : "bgLight";

  return (
    <Svg width={width} height={height} viewBox="0 0 88 100">
      <Defs>
        {/* Building gradient — bottom-anchored for depth */}
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={VERIDIAN.colors.bluePale} stopOpacity="1" />
          <Stop offset="1" stopColor={VERIDIAN.colors.blue} stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* ── Shield body ────────────────────────────────────── */}
      {/*  Heraldic shield: wide top corners, rounded sides,   */}
      {/*  curves to a pointed bottom.                         */}
      <Path
        d="M44,4 L83,17 L83,57 Q83,81 44,97 Q5,81 5,57 L5,17 Z"
        fill={shieldFill}
        stroke={shieldStroke}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />

      {/* ── Left building (stepped top) ───────────────────── */}
      {/*  The step notch on the top-right of the left bar     */}
      {/*  references the F/S letterform in the logo mark.     */}
      <Path
        d="M21,49 L21,76 L32,76 L32,63 L29,63 L29,49 Z"
        fill={`url(#${gradId})`}
      />

      {/* ── Centre building (tallest) ─────────────────────── */}
      <Rect
        x="38"
        y="29"
        width="10"
        height="47"
        rx="1"
        fill={`url(#${gradId})`}
      />

      {/* ── Right building ────────────────────────────────── */}
      <Rect
        x="54"
        y="41"
        width="10"
        height="35"
        rx="1"
        fill={`url(#${gradId})`}
      />

      {/* ── Community dots (5 circles) ────────────────────── */}
      {[29, 37, 46, 55, 63].map((cx) => (
        <Circle key={cx} cx={cx} cy={85} r={3} fill={dotFill} />
      ))}
    </Svg>
  );
}

// ─── Public Props ─────────────────────────────────────────────────────────────

export type LogoVariant = "full" | "horizontal" | "icon" | "compact";
export type LogoColorScheme = "light" | "dark";

interface VeridianLogoProps {
  variant?: LogoVariant;
  colorScheme?: LogoColorScheme;
  /**
   * Shield height in dp. Everything else scales from this.
   * Recommended values: 40 (sidebar), 72 (login), 90 (splash), 24 (compact).
   */
  size?: number;
  showTagline?: boolean;
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VeridianLogo({
  variant = "full",
  colorScheme = "light",
  size = 80,
  showTagline = true,
  style,
}: VeridianLogoProps) {
  const isDark = colorScheme === "dark";

  const textColor = isDark ? VERIDIAN.colors.white : VERIDIAN.colors.navyDeep;
  const taglineColor = isDark
    ? VERIDIAN.colors.bluePale
    : VERIDIAN.colors.blue;

  // Wordmark font size — "VERIDIAN" should feel substantial relative to shield
  const wordmarkSize = Math.round(size * 0.31);
  const taglineSize = Math.max(8, Math.round(size * 0.11));
  const wordmarkTracking = Math.round(size * 0.05 * 10) / 10;

  // ── Icon only ──────────────────────────────────────────────────────────────
  if (variant === "icon" || variant === "compact") {
    const shieldHeight = variant === "compact" ? Math.round(size * 0.75) : size;
    return (
      <View style={style}>
        <Shield height={shieldHeight} isDark={isDark} />
      </View>
    );
  }

  // ── Horizontal (shield left, wordmark right) ───────────────────────────────
  if (variant === "horizontal") {
    const shieldHeight = Math.round(size * 0.75);
    return (
      <View style={[s.row, style]}>
        <Shield height={shieldHeight} isDark={isDark} />
        <View style={s.wordmarkCol}>
          <Text
            style={[
              s.wordmark,
              { color: textColor, fontSize: wordmarkSize, letterSpacing: wordmarkTracking },
            ]}
            allowFontScaling={false}
          >
            VERIDIAN
          </Text>
          {showTagline && (
            <Text
              style={[
                s.tagline,
                { color: taglineColor, fontSize: taglineSize, letterSpacing: wordmarkTracking * 0.5 },
              ]}
              allowFontScaling={false}
              numberOfLines={1}
            >
              {VERIDIAN.taglineShort.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ── Full (shield above, wordmark below) ────────────────────────────────────
  return (
    <View style={[s.col, style]}>
      <Shield height={size} isDark={isDark} />
      <Text
        style={[
          s.wordmark,
          {
            color: textColor,
            fontSize: wordmarkSize,
            letterSpacing: wordmarkTracking,
            marginTop: Math.round(size * 0.09),
          },
        ]}
        allowFontScaling={false}
      >
        VERIDIAN
      </Text>
      {showTagline && (
        <Text
          style={[
            s.tagline,
            {
              color: taglineColor,
              fontSize: taglineSize,
              letterSpacing: wordmarkTracking * 0.45,
              marginTop: 3,
            },
          ]}
          allowFontScaling={false}
        >
          {VERIDIAN.tagline.toUpperCase()}
        </Text>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  col: {
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wordmarkCol: {
    justifyContent: "center",
    gap: 2,
  },
  wordmark: {
    fontFamily: "Inter_700Bold",
  },
  tagline: {
    fontFamily: "Inter_500Medium",
  },
});
