import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { crossPlatformShadow } from "@/lib/shadow";
import { getLastLanguage } from "@/context/LanguageContext";

const TEXTS = {
  details: { fr: "Voir les détails de l'erreur", en: "Show the error details", ar: "عرض تفاصيل الخطأ", es: "Ver los detalles del error" },
  title: { fr: "Une erreur s'est produite", en: "Something went wrong", ar: "حدث خطأ", es: "Se ha producido un error" },
  message: { fr: "Veuillez recharger l'application pour continuer.", en: "Please reload the app to continue.", ar: "يرجى إعادة تحميل التطبيق للمتابعة.", es: "Vuelva a cargar la aplicación para continuar." },
  retry: { fr: "Réessayer", en: "Try again", ar: "إعادة المحاولة", es: "Reintentar" },
  detailsTitle: { fr: "Détails de l'erreur", en: "Error details", ar: "تفاصيل الخطأ", es: "Detalles del error" },
  close: { fr: "Fermer", en: "Close", ar: "إغلاق", es: "Cerrar" },
} as const;

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

const COLORS = {
  background: "#F7F4EE",
  card: "#ffffff",
  foreground: "#0E0C1C",
  muted: "#6A6680",
  primary: "#5A4AD6",
  primaryForeground: "#ffffff",
  border: "#E7E1D6",
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const lang = getLastLanguage();
  const tx = (k: keyof typeof TEXTS) => TEXTS[k][lang] ?? TEXTS[k].fr;
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch {
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  const monoFont = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      {__DEV__ ? (
        <Pressable
          onPress={() => setIsModalVisible(true)}
          accessibilityLabel={tx("details")}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.topButton,
            {
              top: 48,
              backgroundColor: COLORS.card,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="alert-circle" size={20} color={COLORS.foreground} />
        </Pressable>
      ) : null}

      <View style={styles.content}>
        <View style={styles.iconWrapper}>
          <Feather name="alert-triangle" size={40} color={COLORS.primary} />
        </View>

        <Text style={[styles.title, { color: COLORS.foreground }]}>
          {tx("title")}
        </Text>

        <Text style={[styles.message, { color: COLORS.muted }]}>
          {tx("message")}
        </Text>

        <Pressable
          onPress={handleRestart}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: COLORS.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: COLORS.primaryForeground }]}>
            {tx("retry")}
          </Text>
        </Pressable>
      </View>

      {__DEV__ ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: COLORS.background }]}>
              <View style={[styles.modalHeader, { borderBottomColor: COLORS.border }]}>
                <Text style={[styles.modalTitle, { color: COLORS.foreground }]}>
                  {tx("detailsTitle")}
                </Text>
                <Pressable
                  onPress={() => setIsModalVisible(false)}
                  accessibilityLabel={tx("close")}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.closeButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather name="x" size={24} color={COLORS.foreground} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator
              >
                <View style={[styles.errorContainer, { backgroundColor: COLORS.card }]}>
                  <Text
                    style={[
                      styles.errorText,
                      { color: COLORS.foreground, fontFamily: monoFont },
                    ]}
                    selectable
                  >
                    {formatErrorDetails()}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    maxWidth: 600,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E4F2F4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  topButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 10,
    paddingHorizontal: 32,
    minWidth: 200,
    ...crossPlatformShadow({ color: "#5A4AD6", offsetY: 2, opacity: 0.2, radius: 4, elevation: 3 }),
    marginTop: 8,
  },
  buttonText: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    width: "100%",
    height: "90%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollView: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 32 },
  errorContainer: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    padding: 16,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    width: "100%",
  },
});
