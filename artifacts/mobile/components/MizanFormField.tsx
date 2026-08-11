import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { RADIUS, SPACING, TYPOGRAPHY } from "@/constants/spacing";
import { useLanguage } from "@/context/LanguageContext";

interface Props {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  focused?: boolean;
  error?: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}

/**
 * Shared MIZAN field shell.
 *
 * Keeping the label, focus ring, icon, and validation treatment together
 * prevents authentication and operational forms from drifting into different
 * visual languages while still allowing each screen to own its input props.
 */
export default function MizanFormField({
  label,
  icon,
  focused = false,
  error,
  children,
  trailing,
}: Props) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const stateColor = error ? colors.destructive : focused ? colors.primary : colors.border;

  return (
    <View style={styles.field}>
      <Text
        style={[
          styles.label,
          { color: error ? colors.destructive : colors.foreground, textAlign: isRTL ? "right" : "left" },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.input + "22",
            borderColor: stateColor,
          },
        ]}
      >
        <Feather
          name={icon}
          size={18}
          color={error ? colors.destructive : focused ? colors.primary : colors.mutedForeground}
        />
        <View style={styles.inputContent}>{children}</View>
        {trailing}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.destructive, textAlign: isRTL ? "right" : "left" }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: SPACING.SM,
  },
  label: {
    fontSize: TYPOGRAPHY.BASE,
    fontFamily: "Inter_600SemiBold",
  },
  inputRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.MD,
    paddingHorizontal: SPACING.LG,
    borderWidth: 1.5,
    borderRadius: RADIUS.LG,
  },
  inputContent: {
    flex: 1,
    minWidth: 0,
  },
  error: {
    fontSize: TYPOGRAPHY.SM,
    fontFamily: "Inter_500Medium",
  },
});