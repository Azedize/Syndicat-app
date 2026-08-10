import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBreakpoints } from "@/hooks/useBreakpoints";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

interface ActionButton {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  color?: string;
  onBack?: () => void;
  action?: ActionButton;
  action2?: ActionButton;
  rightContent?: React.ReactNode;
}

export default function ScreenHeader({
  title,
  subtitle,
  color,
  onBack,
  action,
  action2,
  rightContent,
}: Props) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const goBack = useBackNavigation();

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const handleBack = onBack ?? goBack;
  const headerColor = color ?? colors.primary;

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: headerColor,
          paddingTop: topPad + 14,
          direction: isRTL ? "rtl" : "ltr",
        },
      ]}
    >
      <TouchableOpacity
        onPress={handleBack}
        style={styles.backBtn}
        hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
        accessibilityRole="button"
      >
        <Feather
          name={isRTL ? "arrow-right" : "arrow-left"}
          size={22}
          color={colors.primaryForeground}
        />
      </TouchableOpacity>

      <View style={styles.titles}>
        <Text
          style={[styles.title, { color: colors.primaryForeground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              { color: colors.primaryForeground + "CC" },
            ]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightContent ? (
        <View style={styles.rightSlot}>{rightContent}</View>
      ) : (
        <View style={styles.actions}>
          {action2 ? (
            <TouchableOpacity
              onPress={action2.onPress}
              style={styles.actionBtn}
              hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={action2.label}
            >
              <Feather
                name={action2.icon}
                size={20}
                color={colors.primaryForeground}
              />
            </TouchableOpacity>
          ) : null}
          {action ? (
            <TouchableOpacity
              onPress={action.onPress}
              style={styles.actionBtn}
              hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Feather
                name={action.icon}
                size={20}
                color={colors.primaryForeground}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    minHeight: 56,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  rightSlot: {
    flexShrink: 0,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});
