import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { RADIUS, SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

import Button from "./Button";
import TextField from "./TextField";

interface PromptRequest {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** The confirm button stays disabled while the field is empty. */
  required?: boolean;
  resolve: (value: string | null) => void;
}

let show: ((request: PromptRequest) => void) | null = null;

/**
 * Asks for one line of text; resolves to null when cancelled. Alert.prompt only works on iOS: on
 * Android it silently does nothing, which left the buttons relying on it without any effect.
 */
export function askText(options: Omit<PromptRequest, "resolve">): Promise<string | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ ...options, resolve });
  });
}

/** Mounted once, at the root of the app. */
export function TextPromptHost() {
  const colors = useColors();
  const { t } = useLanguage();
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    show = (next) => {
      setValue(next.defaultValue ?? "");
      setRequest(next);
    };
    return () => {
      show = null;
    };
  }, []);

  const close = (result: string | null) => {
    request?.resolve(result);
    setRequest(null);
  };

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => close(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={() => close(null)} accessibilityLabel={t("cancel")} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityViewIsModal>
          <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{request?.title}</Text>
          <TextField label={request?.message ?? request?.title ?? ""} value={value} onChangeText={setValue} autoFocus multiline maxLength={500} />
          <View style={styles.actions}>
            <Button label={t("cancel")} variant="ghost" size="sm" onPress={() => close(null)} />
            <Button
              label={request?.confirmLabel ?? t("confirm")}
              variant={request?.destructive ? "destructive" : "primary"}
              size="sm"
              disabled={!!request?.required && !value.trim()}
              onPress={() => close(value.trim())}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: SPACING.LG },
  card: { borderRadius: RADIUS.LG, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.LG, gap: SPACING.MD },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.SM },
});
