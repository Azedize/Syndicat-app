import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { notificationBus } from "./useNotificationBus";
import { useAuth } from "@/context/AuthContext";

export function usePushNotifications() {
  const initialized = useRef(false);
  const { token: authToken, user } = useAuth();

  useEffect(() => {
    if (initialized.current || Platform.OS === "web") return;
    if (!user || !authToken) return;
    initialized.current = true;

    let receivedSub: { remove(): void } | null = null;
    let responseSub: { remove(): void } | null = null;

    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const Device = await import("expo-device");

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowAlert: true,
          }),
        });

        if (!Device.default.isDevice) return;

        const perms = await Notifications.getPermissionsAsync() as any;
        let granted: boolean = Boolean(perms.granted ?? (perms.status === "granted"));

        if (!granted) {
          const req = await Notifications.requestPermissionsAsync() as any;
          granted = Boolean(req.granted ?? (req.status === "granted"));
        }

        if (!granted) return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#4F7FFF",
          });
        }

        const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
        if (tokenData?.data) {
          const { apiRequest } = await import("@/lib/api");
          await apiRequest(
            "/users/push-token",
            "PUT",
            { pushToken: tokenData.data },
            authToken,
          ).catch(() => {});
        }

        receivedSub = Notifications.addNotificationReceivedListener((notification) => {
          const { title, body } = notification.request.content;
          if (title || body) {
            notificationBus.emit({
              type: "info",
              message: `${title ?? ""}${body ? " — " + body : ""}`,
            });
          }
        });

        responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = (response.notification.request.content.data ?? {}) as Record<string, string>;
          if (data.screen === "meetings") {
            router.push("/meetings" as any);
          } else if (data.screen === "chat" && data.conversationId) {
            router.push(
              `/chat-thread?id=${data.conversationId}&name=${encodeURIComponent(data.senderName ?? "")}` as any,
            );
          }
        });
      } catch {
        // expo-notifications non disponible en dev web — ignoré
      }
    })();

    return () => {
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, [user, authToken]);
}
