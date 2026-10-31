import { useEffect } from "react";
import { useToast } from "@/context/ToastContext";
import { notificationBus } from "@/hooks/useNotificationBus";

/**
 * Connects the notificationBus to the toast system so that
 * programmatic notificationBus.emit() calls still show toasts
 * (e.g. from explicit user actions). Startup auto-toasts have
 * been removed — notifications live in the /notifications screen.
 */
export function NotificationManager() {
  const { showToast } = useToast();

  useEffect(() => {
    notificationBus.setHandler(showToast);
    return () => notificationBus.setHandler(null);
  }, [showToast]);

  return null;
}
