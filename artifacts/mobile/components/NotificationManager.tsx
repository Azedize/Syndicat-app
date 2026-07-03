import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import { notificationBus } from "@/hooks/useNotificationBus";

export function NotificationManager() {
  const { user } = useAuth();
  const { toasts, showToast } = useToast();
  const { cotisations, elections, supportTickets, alerts } = useData();
  const initialized = useRef(false);
  const prevTicketCount = useRef(supportTickets.length);
  const prevElectionCount = useRef(elections.length);
  const prevAlertCount = useRef(alerts.length);

  useEffect(() => {
    notificationBus.setHandler(showToast);
    return () => notificationBus.setHandler(null);
  }, [showToast]);

  useEffect(() => {
    if (!user) return;
    if (initialized.current) return;
    initialized.current = true;

    const timer = setTimeout(() => {
      const isAdmin = user.role !== "member";
      const overdue = cotisations.filter((c) => c.status === "overdue");
      const openElec = elections.filter((e) => e.status === "open");
      const unreadAlerts = alerts.filter((a) => !a.read);

      if (openElec.length > 0) {
        showToast({
          type: "info",
          message: `${openElec.length} élection(s) en cours — votre vote est attendu`,
        });
      }

      if (overdue.length > 0 && user.role === "member") {
        setTimeout(() => {
          showToast({
            type: "warning",
            message: `${overdue.length} cotisation(s) en retard — régularisez votre situation`,
          });
        }, 1200);
      }

      if (isAdmin && unreadAlerts.length > 0) {
        setTimeout(() => {
          showToast({
            type: "info",
            message: `${unreadAlerts.length} alerte(s) non lue(s) dans votre tableau de bord`,
          });
        }, 2400);
      }

      if (isAdmin) {
        const openTickets = supportTickets.filter((t) => t.status === "open");
        if (openTickets.length > 0) {
          setTimeout(() => {
            showToast({
              type: "warning",
              message: `${openTickets.length} ticket(s) support en attente de traitement`,
            });
          }, 3600);
        }
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!initialized.current) return;
    const newCount = supportTickets.length;
    if (newCount > prevTicketCount.current) {
      const isAdmin = user?.role !== "member";
      if (isAdmin) {
        showToast({ type: "warning", message: "Nouveau ticket support créé — en attente de traitement" });
      } else {
        showToast({ type: "success", message: "Votre ticket support a été soumis avec succès" });
      }
    }
    prevTicketCount.current = newCount;
  }, [supportTickets.length]);

  useEffect(() => {
    if (!initialized.current) return;
    const newCount = elections.length;
    if (newCount > prevElectionCount.current) {
      showToast({ type: "info", message: "Nouvelle élection créée — les membres peuvent voter" });
    }
    prevElectionCount.current = newCount;
  }, [elections.length]);

  useEffect(() => {
    if (!initialized.current) return;
    const newCount = alerts.length;
    if (newCount > prevAlertCount.current) {
      showToast({ type: "info", message: "Nouvelle alerte reçue — consultez votre tableau de bord" });
    }
    prevAlertCount.current = newCount;
  }, [alerts.length]);

  return null;
}
