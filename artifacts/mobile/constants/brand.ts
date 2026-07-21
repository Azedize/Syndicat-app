/**
 * VERIDIAN Brand System
 * Property & Syndicate Management Platform
 *
 * The single source of truth for all brand tokens.
 * Import this (not colors.ts) for brand-identity–specific values.
 */

export const VERIDIAN = {
  /** Official platform name */
  name: "VERIDIAN",
  /** Official tagline — rendered in small caps below the wordmark */
  tagline: "Property & Syndicate Management",
  /** Short tagline used in compact / horizontal contexts */
  taglineShort: "Property & Syndicate Mgmt.",

  colors: {
    /** Primary dark navy — app icon bg, dark splash, dark sidebar */
    navyDeep: "#0A1628",
    /** Mid navy — dark mode card surfaces */
    navyMid: "#0D1929",
    /** Standard navy — body text on white, shield stroke on light bg */
    navy: "#1E2D4A",
    /** Brand action blue — primary CTA, buildings fill, active states */
    blue: "#2563EB",
    /** Lighter brand blue — icon gradients, dark-mode primary */
    blueLight: "#3B82F6",
    /** Pale blue — light-mode accent backgrounds */
    bluePale: "#60A5FA",
    /** Near-white with cool-blue tint — light mode page background */
    bgLight: "#F8FAFF",
    /** Pure white */
    white: "#FFFFFF",
    /** Gold accent — premium features, subscription highlights */
    gold: "#F59E0B",
  },

  /** Typography scale used in the wordmark */
  typography: {
    wordmarkTracking: 4,    // letter-spacing for "VERIDIAN"
    taglineTracking: 1.5,   // letter-spacing for the tagline
  },
} as const;

export type VeridianColors = typeof VERIDIAN.colors;
