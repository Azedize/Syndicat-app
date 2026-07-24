/**
 * Background Notification Task
 *
 * Must be imported at the top level BEFORE the app renders
 * so that TaskManager can register the handler while the JS
 * bundle is being loaded (even when the app is closed).
 *
 * Import this file in app/_layout.tsx at the very top.
 */
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

export const BACKGROUND_NOTIFICATION_TASK = "SYNDYCAT_BACKGROUND_NOTIFICATION";

/**
 * Define the background task handler.
 * This runs when a data-only (silent) FCM push arrives
 * and the app is in the background or completely closed.
 */
TaskManager.defineTask(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }: { data: unknown; error: unknown }) => {
    if (error) {
      console.error("[BackgroundNotification] Task error:", error);
      return;
    }
    // `data` contains the FCM payload; expo-notifications handles
    // displaying the notification automatically for display pushes.
    console.log("[BackgroundNotification] Received background notification:", data);
  }
);

/**
 * Register the background task with expo-notifications.
 * Call once at startup (idempotent — safe to call multiple times).
 */
export async function registerBackgroundNotificationTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_NOTIFICATION_TASK
    );
    if (!isRegistered) {
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      console.log("[BackgroundNotification] Task registered");
    }
  } catch (err) {
    // Non-fatal — background task registration fails on Expo Go;
    // it works correctly on standalone EAS builds.
    console.warn("[BackgroundNotification] Task registration skipped:", err);
  }
}
