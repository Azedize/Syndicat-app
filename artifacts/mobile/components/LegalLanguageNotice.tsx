import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

/**
 * Legal texts exist in French only for now. They have not been translated by
 * a lawyer, so in the other languages the page says so plainly instead of
 * showing a machine translation of a contract.
 */
export default function LegalLanguageNotice() {
  const { t, lang } = useLanguage();
  const colors = useColors();
  if (lang === "fr") return null;
  return (
    <View
      style={[styles.box, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}
      accessibilityRole="alert"
    >
      <Feather name="globe" size={16} color={colors.warningText} />
      <Text style={[styles.text, { color: colors.warningText }]}>{t("legalFrenchOnly")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "flex-start", marginBottom: 12 },
  text: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: "Inter_500Medium" },
});
