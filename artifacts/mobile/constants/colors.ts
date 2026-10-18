/**
 * MIZAN Design System — Premium mobile color palette
 *
 * This palette keeps the existing brand direction while establishing a clearer
 * semantic layer for surfaces, text hierarchy, and status tokens. The goal is
 * to avoid arbitrary inline colors across screens while preserving the current
 * dark/light architecture.
 */

const colors = {
  light: {
    text: "#0F172A",
    tint: "#1F5EFF",

    /** Main background surfaces */
    background: "#F4F7FB",
    foreground: "#0F172A",

    /** Primary surfaces */
    card: "#FFFFFF",
    cardForeground: "#0F172A",
    surface: "#FFFFFF",
    surfaceElevated: "#F8FAFC",
    surfaceMuted: "#EEF4FF",

    /** Semantic text hierarchy */
    textSecondary: "#475569",
    textMuted: "#64748B",

    /** Brand colors */
    primary: "#1F5EFF",
    primaryForeground: "#FFFFFF",
    secondary: "#EAF1FF",
    secondaryForeground: "#183BBA",

    /** Utility surfaces */
    muted: "#EEF2F7",
    mutedForeground: "#64748B",
    accent: "#DCE9FF",
    accentForeground: "#183BBA",

    /** States */
    success: "#10B981",
    successForeground: "#FFFFFF",
    warning: "#E9A93A",
    warningForeground: "#FFFFFF",
    danger: "#EF4444",
    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",
    info: "#3B82F6",
    infoForeground: "#FFFFFF",
    disabled: "#CBD5E1",
    focus: "#1F5EFF",

    /** Borders and inputs */
    border: "#DDE6F2",
    input: "#E7EDF7",
  },
  dark: {
    text: "#EAF1FB",
    tint: "#8DB2FF",

    background: "#081A31",
    foreground: "#EAF1FB",

    card: "#102B4D",
    cardForeground: "#EAF1FB",
    surface: "#0F2340",
    surfaceElevated: "#132C4F",
    surfaceMuted: "#14305A",

    textSecondary: "#C8D7F0",
    textMuted: "#9EB6D8",

    primary: "#4C7DFF",
    primaryForeground: "#FFFFFF",
    secondary: "#15375E",
    secondaryForeground: "#B9CCFF",

    muted: "#102642",
    mutedForeground: "#8EA5C4",
    accent: "#15375E",
    accentForeground: "#B9CCFF",

    success: "#42D1BF",
    successForeground: "#FFFFFF",
    warning: "#E6BC61",
    warningForeground: "#FFFFFF",
    danger: "#F87171",
    destructive: "#F87171",
    destructiveForeground: "#FFFFFF",
    info: "#60A5FA",
    infoForeground: "#FFFFFF",
    disabled: "#475569",
    focus: "#8DB2FF",

    border: "#27486D",
    input: "#1A3357",
  },
  radius: 12,
};

export default colors;
