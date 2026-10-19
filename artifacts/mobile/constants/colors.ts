/**
 * MIZAN Design System — semantic color tokens.
 *
 * Identity: "la balance" (mizan). Deep navy carries trust, signal blue is the
 * single action color, gold is reserved for the balance line and premium
 * highlights, teal for settled / governance states. Screens use the semantic
 * names below, never raw hex values.
 *
 * Status colors come in three tones:
 *   <status>      icons, indicators, strokes
 *   <status>Soft  tinted backgrounds (badges, banners)
 *   <status>Text  readable text on the soft background (WCAG AA ≥ 4.5:1)
 * A status is never conveyed by color alone: pair it with an icon and a label
 * (see components/ui/StatusBadge).
 */

const colors = {
  light: {
    text: "#0B1A30",
    tint: "#1F5EFF",

    /** Page and text */
    background: "#F4F6FA",
    foreground: "#0B1A30",

    /** Surfaces: page < surface/card < elevated (sheets, popovers) */
    card: "#FFFFFF",
    cardForeground: "#0B1A30",
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceMuted: "#EEF2F8",

    /** Text hierarchy */
    textSecondary: "#3D4B63",
    textMuted: "#5E6B80",

    /** Brand */
    primary: "#1F5EFF",
    primaryStrong: "#1546D1",
    primarySoft: "#E8EFFF",
    primaryForeground: "#FFFFFF",
    secondary: "#E8EFFF",
    secondaryForeground: "#1546D1",
    navy: "#0B1F3A",
    navyForeground: "#FFFFFF",
    gold: "#C8932F",
    goldSoft: "#FBF3E2",
    teal: "#11998A",

    /** Utility */
    muted: "#EEF2F8",
    mutedForeground: "#5E6B80",
    accent: "#E3EBFF",
    accentForeground: "#1546D1",

    /** States */
    success: "#0E9F6E",
    successSoft: "#E6F6EF",
    successText: "#05704D",
    successForeground: "#FFFFFF",
    warning: "#D9921A",
    warningSoft: "#FDF3E0",
    warningText: "#8A5300",
    warningForeground: "#2A1A00",
    danger: "#DC2626",
    dangerSoft: "#FDECEC",
    dangerText: "#B01E1E",
    destructive: "#DC2626",
    destructiveForeground: "#FFFFFF",
    info: "#2F6BE8",
    infoSoft: "#E8F0FE",
    infoText: "#1C4FB8",
    infoForeground: "#FFFFFF",
    disabled: "#C5CEDB",
    disabledForeground: "#7A8699",
    focus: "#1F5EFF",

    /** Lines and inputs */
    border: "#DFE5EE",
    borderStrong: "#C7D0DD",
    input: "#E7ECF4",
    overlay: "rgba(8, 18, 36, 0.48)",
    shadow: "#0B1F3A",
  },
  dark: {
    text: "#E9EFF8",
    tint: "#8DB2FF",

    background: "#06121F",
    foreground: "#E9EFF8",

    card: "#0E1E33",
    cardForeground: "#E9EFF8",
    surface: "#0E1E33",
    surfaceElevated: "#14273F",
    surfaceMuted: "#13243A",

    textSecondary: "#C2CFE2",
    textMuted: "#93A4BD",

    primary: "#5B8BFF",
    primaryStrong: "#3E73FF",
    primarySoft: "#16294A",
    primaryForeground: "#FFFFFF",
    secondary: "#16294A",
    secondaryForeground: "#B9CCFF",
    navy: "#0A1A30",
    navyForeground: "#FFFFFF",
    gold: "#E2B457",
    goldSoft: "#2A2414",
    teal: "#3CCFBD",

    muted: "#13243A",
    mutedForeground: "#93A4BD",
    accent: "#16294A",
    accentForeground: "#B9CCFF",

    success: "#34D399",
    successSoft: "#0F2E26",
    successText: "#6EE7B7",
    successForeground: "#FFFFFF",
    warning: "#F2B84B",
    warningSoft: "#2E2410",
    warningText: "#FAD38A",
    warningForeground: "#2A1A00",
    danger: "#F87171",
    dangerSoft: "#341619",
    dangerText: "#FCA5A5",
    destructive: "#F87171",
    destructiveForeground: "#FFFFFF",
    info: "#60A5FA",
    infoSoft: "#122A4A",
    infoText: "#A5CBFD",
    infoForeground: "#FFFFFF",
    disabled: "#2A3B52",
    disabledForeground: "#6B7C94",
    focus: "#8DB2FF",

    border: "#1E324C",
    borderStrong: "#2B4565",
    input: "#13243A",
    overlay: "rgba(0, 0, 0, 0.6)",
    shadow: "#000000",
  },
  radius: 12,
};

export type ThemeColors = typeof colors.light;
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

export default colors;
