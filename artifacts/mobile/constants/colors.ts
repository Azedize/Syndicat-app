/**
 * MIZAN Design System — semantic color tokens.
 *
 * Direction « Riad au crépuscule » : a condominium is a riad — private rooms
 * around a shared courtyard. The palette comes from its materials, not from a
 * generic SaaS blue:
 *   - Majorelle   the single action color (the cobalt-violet of Marrakech)
 *   - Nuit        indigo night over the courtyard: heroes and dark surfaces
 *   - Tadelakt    warm ivory plaster: the light page background
 *   - Laiton      brass: the balance line and rare highlights, never an action
 *   - Zellige     emerald for settled states; cedar teal for information
 * Screens use the semantic names below, never raw hex values.
 *
 * Status colors come in three tones:
 *   <status>      icons, indicators, strokes
 *   <status>Soft  tinted backgrounds (badges, banners)
 *   <status>Text  readable text on the soft background (WCAG AA ≥ 4.5:1,
 *                 measured — see docs/design/DESIGN_SYSTEM.md)
 * A status is never conveyed by color alone: pair it with an icon and a label
 * (see components/ui/StatusBadge).
 */

const colors = {
  light: {
    text: "#1B1833",
    tint: "#5A4AD6",

    /** Page and text */
    background: "#F7F4EE",
    foreground: "#1B1833",

    /** Surfaces: page < surface/card < elevated (sheets, popovers) */
    card: "#FFFFFF",
    cardForeground: "#1B1833",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceMuted: "#F0ECE4",
    // Loading placeholders (shimmer): base and the light sweeping over it.
    skeleton: "#ECE6DB",
    skeletonHighlight: "#F8F4EC",

    /** Text hierarchy */
    textSecondary: "#4D4964",
    textMuted: "#6A6680",

    /** Brand */
    primary: "#5A4AD6",
    primaryStrong: "#4637BE",
    primarySoft: "#EEEBFC",
    // Glass navigation
    tabActive: "#1D5FD8",
    tabGlow: "rgba(37, 99, 235, 0.38)",
    tabIndicator: "rgba(37, 99, 235, 0.12)",
    tabIndicatorBorder: "rgba(37, 99, 235, 0.26)",
    glassFill: "rgba(255, 255, 255, 0.68)",
    glassFillDense: "rgba(255, 255, 255, 0.97)",
    glassBorder: "rgba(27, 24, 51, 0.10)",
    glassHighlight: "rgba(255, 255, 255, 0.85)",
    glassShadow: "rgba(26, 22, 64, 0.16)",
    primaryForeground: "#FFFFFF",
    secondary: "#EEEBFC",
    secondaryForeground: "#4637BE",
    navy: "#1A1640",
    navyForeground: "#FFFFFF",
    gold: "#B8862F",
    goldSoft: "#FBF3E2",
    goldText: "#8C6418",
    teal: "#0F6E7D",

    /** Utility */
    muted: "#F0ECE4",
    mutedForeground: "#6A6680",
    accent: "#ECE8FB",
    accentForeground: "#4637BE",

    /** States */
    success: "#0B7A57",
    successSoft: "#E5F4EC",
    successText: "#05664A",
    successForeground: "#FFFFFF",
    warning: "#C98511",
    warningSoft: "#FBF1DD",
    warningText: "#8A5A08",
    warningForeground: "#2A1A00",
    danger: "#B42530",
    dangerSoft: "#FBE9EA",
    dangerText: "#9C1F29",
    destructive: "#B42530",
    destructiveForeground: "#FFFFFF",
    info: "#0F6E7D",
    infoSoft: "#E4F2F4",
    infoText: "#0B5A66",
    infoForeground: "#FFFFFF",
    disabled: "#D9D3C8",
    disabledForeground: "#7D7890",
    focus: "#5A4AD6",

    /** Lines and inputs */
    border: "#E7E1D6",
    borderStrong: "#D3CBBE",
    input: "#F1EDE6",
    overlay: "rgba(20, 16, 44, 0.5)",
    shadow: "#1A1640",
  },
  dark: {
    text: "#EDEAF6",
    tint: "#B39CFF",

    background: "#0E0C1C",
    foreground: "#EDEAF6",

    card: "#17142B",
    cardForeground: "#EDEAF6",
    surface: "#17142B",
    surfaceElevated: "#1F1B3D",
    surfaceMuted: "#1C1934",
    skeleton: "#221E3D",
    skeletonHighlight: "#2E2952",

    textSecondary: "#C8C3DC",
    textMuted: "#A6A1BE",

    primary: "#6B5DE6",
    primaryStrong: "#5A4AD6",
    primarySoft: "#252052",
    // Glass navigation
    tabActive: "#8AB8FF",
    tabGlow: "rgba(96, 165, 250, 0.42)",
    tabIndicator: "rgba(96, 165, 250, 0.18)",
    tabIndicatorBorder: "rgba(138, 184, 255, 0.34)",
    glassFill: "rgba(23, 20, 43, 0.62)",
    glassFillDense: "rgba(23, 20, 43, 0.97)",
    glassBorder: "rgba(255, 255, 255, 0.12)",
    glassHighlight: "rgba(255, 255, 255, 0.14)",
    glassShadow: "rgba(0, 0, 0, 0.45)",
    primaryForeground: "#FFFFFF",
    secondary: "#252052",
    secondaryForeground: "#C9BEFF",
    navy: "#120F2C",
    navyForeground: "#FFFFFF",
    gold: "#E3B75C",
    goldSoft: "#2B2414",
    goldText: "#E3B75C",
    teal: "#5CC6D4",

    muted: "#1C1934",
    mutedForeground: "#A6A1BE",
    accent: "#252052",
    accentForeground: "#C9BEFF",

    success: "#4CD39B",
    successSoft: "#10291F",
    successText: "#7FE3B8",
    successForeground: "#0E0C1C",
    warning: "#F2B84B",
    warningSoft: "#2E2410",
    warningText: "#F8D08A",
    warningForeground: "#2A1A00",
    danger: "#F58A90",
    dangerSoft: "#35161B",
    dangerText: "#F9B2B6",
    destructive: "#C8323C",
    destructiveForeground: "#FFFFFF",
    info: "#5CC6D4",
    infoSoft: "#0F2A30",
    infoText: "#9BDDE6",
    infoForeground: "#0E0C1C",
    disabled: "#2C2846",
    disabledForeground: "#7D7896",
    focus: "#B39CFF",

    border: "#272341",
    borderStrong: "#37325A",
    input: "#1C1934",
    overlay: "rgba(0, 0, 0, 0.62)",
    shadow: "#000000",
  },
  radius: 14,
};

export type ThemeColors = typeof colors.light;
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

export default colors;
