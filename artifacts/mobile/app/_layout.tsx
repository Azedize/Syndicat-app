import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Slot, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AIAssistant } from "@/components/AIAssistant";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { NotificationManager } from "@/components/NotificationManager";
import { SidebarNav } from "@/components/SidebarNav";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import { ToastContainer } from "@/components/ToastContainer";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ActivityProvider } from "@/context/ActivityContext";
import { DataProvider } from "@/context/DataContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { SearchProvider } from "@/context/SearchContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useColors } from "@/hooks/useColors";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// The web preview must render immediately. On native, keep the splash screen
// until the Inter family is ready to avoid a flash of unstyled content.
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

const queryClient = new QueryClient();

function PushSetup() {
  usePushNotifications();
  return null;
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const { isWide } = useBreakpoints();
  const colors = useColors();
  const { isRTL } = useLanguage();

  useEffect(() => {
    if (isLoading) return;
    // Screens accessible without authentication
    const PUBLIC_ROUTES = new Set(["index", "login", "forgot-password", "reset-password", "welcome", "intro", "plans", "get-started", "register", "email-verify", "terms", "privacy"]);
    const inAuthGroup = PUBLIC_ROUTES.has(segments[0] as string);
    // The root route is the public MIZAN welcome page. It owns the
    // unauthenticated landing experience instead of briefly opening the tabs.
    if (!user && !inAuthGroup && segments[0] !== undefined) {
      router.replace("/welcome");
    } else if (user && segments[0] === "login") {
      router.replace("/(tabs)/" as any);
    }
  }, [user, isLoading, segments]);

  const inAuthRoute = segments[0] === "login" ||
    segments[0] === "forgot-password" ||
    segments[0] === "reset-password" ||
    !user;

  const direction = isRTL ? "rtl" : "ltr";

  if (isWide && user && !inAuthRoute && Platform.OS === "web") {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background, direction } as any}>
        <SidebarNav />
        <View style={{ flex: 1, overflow: "hidden" as any }}>
          <SubscriptionBanner />
          <Slot />
          <AIAssistant />
          <ToastContainer />
          <NotificationManager />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, direction } as any}>
      {user && !inAuthRoute && <SubscriptionBanner />}
      <Slot />
      {user && !inAuthRoute && <AIAssistant />}
      {user && !inAuthRoute && <NotificationManager />}
      <ToastContainer />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (Platform.OS !== "web" && (fontsLoaded || fontError)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

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
                <LanguageProvider>
                  <AuthProvider>
                    <DataProvider>
                      <ToastProvider>
                        <ActivityProvider>
                          <FavoritesProvider>
                            <SearchProvider>
                              <KeyboardShortcuts />
                              <PushSetup />
                              <AuthGate />
                            </SearchProvider>
                          </FavoritesProvider>
                        </ActivityProvider>
                      </ToastProvider>
                    </DataProvider>
                  </AuthProvider>
                </LanguageProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
