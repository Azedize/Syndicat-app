/**
 * Global design-system tokens for the MIZAN mobile app.
 *
 * Using these tokens ensures every screen uses the same spacing,
 * border-radius, and font-size values — the #1 fix for the
 * "different apps merged together" impression noted in the UX audit.
 *
 * Import: `import { SPACING, RADIUS, TYPOGRAPHY } from "@/constants/spacing";`
 */

/** Vertical / horizontal spacing values */
export const SPACING = {
  /** 4 px — tight internal gaps (icon + label, badge padding) */
  XS: 4,
  /** 8 px — gap between related elements */
  SM: 8,
  /** 12 px — card inner padding, medium gaps */
  MD: 12,
  /** 16 px — standard screen horizontal margin, card padding */
  LG: 16,
  /** 24 px — section separation */
  XL: 24,
  /** 32 px — large section / modal padding */
  XXL: 32,
} as const;

/** Border-radius values */
export const RADIUS = {
  /** 8 px — inputs, small buttons */
  SM: 8,
  /** 12 px — buttons, action sheets */
  MD: 12,
  /** 16 px — cards, modals */
  LG: 16,
  /** 20 px — chips, badges */
  XL: 20,
  /** Full pill */
  FULL: 9999,
} as const;

/** Font-size scale */
export const TYPOGRAPHY = {
  /** 10 px — micro labels, counts */
  XS: 10,
  /** 11 px — secondary metadata */
  SM: 11,
  /** 13 px — body text, descriptions */
  MD: 13,
  /** 14 px — base UI text */
  BASE: 14,
  /** 16 px — primary actions, headings */
  LG: 16,
  /** 20 px — screen titles */
  XL: 20,
  /** 24 px — hero numbers */
  XXL: 24,
} as const;
