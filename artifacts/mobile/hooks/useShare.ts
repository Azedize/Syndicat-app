import { Alert, Platform, Share } from "react-native";

export async function shareContent(message: string, title?: string): Promise<void> {
  if (Platform.OS === "web") {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text: message, title });
      } catch {
        // user cancelled or error — silent
      }
    } else {
      try {
        await navigator.clipboard.writeText(message);
        Alert.alert("Copié !", "Le contenu a été copié dans le presse-papier.");
      } catch {
        Alert.alert("Partager", message.slice(0, 200));
      }
    }
  } else {
    try {
      await Share.share({ message, title });
    } catch {
      // user cancelled — silent
    }
  }
}
