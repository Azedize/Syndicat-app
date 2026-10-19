import type { Feather } from "@expo/vector-icons";
import type { StatusTone, ThemeColors } from "@/constants/colors";

export type { StatusTone };

/** The three tones of a status: indicator, soft background, readable text. */
export function toneColors(colors: ThemeColors, tone: StatusTone): { fg: string; bg: string; text: string } {
  switch (tone) {
    case "success":
      return { fg: colors.success, bg: colors.successSoft, text: colors.successText };
    case "warning":
      return { fg: colors.warning, bg: colors.warningSoft, text: colors.warningText };
    case "danger":
      return { fg: colors.danger, bg: colors.dangerSoft, text: colors.dangerText };
    case "info":
      return { fg: colors.info, bg: colors.infoSoft, text: colors.infoText };
    case "primary":
      return { fg: colors.primary, bg: colors.primarySoft, text: colors.secondaryForeground };
    default:
      return { fg: colors.mutedForeground, bg: colors.surfaceMuted, text: colors.textSecondary };
  }
}

/** Default icon of each tone, so a status is never shown by color alone. */
export const TONE_ICON: Record<StatusTone, keyof typeof Feather.glyphMap> = {
  success: "check-circle",
  warning: "clock",
  danger: "alert-circle",
  info: "info",
  primary: "circle",
  neutral: "minus-circle",
};
