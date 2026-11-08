import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Whether the app is in the foreground. Periodic refreshes (conversations,
 * notifications, an open chat) stop while it is in the background: nobody
 * sees them, they cost battery and data, and every phone behind the same
 * carrier IP shares the server's per-IP request budget.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => setActive(state === "active"));
    return () => sub.remove();
  }, []);
  return active;
}
