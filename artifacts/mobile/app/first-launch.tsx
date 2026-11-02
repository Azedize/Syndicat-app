import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MizanMark from "@/components/brand/MizanMark";
import { Button } from "@/components/ui";
import { MIZAN } from "@/constants/brand";
import { RADIUS, SPACING } from "@/constants/spacing";
import { FONT, TYPE } from "@/constants/typography";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { LANG_OPTIONS, type LangCode } from "@/i18n/languages";
import { TRANSLATIONS } from "@/i18n/translations";
import { setFirstLaunchStage } from "@/lib/firstLaunch";

function deviceLanguage(): LangCode {
  try {
    const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);
    return LANG_OPTIONS.find((o) => o.code === code)?.code ?? "fr";
  } catch {
    return "fr";
  }
}

/**
 * First launch: the language comes before everything else, in that language's own words. It is
 * applied on « Continue » because Arabic needs a restart of the app to mirror the screens.
 */
export default function FirstLaunchScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { setLang } = useLanguage();
  const [selected, setSelected] = useState<LangCode>(deviceLanguage);
  const rtl = LANG_OPTIONS.find((o) => o.code === selected)?.rtl ?? false;
  const say = (key: string) => TRANSLATIONS[key]?.[selected] ?? TRANSLATIONS[key]?.fr ?? key;

  const proceed = async () => {
    // Saved first: the language change may restart the app, which then resumes at the next step.
    await setFirstLaunchStage("language");
    setLang(selected);
    router.replace("/welcome");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.XL }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#2B2475", MIZAN.colors.navyDeep]} style={[styles.hero, { paddingTop: insets.top + SPACING.XL }]}>
          <MizanMark size={72} />
          <Text style={[TYPE.title, styles.heroTitle, { writingDirection: rtl ? "rtl" : "ltr" }]}>{say("flTitle")}</Text>
          <Text style={[TYPE.secondary, styles.heroSub, { writingDirection: rtl ? "rtl" : "ltr" }]}>{say("flSubtitle")}</Text>
        </LinearGradient>
        <View style={styles.list} accessibilityRole="radiogroup">
          {LANG_OPTIONS.map((option) => {
            const active = option.code === selected;
            return (
              <Pressable
                key={option.code}
                onPress={() => setSelected(option.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={option.nativeLabel}
                testID={`first-launch-${option.code}`}
                style={[
                  styles.option,
                  { backgroundColor: colors.card, borderColor: active ? colors.primary : colors.border },
                ]}
              >
                <Text style={styles.flag} importantForAccessibility="no">{option.flag}</Text>
                <Text style={[styles.optionLabel, { color: colors.text }]}>{option.nativeLabel}</Text>
                {active ? <Feather name="check-circle" size={22} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.footer}>
          <Button label={say("flContinue")} fullWidth onPress={proceed} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { alignItems: "center", paddingHorizontal: SPACING.XL, paddingBottom: SPACING.XL, gap: SPACING.MD },
  heroTitle: { color: "#FFFFFF", textAlign: "center" },
  heroSub: { color: "#D9D5F5", textAlign: "center" },
  list: { padding: SPACING.LG, gap: SPACING.SM },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.MD,
    minHeight: 56,
    paddingHorizontal: SPACING.LG,
    borderRadius: RADIUS.MD,
    borderWidth: 1.5,
  },
  flag: { fontSize: 22 },
  optionLabel: { flex: 1, fontFamily: FONT.semibold, fontSize: 16 },
  footer: { paddingHorizontal: SPACING.LG },
});
