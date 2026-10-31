import { Easing } from "react-native-reanimated";

/**
 * MIZAN motion language — « l'équilibre ».
 *
 * Things in MIZAN settle the way a balance beam settles: a quick move, one
 * soft overshoot, then rest. No bouncing loops, no motion that delays a task.
 *
 * Rules (DESIGN_SYSTEM.md, « Mouvement »):
 *   - Feedback (press, toggle) ≤ 150 ms; transitions ≤ 320 ms; the launch
 *     sequence is the only choreography longer than that (≈ 1.2 s) and never
 *     blocks: content is interactive while it plays.
 *   - Every animation respects the system « reduce motion » setting
 *     (Reanimated ReduceMotion.System, the default) and is skipped on
 *     low-memory devices (hooks/useMotion).
 *   - Motion explains a relation (where a thing comes from, what changed);
 *     decoration alone is not a reason to move.
 */
export const DURATION = {
  /** Press feedback, toggles */
  instant: 120,
  /** Small state changes (chip, badge) */
  quick: 180,
  /** Entrances, tab indicator */
  base: 260,
  /** Screen-level reveals */
  slow: 320,
  /** Launch choreography only */
  signature: 1100,
} as const;

/** Springs. `balance` = the house spring: one soft overshoot, then rest. */
export const SPRING = {
  balance: { damping: 14, stiffness: 140, mass: 0.9 },
  /** Press feedback: firm, no visible overshoot */
  press: { damping: 22, stiffness: 420, mass: 0.6 },
  /** Indicators that travel (tab pill) */
  glide: { damping: 20, stiffness: 220, mass: 0.8 },
} as const;

export const EASE = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
} as const;

/** Delay between items of a staggered entrance (max 6 items are staggered). */
export const STAGGER = 45;
export const STAGGER_MAX = 6;
