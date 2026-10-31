import { useCallback } from "react";
import type { Feather } from "@expo/vector-icons";
import type { StatusTone } from "@/components/ui/tone";
import { useLanguage } from "@/context/LanguageContext";

/**
 * Label, tone and icon of a call-for-funds (appel de fonds) status, as stored
 * by the API. Display only: the status itself is decided by the server.
 * A payment under review is never presented as paid.
 */
export function useCallStatus() {
  const { t } = useLanguage();
  return useCallback(
    (status: string | null | undefined): { label: string; tone: StatusTone; icon: keyof typeof Feather.glyphMap } => {
      switch (status) {
        case "paid":
          return { label: t("statusPaid"), tone: "success", icon: "check-circle" };
        case "partially_paid":
          return { label: t("statusPartiallyPaid"), tone: "info", icon: "pie-chart" };
        case "pending_validation":
          return { label: t("inValidation"), tone: "info", icon: "clock" };
        case "overdue":
          return { label: t("statusLate"), tone: "danger", icon: "alert-circle" };
        case "rejected":
          return { label: t("statusRejected"), tone: "danger", icon: "x-circle" };
        case "cancelled":
          return { label: t("statusCancelled"), tone: "neutral", icon: "slash" };
        case "pending":
          return { label: t("statusPending"), tone: "warning", icon: "clock" };
        default:
          return { label: status ?? "—", tone: "neutral", icon: "circle" };
      }
    },
    [t],
  );
}
