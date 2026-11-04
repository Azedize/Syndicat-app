import { purgeDocumentCache } from "@/features/documents/documentFiles";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Fraunces_500Medium, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { NotoKufiArabic_500Medium, NotoKufiArabic_600SemiBold } from "@expo-google-fonts/noto-kufi-arabic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, router, Slot, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useMemo } from "react";
import { Platform, StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { NotificationManager } from "@/features/notifications/components/NotificationManager";
import SubscriptionBanner from "@/features/subscriptions/components/SubscriptionBanner";
import { ToastContainer } from "@/components/ToastContainer";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ActivityProvider } from "@/context/ActivityContext";
import { DataProvider } from "@/context/DataContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/api";
import { publicHome, setFirstLaunchStage } from "@/lib/firstLaunch";
import { SearchProvider } from "@/context/SearchContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { useColors } from "@/hooks/useColors";
import { usePushNotifications } from "@/features/notifications/hooks/usePushNotifications";

// The web preview must render immediately. On native, keep the splash screen
// until the Inter family is ready to avoid a flash of unstyled content.
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

const queryClient = new QueryClient();

/**
 * The native splash stays until the first useful frame can be drawn: fonts
 * (gated above), the saved theme and the session check. A slow network never
 * holds it longer than SPLASH_MAX_MS: the app then shows its own loading state.
 */
const SPLASH_MAX_MS = 4000;
function SplashGate() {
  const { ready: themeReady } = useTheme();
  const { isLoading } = useAuth();
  const hidden = React.useRef(false);
  useEffect(() => {
    const hide = () => {
      if (hidden.current) return;
      hidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    };
    if (themeReady && !isLoading) hide();
    const t = setTimeout(hide, SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, [themeReady, isLoading]);
  return null;
}

function PushSetup() {
  usePushNotifications();
  return null;
}

/**
 * The server learns the user's language, so push notifications arrive in it.
 * Sent once per signed-in user and language; a failure is retried next change.
 */
function LanguageSync() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const sent = React.useRef<string | null>(null);
  useEffect(() => {
    if (!user) { sent.current = null; return; }
    const tag = `${user.id}:${lang}`;
    if (sent.current === tag) return;
    sent.current = tag;
    apiRequest("/profile", "PUT", { language: lang }).catch(() => { sent.current = null; });
  }, [user?.id, lang]);
  return null;
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const colors = useColors();
  const { isRTL } = useLanguage();

  useEffect(() => {
    if (isLoading) return;
    // Screens accessible without authentication
    const PUBLIC_ROUTES = new Set(["index", "first-launch", "login", "forgot-password", "reset-password", "welcome", "intro", "plans", "get-started", "register", "email-verify", "privacy", "cgu"]);
    const inAuthGroup = PUBLIC_ROUTES.has(segments[0] as string);
    // The root route is the public MIZAN welcome page. It owns the
    // unauthenticated landing experience instead of briefly opening the tabs.
    if (!user && !inAuthGroup && segments[0] !== undefined) {
      publicHome().then((home) => router.replace(home));
    } else if (user?.mustChangePassword && (segments[0] as string) !== "change-password") {
      // Temporary (invitation) credentials: the API refuses everything else
      // until the password is changed, so do not show the app shell.
      router.replace("/change-password" as any);
    } else if (user && segments[0] === "login") {
      router.replace("/(tabs)/" as any);
    }
  }, [user, isLoading, segments]);

  // A signed-in user has been through the presentation: signing out leads to the sign-in screen.
  useEffect(() => {
    if (user) setFirstLaunchStage("done");
  }, [user?.id]);

  const inAuthRoute = segments[0] === "login" ||
    (segments[0] as string) === "change-password" ||
    segments[0] === "forgot-password" ||
    segments[0] === "reset-password" ||
    !user;

  const direction = isRTL ? "rtl" : "ltr";

  return (
    <View style={{ flex: 1, direction } as any}>
      {user && !inAuthRoute && <SubscriptionBanner />}
      <Slot />
      {user && !inAuthRoute && <NotificationManager />}
      <ToastContainer />
    </View>
  );
}

/**
 * Everything that holds condominium data lives below this key: switching
 * condominium (or role) remounts it, so no list, counter, selection, timer or
 * in-flight request of the previous condominium can surface in the new one.
 */
function ContextScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const scope = `${user?.id ?? "anon"}:${user?.syndicateId ?? "none"}:${user?.role ?? "none"}`;
  // One query cache per context: nothing cached for the previous account or
  // condominium can be read in the new one. (Clearing a shared cache in an
  // effect ran *after* the remounted screens had started their queries and
  // left them loading forever on a reload or a condominium switch.)
  const scopedClient = useMemo(() => new QueryClient(), [scope]);
  useEffect(() => {
    // Downloaded library files belong to the previous context.
    void purgeDocumentCache();
  }, [scope]);
  return (
    <QueryClientProvider client={scopedClient}>
      <DataProvider key={scope}>{children}</DataProvider>
    </QueryClientProvider>
  );
}

/**
 * The navigators' own background (behind screens, during transitions and at
 * the end of a scroll) follows the app's theme. Without it React Navigation
 * paints its light default (#F2F2F2) under every screen, a white flash in dark
 * mode.
 */
function NavigationTheme({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  const colors = useColors();
  const base = isDark ? DarkTheme : DefaultTheme;
  const value = useMemo(
    () => ({
      ...base,
      dark: isDark,
      colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.card, text: colors.foreground, border: colors.border, notification: colors.danger },
    }),
    [base, isDark, colors],
  );
  return (
    <NavigationThemeProvider value={value}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {children}
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    NotoKufiArabic_500Medium,
    NotoKufiArabic_600SemiBold,
  });


  // Never block the public landing page on web font loading. The browser
  // safely falls back to its system font and swaps to Inter when available.
  if (Platform.OS !== "web" && !fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <ThemeProvider>
                <NavigationTheme>
                <LanguageProvider>
                  <AuthProvider>
                    <ContextScope>
                      <ToastProvider>
                        <ActivityProvider>
                          <FavoritesProvider>
                            <SearchProvider>
                              <KeyboardShortcuts />
                              <SplashGate />
                              <PushSetup />
                              <LanguageSync />
                              <AuthGate />
                            </SearchProvider>
                          </FavoritesProvider>
                        </ActivityProvider>
                      </ToastProvider>
                    </ContextScope>
                  </AuthProvider>
                </LanguageProvider>
                </NavigationTheme>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
