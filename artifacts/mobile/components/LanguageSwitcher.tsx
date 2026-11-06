import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Modal from "@/components/ui/AppModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONT } from "@/constants/typography";
import { LANG_OPTIONS, type LangCode, useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  /** onDark: on the welcome hero (white on night); surface: on a light/dark card. */
  variant?: "onDark" | "surface";
  testID?: string;
}

/**
 * Language choice available before signing in (welcome, login, sign-up…).
 * It uses the app's own setLang: the choice is saved, applies to every screen,
 * and switching to or from Arabic restarts the app so the layout mirrors.
 */
export default function LanguageSwitcher({ variant = "surface", testID = "language-switcher" }: Props) {
  const { lang, setLang, t, isRTL } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const onDark = variant === "onDark";
  const current = LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0];

  const choose = (code: LangCode) => {
    setOpen(false);
    if (code === lang) return;
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
    setLang(code);
  };

  return (
    <>
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t("language")} : ${current.nativeLabel}`}
        accessibilityHint={t("chooseLanguage")}
        hitSlop={6}
        style={({ pressed }) => [
          styles.chip,
          onDark
            ? { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.22)" }
            : { backgroundColor: colors.card, borderColor: colors.border },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Feather name="globe" size={15} color={onDark ? "#FFFFFF" : colors.tint} />
        <Text style={[styles.chipText, { color: onDark ? "#FFFFFF" : colors.foreground }]}>{current.code.toUpperCase()}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t("close")}>
          <Pressable
            onPress={() => {}}
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 12, direction: isRTL ? "rtl" : "ltr" }]}
            accessibilityViewIsModal
          >
            <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">{t("chooseLanguage")}</Text>
            {LANG_OPTIONS.map((o) => {
              const on = o.code === lang;
              return (
                <Pressable
                  key={o.code}
                  testID={`language-option-${o.code}`}
                  onPress={() => choose(o.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLanguage={o.code}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : "transparent" },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.rowLabel, { color: colors.foreground, writingDirection: o.rtl ? "rtl" : "ltr" }]}>{o.nativeLabel}</Text>
                  {on ? <Feather name="check" size={18} color={colors.tint} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  chipText: { fontFamily: FONT.semibold, fontSize: 13, letterSpacing: 0.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(14,12,28,0.55)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, gap: 10, width: "100%", maxWidth: 560, alignSelf: "center" },
  title: { fontFamily: FONT.display, fontSize: 20, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1 },
  rowLabel: { fontFamily: FONT.medium, fontSize: 16 },
});
