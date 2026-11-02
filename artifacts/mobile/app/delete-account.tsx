import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "@/components/ScreenHeader";
import { Button, Card, TextField } from "@/components/ui";
import { SPACING } from "@/constants/spacing";
import { TYPE } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/api";

const ERASED = ["delErased1", "delErased2", "delErased3", "delErased4"];
const KEPT = ["delKept1", "delKept2", "delKept3", "delKept4"];

/** Permanent deletion of the signed-in account (required by Google Play). */
export default function DeleteAccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { logout } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await apiRequest("/me/account/delete", "POST", { password });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await logout();
      router.replace("/login");
      Alert.alert(t("delDoneTitle"), t("delDoneMessage"));
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // The server's refusals are written in the app's language; anything else is a connection problem.
      setError(err?.httpStatus ? String(err.message) : t("delNetworkError"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!password) {
      setError(t("delPasswordRequired"));
      return;
    }
    // Alert has no buttons on the web build.
    if (Platform.OS === "web") {
      if (window.confirm(`${t("delConfirmTitle")}\n${t("delConfirmMessage")}`)) void remove();
      return;
    }
    Alert.alert(t("delConfirmTitle"), t("delConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("delConfirmAction"), style: "destructive", onPress: remove },
    ]);
  };

  const list = (keys: string[]) =>
    keys.map((k) => (
      <Text key={k} style={[TYPE.body, styles.item, { color: colors.foreground }]}>
        {"•  "}
        {t(k)}
      </Text>
    ));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("delTitle")} />
      <ScrollView
        contentContainerStyle={{ padding: SPACING.LG, gap: SPACING.LG, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[TYPE.body, { color: colors.foreground }]}>{t("delIntro")}</Text>
        <Card>
          <Text style={[TYPE.subtitle, styles.heading, { color: colors.foreground }]}>{t("delErasedTitle")}</Text>
          {list(ERASED)}
        </Card>
        <Card>
          <Text style={[TYPE.subtitle, styles.heading, { color: colors.foreground }]}>{t("delKeptTitle")}</Text>
          {list(KEPT)}
        </Card>
        <TextField
          label={t("delPasswordLabel")}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setError("");
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          error={error || undefined}
          testID="delete-password"
        />
        <Button
          label={t("delAction")}
          icon="trash-2"
          variant="destructive"
          fullWidth
          loading={busy}
          disabled={busy}
          onPress={confirm}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  heading: { marginBottom: 8 },
  item: { marginTop: 4 },
});
