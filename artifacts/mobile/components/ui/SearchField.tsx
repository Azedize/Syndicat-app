import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { CONTROL, RADIUS } from "@/constants/spacing";
import { FONT } from "@/constants/typography";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

interface SearchFieldProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
}

/** Search input of list screens: icon, clear button, RTL-aware text. */
export default function SearchField({ value, onChangeText, placeholder, style, autoFocus }: SearchFieldProps) {
  const colors = useColors();
  const { t } = useLanguage();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      <Feather name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.foreground }]}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus={autoFocus}
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("uiClearSearch")}>
          <Feather name="x-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: CONTROL.MD, borderRadius: RADIUS.MD, borderWidth: 1, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: FONT.regular, fontSize: 15, paddingVertical: 10 },
});
