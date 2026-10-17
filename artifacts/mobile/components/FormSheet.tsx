import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

/**
 * Small form building blocks shared by management screens. They are module
 * level components on purpose: declaring them inside a screen re-creates
 * them on every render, which remounts the sheet and closes the keyboard
 * after each keystroke on Android / iOS.
 */

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
  const colors = useColors();
  const off = busy || disabled;
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: color ?? colors.primary, opacity: off ? 0.55 : 1 }]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
    >
      {busy ? <ActivityIndicator size="small" color="#fff" /> : icon ? <Feather name={icon} size={14} color="#fff" /> : null}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FormSheet({
  visible,
  title,
  onClose,
  children,
  closeLabel = "Fermer",
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  closeLabel?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel={closeLabel} hitSlop={12}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
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
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + "18" : colors.card }]}
          >
            <Text style={{ color: active ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Field label with an optional inline error message. */
export function FieldLabel({ label, error }: { label: string; error?: string | null }) {
  const colors = useColors();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>{label}</Text>
      {error ? <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#ef4444" }}>{error}</Text> : null}
    </View>
  );
}

export const formStyles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
});

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, minHeight: 42 },
  btnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
});
