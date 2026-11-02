import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

import { getLastLanguage } from "@/context/LanguageContext";
import { TRANSLATIONS } from "@/i18n/translations";

import { nextPermissionStep } from "./permissionFlow";

/** This module is called outside of components, so it reads the current language itself. */
export const say = (key: string) => TRANSLATIONS[key]?.[getLastLanguage()] ?? TRANSLATIONS[key]?.fr ?? key;

/** A two-button dialog that resolves to true when the user confirms. */
export function confirmDialog(title: string, message: string, confirm: string, cancel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancel, style: "cancel", onPress: () => resolve(false) },
        { text: confirm, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * To call when the user asks for the camera. Explains the request first; when the system will not
 * ask again (permanently denied, restricted), offers its settings. Choosing an existing image does
 * not need this permission and stays available to a user who refused.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  const state = await ImagePicker.getCameraPermissionsAsync();
  const step = nextPermissionStep(state);
  if (step === "granted") return true;
  if (step === "settings") {
    const open = await confirmDialog(say("permCameraTitle"), say("permCameraBlocked"), say("permOpenSettings"), say("permNotNow"));
    if (open) await Linking.openSettings().catch(() => {});
    return false;
  }
  const accepted = await confirmDialog(say("permCameraTitle"), say("permCameraWhy"), say("permContinue"), say("permNotNow"));
  if (!accepted) return false;
  return (await ImagePicker.requestCameraPermissionsAsync()).granted;
}
