/**
 * MIZAN Brand System
 * Community governance and residence operations platform.
 *
 * The single source of truth for brand identity tokens.
 */

export const MIZAN = {
  /** Official product name */
  name: "MIZAN",
  /** Short product name used in navigation, notifications and compact contexts */
  shortName: "MIZAN",
  /** Global descriptor used in formal product surfaces */
  tagline: "Community Governance & Residence Operations",
  /** Primary Morocco-market descriptor used in compact surfaces */
  taglineShort: "Gouvernance & gestion des résidences",

  colors: {
    /** Deep navy — trust, app icon background and dark surfaces */
    navyDeep: "#0B1F3A",
    /** Mid navy — dark mode card surfaces */
    navyMid: "#102B4D",
    /** Standard navy — body text and light-mode mark */
    navy: "#18385C",
    /** Signal blue — primary product action */
    blue: "#1F5EFF",
    /** Lighter signal blue — active states and gradients */
    blueLight: "#4C7DFF",
    /** Calm teal — governance and success accent */
    teal: "#20B8A6",
    /** Pale blue — light-mode accent backgrounds */
    bluePale: "#8DB2FF",
    /** Near-white with cool-blue tint — light mode page background */
    bgLight: "#F5F8FC",
    /** Pure white */
    white: "#FFFFFF",
    /** Muted gold — balance line and premium highlights */
    gold: "#D9A441",
  },

  /** Typography scale used in the wordmark */
  typography: {
    wordmarkTracking: 3.2,
    taglineTracking: 1.5,   // letter-spacing for the tagline
  },
} as const;

export type MizanColors = typeof MIZAN.colors;
