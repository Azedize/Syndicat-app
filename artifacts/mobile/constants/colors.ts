/**
 * MIZAN Design System — Color Palette
 *
 * Primary brand colors align with the MIZAN logo:
 *   Deep navy (#0B1F3A) + Signal blue (#1F5EFF) + Teal (#20B8A6)
 *
 * All screens reference `useColors()` which selects the correct
 * light or dark palette based on the system/user theme preference.
 */

const colors = {
  light: {
    text: "#0B1F3A",
    tint: "#1F5EFF",

    /** Main page background — barely-there cool-blue tint on white */
    background: "#F5F8FC",
    foreground: "#0B1F3A",

    card: "#FFFFFF",
    cardForeground: "#0B1F3A",

    /** Brand action blue — buttons, active nav, primary accents */
    primary: "#1F5EFF",
    primaryForeground: "#FFFFFF",

    /** Pale blue — chip backgrounds, secondary buttons */
    secondary: "#EDF3FF",
    secondaryForeground: "#1748C4",

    muted: "#F1F5F9",
    mutedForeground: "#64748B",

    accent: "#DCE8FF",
    accentForeground: "#1748C4",

    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",

    border: "#E2E8F0",
    input: "#E2E8F0",

    success: "#20B8A6",
    successForeground: "#FFFFFF",
    warning: "#D9A441",
    warningForeground: "#FFFFFF",
    info: "#3B82F6",
    infoForeground: "#FFFFFF",
  },
  dark: {
    text: "#EAF1FB",
    tint: "#8DB2FF",

    /** Deep navy — mirrors the logo's dark background panel */
    background: "#081A31",
    foreground: "#EAF1FB",

    /** Dark navy card surfaces */
    card: "#102B4D",
    cardForeground: "#EAF1FB",

    /** Bright blue for visibility on dark — primary CTA on navy */
    primary: "#4C7DFF",
    primaryForeground: "#FFFFFF",

    /** Dark blue-navy — secondary surfaces */
    secondary: "#15375E",
    secondaryForeground: "#B9CCFF",

    muted: "#102642",
    mutedForeground: "#8EA5C4",

    accent: "#15375E",
    accentForeground: "#B9CCFF",

    destructive: "#F87171",
    destructiveForeground: "#FFFFFF",

    border: "#27486D",
    input: "#27486D",

    success: "#42D1BF",
    successForeground: "#FFFFFF",
    warning: "#E6BC61",
    warningForeground: "#FFFFFF",
    info: "#60A5FA",
    infoForeground: "#FFFFFF",
  },
  radius: 12,
};

export default colors;
