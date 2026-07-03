import { Platform, useWindowDimensions } from "react-native";

export const BREAKPOINTS = { tablet: 768, desktop: 1024 } as const;
export const SIDEBAR_FULL = 240;
export const SIDEBAR_COMPACT = 68;
export const MAX_CONTENT_WIDTH = 1200;

export function useBreakpoints() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  if (!isWeb) {
    return {
      width,
      height,
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      isWide: false,
      sidebarWidth: 0,
    };
  }

  const isMobile = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    isWide: !isMobile,
    sidebarWidth: isDesktop ? SIDEBAR_FULL : isTablet ? SIDEBAR_COMPACT : 0,
  };
}
