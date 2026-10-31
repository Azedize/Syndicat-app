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
  helper?: string;
  required?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  iconColor?: string;
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
  helper,
  required = false,
  disabled = false,
  accessibilityLabel,
  iconColor,
  children,
  trailing,
}: Props) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const stateColor = error
    ? colors.destructive
    : focused
      ? colors.primary
      : colors.border;

  return (
    <View style={styles.field}>
      <Text
        style={[
          styles.label,
          {
            color: error ? colors.destructive : colors.foreground,
            textAlign: "auto",
          },
        ]}
      >
        {label}
        {required ? " *" : ""}
      </Text>
      <View
        accessible
        accessibilityLabel={`${accessibilityLabel ?? label}${required ? " *" : ""}${error ? `, ${error}` : ""}`}
        accessibilityState={{ disabled }}
        style={[
          styles.inputRow,
          {
            backgroundColor: disabled ? colors.surfaceMuted : colors.surface,
            borderColor: stateColor,
            opacity: disabled ? 0.7 : 1,
          },
        ]}
      >
        <Feather
          name={icon}
          size={18}
          color={
            error
              ? colors.destructive
              : (iconColor ??
                (focused ? colors.primary : colors.mutedForeground))
          }
        />
        <View style={styles.inputContent}>{children}</View>
        {trailing}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={13} color={colors.danger} />
          <Text
            style={[
              styles.error,
              { color: colors.dangerText, textAlign: "auto" },
            ]}
          >
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text
          style={[
            styles.helper,
            {
              color: colors.mutedForeground,
              textAlign: "auto",
            },
          ]}
        >
          {helper}
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
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  error: {
    flex: 1,
    fontSize: TYPOGRAPHY.SM + 1,
    fontFamily: "Inter_500Medium",
  },
  helper: {
    fontSize: TYPOGRAPHY.SM,
    fontFamily: "Inter_400Regular",
  },
});
