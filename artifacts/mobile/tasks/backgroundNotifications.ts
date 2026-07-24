/**
 * Background Notification Setup
 *
 * For FCM display notifications (with title + body), Firebase handles
 * background and closed-app delivery natively — no TaskManager needed.
 *
 * expo-task-manager is only required for silent/data-only pushes, which
 * this app does not use. Keeping this file as a clean registration point
 * that is safe to import in both Expo Go (web/dev) and EAS standalone builds.
 */
import * as Notifications from "expo-notifications";

export const BACKGROUND_NOTIFICATION_TASK = "SYNDYCAT_BACKGROUND_NOTIFICATION";

/**
 * Configure the foreground notification handler at module load time.
 * This is idempotent and safe to call multiple times.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * No-op placeholder — real background delivery is handled by native FCM.
 * Call this at startup to remain forward-compatible if TaskManager is added later.
 */
export async function registerBackgroundNotificationTask(): Promise<void> {
  // Native FCM handles background + closed-app display notifications automatically.
  // No TaskManager registration required for standard push use cases.
}
