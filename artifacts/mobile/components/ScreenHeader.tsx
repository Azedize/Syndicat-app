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
  color = "#1E3A5F",
  onBack,
  action,
  action2,
  rightContent,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoints();
  const goBack = useBackNavigation();

  const topPad = isWide ? 0 : Platform.OS === "web" ? 67 : insets.top;

  const handleBack = onBack ?? goBack;

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: color, paddingTop: topPad + 14 },
      ]}
    >
      <TouchableOpacity
        onPress={handleBack}
        style={styles.backBtn}
        hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
      >
        <Feather name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
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
            >
              <Feather name={action2.icon} size={20} color="#fff" />
            </TouchableOpacity>
          ) : null}
          {action ? (
            <TouchableOpacity
              onPress={action.onPress}
              style={styles.actionBtn}
              hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
            >
              <Feather name={action.icon} size={20} color="#fff" />
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
    borderRadius: 12,
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
    color: "#fff",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
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
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});
