/**
 * MIZAN Brand System
 * Community governance and residence operations platform.
 *
 * The single source of truth for brand identity tokens.
 * Rationale and usage rules: docs/design/DESIGN_SYSTEM.md.
 */

export const MIZAN = {
  /** Official product name — « mîzân », the balance (ميزان) */
  name: "MIZAN",
  /** Short product name used in navigation, notifications and compact contexts */
  shortName: "MIZAN",
  /** Global descriptor used in formal product surfaces */
  tagline: "Community Governance & Residence Operations",
  /** Primary Morocco-market descriptor used in compact surfaces */
  taglineShort: "Gouvernance & gestion des résidences",
  /** Brand promise used in strategy, metadata and formal communications */
  promise: "Clarté, confiance et gouvernance numérique pour chaque résidence.",
  /** Identity principles for future surfaces and campaigns */
  values: ["Confiance", "Transparence", "Gouvernance", "Sécurité", "Excellence"] as const,
  /** Mark: the arch of a riad courtyard holding a level brass beam — a shared
   *  home whose accounts stay in balance. */
  markMeaning: "L'arche d'un riad et un fléau d'équilibre : un lieu partagé, des comptes justes.",

  colors: {
    /** Nuit — indigo night over the courtyard: app icon, splash, heroes */
    navyDeep: "#14113A",
    /** Nuit, raised — dark card surfaces */
    navyMid: "#1F1B4A",
    /** Ink — body text and light-mode mark */
    navy: "#1B1833",
    /** Majorelle — the single action color */
    blue: "#5A4AD6",
    /** Majorelle, lit — active states and the mark's light side */
    blueLight: "#7E70F2",
    /** Cedar teal — information */
    teal: "#0F6E7D",
    /** Pale Majorelle — light accents on dark surfaces */
    bluePale: "#C9BEFF",
    /** Tadelakt — warm ivory page background */
    bgLight: "#F7F4EE",
    /** Pure white */
    white: "#FFFFFF",
    /** Laiton — brass balance beam and rare highlights */
    gold: "#C99A3E",
  },

  /** Typography scale used in the wordmark */
  typography: {
    wordmarkTracking: 3.2,
    taglineTracking: 1.5,   // letter-spacing for the tagline
  },
} as const;

export type MizanColors = typeof MIZAN.colors;
