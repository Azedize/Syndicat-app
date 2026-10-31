// Notifications: in-app alerts (rendered by the server in the user's language),
// read state, delivery preferences and the device push token.
import { request } from "@/services/api/client";

export const notifications = {
  // Rendered by the server in this language, with the link the role may open.
  alerts: (lang?: string) => request<{ data: unknown[] }>(lang ? `/alerts?lang=${encodeURIComponent(lang)}` : "/alerts"),
  markAlertRead: (id: string) =>
    request<{ data: unknown }>(`/alerts/${id}/read`, { method: "PUT" }),
  markAllAlertsRead: () =>
    request<{ message: string }>("/alerts/read-all", { method: "PUT" }),
  registerPushToken: (pushToken: string) =>
    request<{ message: string }>("/users/push-token", {
      method: "PUT",
      body: JSON.stringify({ pushToken }),
    }),
  notificationPrefs: () =>
    request<{ data: unknown[] }>("/notifications/preferences"),
  toggleNotificationPref: (id: string, channel: string, value: boolean) =>
    request<{ data: unknown }>(`/notifications/preferences/${id}`, {
      method: "PUT",
      body: JSON.stringify({ [channel]: value }),
    }),
};
