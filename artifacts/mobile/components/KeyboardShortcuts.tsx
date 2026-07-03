import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

export function KeyboardShortcuts() {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handler = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;

      // Cmd+K or Ctrl+K — open global search
      if (isCmd && e.key === "k") {
        e.preventDefault();
        router.push("/search" as any);
        return;
      }

      // Cmd+/ — show shortcuts hint (do nothing for now)
      if (isCmd && e.key === "/") {
        e.preventDefault();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return null;
}
