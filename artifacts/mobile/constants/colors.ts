/**
 * VERIDIAN Design System — Color Palette
 *
 * Primary brand colors align with the VERIDIAN logo:
 *   Deep navy (#0A1628) + Brand blue (#2563EB / #3B82F6)
 *
 * All screens reference `useColors()` which selects the correct
 * light or dark palette based on the system/user theme preference.
 */

const colors = {
  light: {
    text: "#0A1628",
    tint: "#2563EB",

    /** Main page background — barely-there cool-blue tint on white */
    background: "#F8FAFF",
    foreground: "#0A1628",

    card: "#FFFFFF",
    cardForeground: "#0A1628",

    /** Brand action blue — buttons, active nav, primary accents */
    primary: "#1E40AF",
    primaryForeground: "#FFFFFF",

    /** Pale blue — chip backgrounds, secondary buttons */
    secondary: "#EFF6FF",
    secondaryForeground: "#1E40AF",

    muted: "#F1F5F9",
    mutedForeground: "#64748B",

    accent: "#DBEAFE",
    accentForeground: "#1E40AF",

    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",

    border: "#E2E8F0",
    input: "#E2E8F0",

    success: "#10B981",
    successForeground: "#FFFFFF",
    warning: "#F59E0B",
    warningForeground: "#FFFFFF",
    info: "#3B82F6",
    infoForeground: "#FFFFFF",
  },
  dark: {
    text: "#E8F0FE",
    tint: "#60A5FA",

    /** Deep navy — mirrors the logo's dark background panel */
    background: "#070D1A",
    foreground: "#E8F0FE",

    /** Dark navy card surfaces */
    card: "#0D1929",
    cardForeground: "#E8F0FE",

    /** Bright blue for visibility on dark — primary CTA on navy */
    primary: "#3B82F6",
    primaryForeground: "#FFFFFF",

    /** Dark blue-navy — secondary surfaces */
    secondary: "#162035",
    secondaryForeground: "#93C5FD",

    muted: "#0F1D32",
    mutedForeground: "#7A90B0",

    accent: "#162035",
    accentForeground: "#93C5FD",

    destructive: "#F87171",
    destructiveForeground: "#FFFFFF",

    border: "#1E3050",
    input: "#1E3050",

    success: "#34D399",
    successForeground: "#FFFFFF",
    warning: "#FBBF24",
    warningForeground: "#FFFFFF",
    info: "#60A5FA",
    infoForeground: "#FFFFFF",
  },
  radius: 12,
};

export default colors;
