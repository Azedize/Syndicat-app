import { Platform, type ViewStyle } from "react-native";

interface ShadowOptions {
  color: string;
  offsetX?: number;
  offsetY: number;
  opacity: number;
  radius: number;
  elevation?: number;
}

function colorWithOpacity(color: string, opacity: number): string {
  const hex = color.trim().replace("#", "");
  const normalized = hex.length === 3
    ? hex.split("").map((part) => `${part}${part}`).join("")
    : hex;

  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  return color;
}

/**
 * Keeps the native shadow implementation while using the non-deprecated
 * CSS boxShadow property on React Native Web.
 */
export function crossPlatformShadow({
  color,
  offsetX = 0,
  offsetY,
  opacity,
  radius,
  elevation = 0,
}: ShadowOptions): ViewStyle {
  if (Platform.OS === "web") {
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px ${colorWithOpacity(color, opacity)}`,
    } as ViewStyle;
  }

  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}