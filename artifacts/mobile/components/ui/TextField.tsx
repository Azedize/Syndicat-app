import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { CONTROL, RADIUS, SPACING } from "@/constants/spacing";
import { FONT, TYPE } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  required?: boolean;
  error?: string;
  helper?: string;
}

/** Labelled text input with focus ring, helper and accessible error. */
export default function TextField({ label, required, error, helper, editable = true, multiline, ...input }: TextFieldProps) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.focus : colors.border;
  return (
    <View style={styles.field}>
      <Text style={[TYPE.label, { color: colors.foreground }]}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <TextInput
        {...input}
        editable={editable}
        multiline={multiline}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={`${label}${required ? " *" : ""}${error ? `, ${error}` : ""}`}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: colors.foreground,
            backgroundColor: editable ? colors.surface : colors.surfaceMuted,
            borderColor: border,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}
      />
      {error ? (
        <View style={styles.msgRow} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={13} color={colors.danger} />
          <Text style={[TYPE.caption, { color: colors.dangerText, flex: 1 }]}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={[TYPE.caption, { color: colors.textMuted }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: { minHeight: CONTROL.MD, borderRadius: RADIUS.MD, paddingHorizontal: 14, paddingVertical: 10, fontFamily: FONT.regular, fontSize: 15 },
  multiline: { minHeight: 96, textAlignVertical: "top", paddingTop: 12 },
  msgRow: { flexDirection: "row", alignItems: "center", gap: SPACING.XS + 2 },
});
