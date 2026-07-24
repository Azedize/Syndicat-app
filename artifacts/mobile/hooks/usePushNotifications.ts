/**
 * usePushNotifications
 *
 * Full FCM / Expo Notifications lifecycle:
 *   ✅ Android notification channels
 *   ✅ Permission request
 *   ✅ FCM device token (native) + Expo push token
 *   ✅ Token registration with API
 *   ✅ Foreground notifications (banner + sound)
 *   ✅ Background notifications (handled by FCM natively)
 *   ✅ Closed-app notifications (FCM native + background task)
 *   ✅ Tap / response navigation
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { notificationBus } from "./useNotificationBus";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { registerBackgroundNotificationTask } from "@/tasks/backgroundNotifications";

// ─── Android Notification Channels ───────────────────────────────────────────

interface ChannelDef {
  id: string;
  config: Notifications.NotificationChannelInput;
}

const CHANNELS: ChannelDef[] = [
  {
    id: "default",
    config: {
      name: "Général",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4F7FFF",
      sound: "default",
      showBadge: true,
      description: "Notifications générales SYNDYCAT",
    },
  },
  {
    id: "meetings",
    config: {
      name: "Réunions",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: "#22C55E",
      sound: "default",
      showBadge: true,
      description: "Rappels et convocations de réunion",
    },
  },
  {
    id: "finance",
    config: {
      name: "Finance",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#F59E0B",
      sound: "default",
      showBadge: true,
      description: "Appels de fonds et paiements",
    },
  },
  {
    id: "chat",
    config: {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 100, 100],
      lightColor: "#6366F1",
      sound: "default",
      showBadge: true,
      description: "Messages et conversations",
    },
  },
  {
    id: "alerts",
    config: {
      name: "Alertes",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 500, 1000],
      lightColor: "#EF4444",
      sound: "default",
      showBadge: true,
      description: "Alertes urgentes et incidents",
    },
  },
];

// ─── Foreground handler (must be set before any listener) ────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─── Navigation helper ────────────────────────────────────────────────────────

function handleNotificationTap(
  data: Record<string, string | undefined>
): void {
  if (!data) return;
  try {
    if (data.screen === "meetings") {
      router.push("/meetings" as any);
    } else if (data.screen === "chat" && data.conversationId) {
      router.push(
        `/chat-thread?id=${data.conversationId}&name=${encodeURIComponent(
          data.senderName ?? ""
        )}` as any
      );
    } else if (data.screen === "finance") {
      router.push("/finance" as any);
    } else if (data.screen === "charges") {
      router.push("/charges" as any);
    } else if (data.screen === "documents") {
      router.push("/documents" as any);
    } else if (data.url) {
      router.push(data.url as any);
    }
  } catch {
    // Navigation not ready yet — ignore
  }
}

// ─── Main hook ────────────────────────────────────────────────────────────────

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
        // Background task (no-op in Expo Go, works in EAS builds)
        await registerBackgroundNotificationTask();

        // Physical device required for push notifications
        if (!Device.isDevice) {
          console.log("[Push] Simulateur détecté — notifications non disponibles");
          return;
        }

        // ── Android: create all notification channels ─────────────────────
        if (Platform.OS === "android") {
          await Promise.all(
            CHANNELS.map((ch) =>
              Notifications.setNotificationChannelAsync(ch.id, ch.config)
            )
          );
          console.log("[Push] Android channels créés:", CHANNELS.map((c) => c.id));
        }

        // ── Request permissions ───────────────────────────────────────────
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.warn("[Push] Permission refusée — notifications désactivées");
          return;
        }

        // ── Get FCM device token (native — direct Firebase) ───────────────
        let fcmToken: string | null = null;
        try {
          const deviceToken = await Notifications.getDevicePushTokenAsync();
          fcmToken = deviceToken.data as string;
          console.log("[Push] FCM device token obtenu");
        } catch (err) {
          console.warn("[Push] getDevicePushTokenAsync échoué:", err);
        }

        // ── Get Expo push token (Expo Push Service wrapper) ───────────────
        let expoPushToken: string | null = null;
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          expoPushToken = tokenData.data;
          console.log("[Push] Expo push token obtenu:", expoPushToken);
        } catch (err) {
          console.warn("[Push] getExpoPushTokenAsync échoué (normal en Expo Go):", err);
        }

        // ── Register token(s) with the API ────────────────────────────────
        if (fcmToken || expoPushToken) {
          try {
            await apiRequest(
              "/users/push-token",
              "PUT",
              {
                pushToken: expoPushToken ?? fcmToken,
                fcmToken: fcmToken ?? undefined,
                platform: Platform.OS,
              },
              authToken
            );
            console.log("[Push] Token(s) enregistrés sur le serveur");
          } catch (err) {
            console.warn("[Push] Échec enregistrement token:", err);
          }
        }

        // ── Listener: notification received while app is FOREGROUNDED ─────
        receivedSub = Notifications.addNotificationReceivedListener(
          (notification) => {
            const { title, body, data } = notification.request.content;
            console.log("[Push] Notification reçue (foreground):", title, body);

            if (title || body) {
              notificationBus.emit({
                type: "info",
                message: `${title ?? ""}${body ? " — " + body : ""}`,
              });
            }

            // Auto-navigate for high-priority alerts
            if (data?.autoNavigate) {
              handleNotificationTap(data as Record<string, string>);
            }
          }
        );

        // ── Listener: user tapped a notification (any app state) ──────────
        responseSub = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = (response.notification.request.content.data ??
              {}) as Record<string, string>;
            console.log("[Push] Notification tappée:", data);
            handleNotificationTap(data);
          }
        );

        // ── Handle notification that launched the app (was closed) ────────
        const lastResponse =
          await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) {
          const data = (lastResponse.notification.request.content.data ??
            {}) as Record<string, string>;
          console.log("[Push] App lancée depuis notification:", data);
          handleNotificationTap(data);
        }

        console.log("[Push] Système de notifications initialisé ✓");
      } catch (err) {
        console.error("[Push] Erreur initialisation:", err);
      }
    })();

    return () => {
      receivedSub?.remove();
      responseSub?.remove();
      initialized.current = false;
    };
  }, [user, authToken]);
}
