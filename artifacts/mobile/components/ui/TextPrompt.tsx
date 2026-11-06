import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

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
  /** Shows these choices instead of a text field; resolves to the chosen one. */
  choices?: { label: string; value: string; destructive?: boolean }[];
  resolve: (value: string | null) => void;
}

let show: ((request: PromptRequest) => void) | null = null;

const isShortChoice = (choice: { label: string }) => [...choice.label].length <= 2;

/**
 * Asks for one line of text; resolves to null when cancelled. React Native only prompts on iOS: on
 * Android it silently does nothing, which left the buttons relying on it without any effect.
 */
export function askText(options: Omit<PromptRequest, "resolve">): Promise<string | null> {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ ...options, resolve });
  });
}

/** Any number of choices: an Android dialog shows three buttons at most and drops the others. */
export function askChoice(options: { title: string; message?: string; choices: { label: string; value: string; destructive?: boolean }[] }): Promise<string | null> {
  return askText(options);
}

interface OptionButton {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

/** Takes the same buttons as Alert.alert, for a list that can exceed three. */
export function showOptions(title: string, buttons: OptionButton[]): void {
  const actions = buttons.filter((b) => b.style !== "cancel");
  askChoice({
    title,
    choices: actions.map((b, i) => ({ label: b.text ?? "", value: String(i), destructive: b.style === "destructive" })),
  }).then((value) => {
    if (value !== null) actions[Number(value)]?.onPress?.();
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
      <KeyboardAvoidingView behavior="padding" style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={() => close(null)} accessibilityLabel={t("cancel")} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityViewIsModal>
          <Text style={[TYPE.bodyStrong, { color: colors.foreground }]}>{request?.title}</Text>
          {request?.choices ? (
            <>
              {request.message ? <Text style={[TYPE.secondary, { color: colors.textMuted }]}>{request.message}</Text> : null}
              <KeyboardAwareScrollViewCompat bottomOffset={24} style={styles.choices} contentContainerStyle={{ gap: SPACING.SM }}>
                {/* Emoji reactions share one line, so the actions below stay in view. */}
                <View style={styles.shortChoices}>
                  {request.choices.filter(isShortChoice).map((choice) => (
                    <Pressable
                      key={choice.value}
                      onPress={() => close(choice.value)}
                      accessibilityRole="button"
                      accessibilityLabel={choice.label}
                      style={[styles.shortChoice, { borderColor: colors.border }]}
                    >
                      <Text style={styles.shortChoiceText}>{choice.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {request.choices.filter((c) => !isShortChoice(c)).map((choice) => (
                  <Button key={choice.value} label={choice.label} variant={choice.destructive ? "destructive" : "secondary"} fullWidth onPress={() => close(choice.value)} />
                ))}
              </KeyboardAwareScrollViewCompat>
            </>
          ) : (
            <TextField label={request?.message ?? request?.title ?? ""} value={value} onChangeText={setValue} autoFocus multiline maxLength={500} />
          )}
          <View style={styles.actions}>
            <Button label={t("cancel")} variant="ghost" size="sm" onPress={() => close(null)} />
            {request?.choices ? null : (
              <Button
                label={request?.confirmLabel ?? t("confirm")}
                variant={request?.destructive ? "destructive" : "primary"}
                size="sm"
                disabled={!!request?.required && !value.trim()}
                onPress={() => close(value.trim())}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: SPACING.LG },
  card: { borderRadius: RADIUS.LG, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.LG, gap: SPACING.MD },
  choices: { maxHeight: 360 },
  shortChoices: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.SM },
  shortChoice: { width: 48, height: 48, borderRadius: RADIUS.MD, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  shortChoiceText: { fontSize: 22 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.SM },
});
