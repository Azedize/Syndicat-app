import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import SheetHeader from "@/components/ui/SheetHeader";
import { TYPE } from "@/constants/typography";

/**
 * Small form building blocks shared by management screens. They are module
 * level components on purpose: declaring them inside a screen re-creates
 * them on every render, which remounts the sheet and closes the keyboard
 * after each keystroke on Android / iOS.
 */

/** Primary action of a form sheet (a MIZAN Button; `color` only for legacy accents). */
export function ActionButton({
  label,
  onPress,
  color,
  icon,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  icon?: keyof typeof Feather.glyphMap;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      label={label}
      icon={icon}
      onPress={onPress}
      loading={busy}
      disabled={disabled}
      fullWidth
      style={color && !busy && !disabled ? { backgroundColor: color, borderColor: color } : undefined}
    />
  );
}

export function FormSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** @deprecated the close control is labelled by the shared sheet header. */
  closeLabel?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior="padding">
        <SheetHeader title={title} onClose={onClose} />
        <KeyboardAwareScrollViewCompat bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {children}
        </KeyboardAwareScrollViewCompat>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ChoiceChips({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <Chip key={o.key} label={o.label} selected={value === o.key} onPress={() => onChange(o.key)} />
      ))}
    </View>
  );
}

/** Field label with an optional inline error message (icon + text, announced). */
export function FieldLabel({ label, error }: { label: string; error?: string | null }) {
  const colors = useColors();
  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      <Text style={[TYPE.label, { color: colors.foreground }]}>{label}</Text>
      {error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={13} color={colors.danger} />
          <Text style={[TYPE.caption, { color: colors.dangerText, flex: 1 }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const formStyles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 48, fontSize: 15, fontFamily: "Inter_400Regular" },
});
