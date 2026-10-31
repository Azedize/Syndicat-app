import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextType {
  /** The user's choice: light, dark, or follow the system. */
  mode: ThemeMode;
  /** The theme actually shown. */
  isDark: boolean;
  /** The saved choice has been read: the first frame can use the right theme. */
  ready: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "syndycat_theme_mode";

/**
 * The app's theme: the choice is saved and read back before the splash screen
 * hides (see SplashGate in app/_layout.tsx), so a dark-mode user never sees a
 * light first frame. « system » follows the device as it changes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
      })
      // Unreadable storage: follow the system rather than block the start.
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");

  const toggle = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  const value = useMemo(() => ({ mode, isDark, ready, setMode, toggle }), [mode, isDark, ready, setMode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
